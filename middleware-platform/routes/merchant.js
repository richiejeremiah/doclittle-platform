/**
 * MERCHANT ROUTES
 * API for merchants to register and sync their products
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const db = require('../database');
const UniversalAdapter = require('../adapters/universal-adapter');

const router = express.Router();

const ALLOWED_PLATFORMS = ['acp', 'ap2'];

/**
 * Safe JSON parse helper
 */
function safeParse(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;

    try {
        const parsed = JSON.parse(data);
        // Check if we need to parse again (double-stringified)
        if (typeof parsed === 'string') {
            return JSON.parse(parsed);
        }
        return parsed;
    } catch (err) {
        return null;
    }
}

/**
 * Register a new merchant
 * POST /api/merchant/register
 */
router.post('/register', async (req, res) => {
    try {
        const { name, api_url, webhook_url, enabled_platforms } = req.body;

        if (!name || !api_url) {
            return res.status(400).json({
                success: false,
                error: 'Name and API URL are required'
            });
        }

        // Generate unique API key for merchant
        const apiKey = `mk_${crypto.randomBytes(32).toString('hex')}`;

        // sanitize incoming enabled platforms (whitelist)
        let platforms = ['acp']; // default
        if (Array.isArray(enabled_platforms) && enabled_platforms.length > 0) {
            platforms = enabled_platforms
                .map(p => String(p).toLowerCase().trim())
                .filter(p => ALLOWED_PLATFORMS.includes(p));
            if (platforms.length === 0) platforms = ['acp'];
        }

        const merchant = {
            id: uuidv4(),
            name,
            api_key: apiKey,
            api_url,
            webhook_url,
            enabled_platforms: platforms
        };

        db.createMerchant(merchant);

        res.json({
            success: true,
            message: 'Merchant registered successfully',
            merchant: {
                id: merchant.id,
                name: merchant.name,
                api_key: apiKey,
                enabled_platforms: merchant.enabled_platforms
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Sync merchant products to AI platforms
 * POST /api/merchant/sync
 */
router.post('/sync', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required'
            });
        }

        const merchant = db.getMerchantByApiKey(apiKey);

        if (!merchant) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        // Fetch products from merchant's API (normalize trailing slash)
        const response = await axios.get(`${merchant.api_url.replace(/\/$/, '')}/api/products`);
        const merchantProducts = response.data.products || [];

        const syncResults = [];

        for (const product of merchantProducts) {
            // Convert to a universal internal format first
            const universalProduct = UniversalAdapter.toUniversalFormat(product);

            // Per-platform conversions
            const acpProduct = UniversalAdapter.toACPFormat(universalProduct);
            const ap2Product = UniversalAdapter.toAP2Format(universalProduct);

            // Store sync records for each enabled platform
            if (merchant.enabled_platforms.includes('acp')) {
                const syncAcp = {
                    id: uuidv4(),
                    merchant_id: merchant.id,
                    merchant_product_id: product.id,
                    platform: 'acp',
                    platform_product_id: acpProduct.id || product.id,
                    sync_status: 'synced',
                    product_data: acpProduct, // Pass object directly
                    universal_data: universalProduct // Pass object directly
                };
                db.syncProduct(syncAcp);
            }

            if (merchant.enabled_platforms.includes('ap2')) {
                const syncAp2 = {
                    id: uuidv4(),
                    merchant_id: merchant.id,
                    merchant_product_id: product.id,
                    platform: 'ap2',
                    platform_product_id: ap2Product.id || product.id,
                    sync_status: 'synced',
                    product_data: ap2Product, // Pass object directly
                    universal_data: universalProduct // Pass object directly
                };
                db.syncProduct(syncAp2);
            }

            syncResults.push({
                merchant_product_id: product.id,
                universal: universalProduct,
                acp: acpProduct,
                ap2: ap2Product
            });
        }

        res.json({
            success: true,
            message: `Synced ${syncResults.length} products (per-platform records created)`,
            products: syncResults,
            protocols_supported: merchant.enabled_platforms
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get merchant's synced products (admin API)
 * GET /api/merchant/products
 * Optional query param: ?platform=acp|ap2   (default acp)
 */
router.get('/products', (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const requestedPlatform = (req.query.platform || 'acp').toLowerCase();

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required'
            });
        }

        const merchant = db.getMerchantByApiKey(apiKey);

        if (!merchant) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        const platform = ALLOWED_PLATFORMS.includes(requestedPlatform) ? requestedPlatform : 'acp';

        const syncedProducts = db.getSyncedProducts(merchant.id, platform);
        const products = syncedProducts
            .map(sp => safeParse(sp.product_data))
            .filter(Boolean);

        res.json({
            success: true,
            merchant: merchant.name,
            platform,
            product_count: products.length,
            products
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
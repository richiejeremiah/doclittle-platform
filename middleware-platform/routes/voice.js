/**
 * VOICE ROUTES (REFACTORED)
 * 
 * Now uses Payment Orchestrator for checkout logic
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../database');
const VoiceAdapter = require('../adapters/voice-adapter');
const PaymentOrchestrator = require('../services/payment-orchestrator');

const router = express.Router();

/**
 * Product Search for Voice Agents
 * POST /voice/products/search
 */
router.post('/products/search', async (req, res) => {
    console.log('\n📦 VOICE: Product Search');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 REQUEST BODY:', JSON.stringify(req.body, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // Handle both direct format and Retell's nested format
        let merchant_id, query;

        if (req.body.args) {
            // Retell format: data is in req.body.args
            merchant_id = req.body.args.merchant_id;
            query = req.body.args.query;
            console.log('✅ Detected Retell format (nested args)');
        } else {
            // Direct format: data is in req.body
            merchant_id = req.body.merchant_id;
            query = req.body.query;
            console.log('✅ Detected direct format');
        }

        // Validate merchant_id
        if (!merchant_id) {
            console.log('❌ ERROR: merchant_id is missing!');
            return res.status(400).json({
                success: false,
                error: 'merchant_id required'
            });
        }

        console.log('Merchant ID:', merchant_id);
        console.log('Query:', query || 'all products');

        // Get merchant info
        const merchant = db.getMerchant(merchant_id);
        if (!merchant) {
            console.log('❌ ERROR: Merchant not found:', merchant_id);
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        console.log('✅ Merchant found:', merchant.name);
        console.log('Fetching products from:', merchant.api_url);

        // Fetch products from merchant's shop
        const response = await axios.get(`${merchant.api_url}/api/products`);
        let products = response.data.products || [];

        console.log(`📦 Fetched ${products.length} products from merchant`);

        // Apply search filter if query provided
        if (query) {
            const searchTerm = query.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                (p.description && p.description.toLowerCase().includes(searchTerm)) ||
                (p.category && p.category.toLowerCase().includes(searchTerm))
            );
            console.log(`🔍 Filtered to ${products.length} products matching "${query}"`);
        }

        // Convert to voice-friendly format
        const voiceProducts = VoiceAdapter.toVoiceFormat(products);

        console.log('✅ Returning', voiceProducts.length, 'products');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        res.json({
            success: true,
            merchant_id,
            merchant_name: merchant.name,
            query: query || 'all products',
            product_count: voiceProducts.length,
            products: voiceProducts
        });

    } catch (error) {
        console.error('❌ Voice product search error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get Single Product Details
 * GET /voice/products/:product_id
 */
router.get('/products/:product_id', async (req, res) => {
    try {
        const { product_id } = req.params;
        const { merchant_id } = req.query;

        if (!merchant_id) {
            return res.status(400).json({
                success: false,
                error: 'merchant_id required'
            });
        }

        const merchant = db.getMerchant(merchant_id);
        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        const response = await axios.get(`${merchant.api_url}/api/products/${product_id}`);
        const product = response.data.product;

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        const voiceProduct = VoiceAdapter.toVoiceFormat([product])[0];

        res.json({
            success: true,
            product: voiceProduct
        });

    } catch (error) {
        console.error('Voice product details error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Create Checkout Session
 * POST /voice/checkout/create
 * 
 * NOW USES PAYMENT ORCHESTRATOR!
 */
router.post('/checkout/create', async (req, res) => {
    try {
        console.log('\n💳 VOICE: Creating Checkout via Orchestrator');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Convert to standard format
        const standardRequest = VoiceAdapter.toStandardPaymentRequest(req.body);

        // Use orchestrator to process payment
        const result = await PaymentOrchestrator.createCheckout(standardRequest);

        // Convert back to voice format
        const response = VoiceAdapter.fromStandardResponse(result);

        res.json(response);

    } catch (error) {
        console.error('❌ Voice checkout error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get Checkout Status
 * GET /voice/checkout/status/:checkout_id
 */
router.get('/checkout/status/:checkout_id', async (req, res) => {
    try {
        const { checkout_id } = req.params;

        const result = await PaymentOrchestrator.getCheckoutStatus(checkout_id);

        if (!result.isSuccess()) {
            return res.status(404).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            checkout_id: result.checkout_id,
            status: result.payment.status,
            amount: result.payment.amount,
            created_at: result.metadata.created_at,
            completed_at: result.metadata.completed_at
        });

    } catch (error) {
        console.error('Voice checkout status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Complete Checkout (called after payment succeeds)
 * POST /voice/checkout/complete/:checkout_id
 */
router.post('/checkout/complete/:checkout_id', async (req, res) => {
    try {
        const { checkout_id } = req.params;
        const { payment_intent_id } = req.body;

        const checkout = db.getVoiceCheckout(checkout_id);

        if (!checkout) {
            return res.status(404).json({
                success: false,
                error: 'Checkout not found'
            });
        }

        if (checkout.status === 'completed') {
            return res.json({
                success: true,
                message: 'Checkout already completed',
                checkout
            });
        }

        // Get merchant
        const merchant = db.getMerchant(checkout.merchant_id);

        // Create order in merchant system
        const orderData = VoiceAdapter.toMerchantOrderFormat(checkout);
        const orderResponse = await axios.post(
            `${merchant.api_url}/api/orders`,
            orderData
        );

        const merchantOrder = orderResponse.data.order;

        // Update checkout status
        db.updateVoiceCheckout(checkout_id, {
            status: 'completed',
            payment_intent_id,
            merchant_order_id: merchantOrder.id
        });

        // Create transaction record
        db.createTransaction({
            id: uuidv4(),
            merchant_id: checkout.merchant_id,
            platform: 'voice',
            platform_order_id: checkout_id,
            merchant_order_id: merchantOrder.id,
            product_id: checkout.product_id,
            amount: checkout.amount,
            status: 'completed',
            customer_email: checkout.customer_email || checkout.customer_phone
        });

        res.json({
            success: true,
            message: 'Checkout completed',
            checkout_id,
            order_id: merchantOrder.id
        });

    } catch (error) {
        console.error('Voice checkout completion error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'voice-protocol',
        version: '1.0.0'
    });
});

module.exports = router;
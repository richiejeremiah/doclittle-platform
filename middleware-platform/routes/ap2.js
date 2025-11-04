/**
 * AP2 ROUTES
 * Handle Google's Agent Payments Protocol requests
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../database');
const AP2Adapter = require('../adapters/ap2-adapter');
const UniversalAdapter = require('../adapters/universal-adapter');
const CartService = require('../services/cart-service');

const router = express.Router();

/**
 * AP2 Product Search
 * GET /ap2/products
 */
router.get('/products', (req, res) => {
    try {
        const { merchant_id, query, intent_mandate } = req.query;

        if (!merchant_id) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('missing_merchant', 'Merchant ID required')
            );
        }

        // Parse and verify intent mandate if provided
        let parsedMandate = null;
        if (intent_mandate) {
            try {
                parsedMandate = JSON.parse(intent_mandate);
                const verification = AP2Adapter.verifyIntentMandate(parsedMandate);

                if (!verification.valid) {
                    return res.status(400).json(
                        AP2Adapter.createErrorResponse('invalid_mandate', verification.error)
                    );
                }

                // Store mandate
                db.storeMandate({
                    ...parsedMandate,
                    merchant_id,
                    verified: true
                });
            } catch (e) {
                return res.status(400).json(
                    AP2Adapter.createErrorResponse('invalid_mandate_format', 'Could not parse intent mandate')
                );
            }
        }

        const merchant = db.getMerchant(merchant_id);
        if (!merchant) {
            return res.status(404).json(
                AP2Adapter.createErrorResponse('merchant_not_found', 'Merchant not found')
            );
        }

        // Get synced products in universal format
        const syncedProducts = db.getUniversalProducts(merchant_id);
        let products = syncedProducts.map(sp => {
            const universal = JSON.parse(sp.universal_data);
            return UniversalAdapter.toAP2Format(universal);
        });

        // Apply search filter
        if (query) {
            const searchTerm = query.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                p.description.toLowerCase().includes(searchTerm) ||
                p.category.toLowerCase().includes(searchTerm)
            );
        }

        // Apply intent mandate constraints if present
        if (parsedMandate && parsedMandate.constraints) {
            const constraints = parsedMandate.constraints;

            // Filter by price limit
            if (constraints.price_limit) {
                products = products.filter(p =>
                    p.price.amount <= constraints.price_limit.amount
                );
            }

            // Filter by category
            if (constraints.product_category) {
                products = products.filter(p =>
                    p.category === constraints.product_category
                );
            }
        }

        res.json({
            merchant_id,
            merchant_name: merchant.name,
            product_count: products.length,
            intent_mandate_id: parsedMandate?.id || null,
            products
        });
    } catch (error) {
        res.status(500).json(
            AP2Adapter.createErrorResponse('server_error', error.message)
        );
    }
});

/**
 * Create Shopping Cart
 * POST /ap2/carts
 */
router.post('/carts', async (req, res) => {
    try {
        const { merchant_id, items, intent_mandate_id } = req.body;

        if (!merchant_id || !items || items.length === 0) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('invalid_request', 'Merchant ID and items required')
            );
        }

        // Verify intent mandate if provided
        if (intent_mandate_id) {
            const mandate = db.getMandate(intent_mandate_id);
            if (!mandate || !mandate.verified) {
                return res.status(400).json(
                    AP2Adapter.createErrorResponse('invalid_mandate', 'Intent mandate not found or not verified')
                );
            }
        }

        // Create cart
        const result = await CartService.createCart(merchant_id, items, intent_mandate_id);

        if (!result.success) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('cart_creation_failed', result.error)
            );
        }

        res.json({
            success: true,
            cart: result.cart
        });
    } catch (error) {
        res.status(500).json(
            AP2Adapter.createErrorResponse('server_error', error.message)
        );
    }
});

/**
 * Get Cart
 * GET /ap2/carts/:id
 */
router.get('/carts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = CartService.getCart(id);

        if (!result.success) {
            return res.status(404).json(
                AP2Adapter.createErrorResponse('cart_not_found', result.error)
            );
        }

        res.json({
            success: true,
            cart: result.cart
        });
    } catch (error) {
        res.status(500).json(
            AP2Adapter.createErrorResponse('server_error', error.message)
        );
    }
});

/**
 * Update Cart
 * PUT /ap2/carts/:id
 */
router.put('/carts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const result = await CartService.updateCart(id, updates);

        if (!result.success) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('cart_update_failed', result.error)
            );
        }

        res.json({
            success: true,
            cart: result.cart
        });
    } catch (error) {
        res.status(500).json(
            AP2Adapter.createErrorResponse('server_error', error.message)
        );
    }
});

/**
 * Authorize Payment (complete purchase)
 * POST /ap2/payments/authorize
 */
router.post('/payments/authorize', async (req, res) => {
    try {
        const { cart_mandate, payment_mandate } = req.body;

        if (!cart_mandate || !payment_mandate) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('missing_mandates', 'Cart and payment mandates required')
            );
        }

        // Get the cart
        const cartResult = CartService.getCart(cart_mandate.cart_id);
        if (!cartResult.success) {
            return res.status(404).json(
                AP2Adapter.createErrorResponse('cart_not_found', 'Cart not found')
            );
        }

        const cart = cartResult.cart;

        // Get intent mandate
        const intentMandate = cart.intent_mandate_id ?
            db.getMandate(cart.intent_mandate_id) : null;

        // Verify mandate chain
        let verification;
        if (intentMandate) {
            const parsedIntent = JSON.parse(intentMandate.mandate_data);
            verification = AP2Adapter.verifyMandateChain(
                parsedIntent,
                cart_mandate,
                payment_mandate
            );
        } else {
            // Human-present flow (no intent mandate)
            const cartCheck = AP2Adapter.verifyCartMandate(cart_mandate, cart);
            const paymentCheck = AP2Adapter.verifyPaymentMandate(payment_mandate, cart_mandate);

            verification = {
                valid: cartCheck.valid && paymentCheck.valid,
                auditTrail: [
                    { step: 'cart_verification', valid: cartCheck.valid },
                    { step: 'payment_verification', valid: paymentCheck.valid }
                ]
            };
        }

        if (!verification.valid) {
            return res.status(400).json(
                AP2Adapter.createErrorResponse('mandate_verification_failed', verification.error, {
                    audit_trail: verification.auditTrail
                })
            );
        }

        // Store mandates
        db.storeMandate({
            ...cart_mandate,
            type: 'CartMandate',
            merchant_id: cart.merchant_id,
            verified: true
        });

        db.storeMandate({
            ...payment_mandate,
            type: 'PaymentMandate',
            merchant_id: cart.merchant_id,
            verified: true
        });

        // Forward to merchant
        const merchant = db.getMerchant(cart.merchant_id);
        const merchantOrder = AP2Adapter.toMerchantOrderFormat(cart, cart_mandate, payment_mandate);

        const orderResponse = await axios.post(
            `${merchant.api_url}/api/orders`,
            merchantOrder
        );

        const merchantResult = orderResponse.data;

        // Create AP2 transaction record
        const transactionId = uuidv4();
        db.createAP2Transaction({
            id: transactionId,
            merchant_id: cart.merchant_id,
            intent_mandate_id: cart.intent_mandate_id,
            cart_mandate_id: cart_mandate.id,
            payment_mandate_id: payment_mandate.id,
            cart_id: cart.id,
            order_id: merchantResult.order.id,
            amount: cart.total,
            status: 'completed',
            audit_trail: verification.auditTrail
        });

        // Also create regular transaction for dashboard
        db.createTransaction({
            id: uuidv4(),
            merchant_id: cart.merchant_id,
            platform: 'ap2',
            platform_order_id: transactionId,
            merchant_order_id: merchantResult.order.id,
            product_id: cart.items[0].product_id,
            amount: cart.total,
            status: 'completed',
            customer_email: cart_mandate.cart_details?.customer_email || 'ap2@customer.com'
        });

        res.json({
            success: true,
            transaction_id: transactionId,
            order_id: merchantResult.order.id,
            status: 'authorized',
            audit_trail: verification.auditTrail,
            mandate_verification: {
                intent: intentMandate ? 'verified' : 'not_required',
                cart: 'verified',
                payment: 'verified'
            }
        });
    } catch (error) {
        console.error('AP2 Payment Authorization Error:', error);
        res.status(500).json(
            AP2Adapter.createErrorResponse('authorization_failed', error.message)
        );
    }
});

/**
 * Get Transaction Status
 * GET /ap2/transactions/:id
 */
router.get('/transactions/:id', (req, res) => {
    try {
        const { id } = req.params;
        const transaction = db.getAP2Transaction(id);

        if (!transaction) {
            return res.status(404).json(
                AP2Adapter.createErrorResponse('transaction_not_found', 'Transaction not found')
            );
        }

        res.json({
            success: true,
            transaction: {
                ...transaction,
                audit_trail: JSON.parse(transaction.audit_trail)
            }
        });
    } catch (error) {
        res.status(500).json(
            AP2Adapter.createErrorResponse('server_error', error.message)
        );
    }
});

module.exports = router;
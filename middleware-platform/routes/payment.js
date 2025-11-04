/**
 * PAYMENT ROUTES
 * Serve payment page and handle Stripe payment processing
 */

const express = require('express');
const path = require('path');
const PaymentService = require('../services/payment-service');

const router = express.Router();

// Note: Stripe integration would go here in production
// For now, we'll simulate payment processing

/**
 * Serve payment page
 * GET /payment/:token
 */
router.get('/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/payment/index.html'));
});

/**
 * Get checkout details by token
 * GET /api/payment/checkout/:token
 */
router.get('/checkout/:token', (req, res) => {
    try {
        const { token } = req.params;
        const result = PaymentService.getCheckoutByToken(token);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            checkout: result.checkout,
            stripe_publishable_key: PaymentService.getStripePublishableKey()
        });

    } catch (error) {
        console.error('Error fetching checkout:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Process payment with Stripe
 * POST /api/payment/process
 * 
 * In production, this would:
 * 1. Create Stripe Payment Intent
 * 2. Process payment
 * 3. Handle webhooks
 * 
 * For demo, we'll simulate successful payment
 */
router.post('/process', async (req, res) => {
    try {
        const { payment_token, payment_method_id, amount, currency } = req.body;

        // Validate token
        const checkoutResult = PaymentService.getCheckoutByToken(payment_token);
        if (!checkoutResult.success) {
            return res.status(400).json(checkoutResult);
        }

        // TODO: Integrate with Stripe
        // For now, simulate successful payment
        console.log('\n💳 PAYMENT SIMULATION');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Payment Method ID:', payment_method_id);
        console.log('Amount:', amount, currency);
        console.log('Checkout:', checkoutResult.checkout.id);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Simulate Stripe Payment Intent
        const simulatedPaymentIntent = {
            id: `pi_simulated_${Date.now()}`,
            status: 'succeeded',
            amount,
            currency
        };

        // Process payment in our system
        await PaymentService.processPayment(
            payment_token,
            simulatedPaymentIntent.id
        );

        /*
        // PRODUCTION CODE (uncomment when ready):
        const stripe = require('stripe')(PaymentService.getStripeSecretKey());
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            payment_method: payment_method_id,
            confirm: true,
            metadata: {
                checkout_id: checkoutResult.checkout.id,
                payment_token
            }
        });

        if (paymentIntent.status === 'requires_action') {
            return res.json({
                success: true,
                requires_action: true,
                client_secret: paymentIntent.client_secret
            });
        }

        await PaymentService.processPayment(payment_token, paymentIntent.id);
        */

        res.json({
            success: true,
            payment_intent_id: simulatedPaymentIntent.id,
            status: 'succeeded'
        });

    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
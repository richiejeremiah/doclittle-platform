/**
 * PAYMENT ORCHESTRATOR
 * 
 * Central service that handles ALL payment processing.
 * All protocols route through here.
 * 
 * Responsibilities:
 * 1. Validate payment requests
 * 2. Fetch product/merchant details
 * 3. Calculate totals
 * 4. Route to appropriate payment method
 * 5. Create checkout records
 * 6. Generate payment links/tokens
 * 7. Send SMS notifications
 * 8. Return standardized responses
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../database');
const PaymentRequest = require('../models/payment-request');
const PaymentResponse = require('../models/payment-response');
const PaymentService = require('./payment-service');
const SMSService = require('./sms-service');

class PaymentOrchestrator {
    /**
     * Create a checkout session
     * 
     * @param {Object} requestData - Raw request data from any protocol
     * @returns {PaymentResponse}
     */
    static async createCheckout(requestData) {
        console.log('\n💳 PAYMENT ORCHESTRATOR: Creating Checkout');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        try {
            // Convert to standard format
            const paymentRequest = new PaymentRequest(requestData);

            console.log('📋 Request Summary:', paymentRequest.getSummary());

            // Validate request
            const validation = paymentRequest.validate();
            if (!validation.valid) {
                console.log('❌ Validation failed:', validation.errors);
                return new PaymentResponse({
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    transaction_id: paymentRequest.transaction_id
                });
            }

            // Get merchant
            const merchant = db.getMerchant(paymentRequest.merchant_id);
            if (!merchant) {
                console.log('❌ Merchant not found:', paymentRequest.merchant_id);
                return new PaymentResponse({
                    success: false,
                    error: 'Merchant not found',
                    transaction_id: paymentRequest.transaction_id
                });
            }

            console.log('✅ Merchant:', merchant.name);

            // If items don't have full details, fetch them
            const enrichedItems = await this._enrichItems(paymentRequest.items, merchant);

            // Calculate totals if not provided
            const totals = this._calculateTotals(enrichedItems, paymentRequest.totals);

            console.log('💰 Totals:', totals);

            // Create checkout record
            const checkoutId = uuidv4();
            const checkout = {
                id: checkoutId,
                merchant_id: paymentRequest.merchant_id,
                product_id: enrichedItems[0].product_id, // Primary product
                product_name: enrichedItems[0].name,
                quantity: enrichedItems[0].quantity,
                amount: totals.total,
                customer_phone: paymentRequest.customer.phone,
                customer_name: paymentRequest.customer.name,
                customer_email: paymentRequest.customer.email,
                status: 'pending'
            };

            db.createVoiceCheckout(checkout);
            console.log('✅ Checkout created:', checkoutId);

            // Route to payment method
            const paymentResult = await this._routePayment(
                paymentRequest.payment.method,
                checkout,
                merchant,
                paymentRequest
            );

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            return paymentResult;

        } catch (error) {
            console.error('❌ Orchestrator error:', error);
            return new PaymentResponse({
                success: false,
                error: error.message,
                transaction_id: requestData.transaction_id
            });
        }
    }

    /**
     * Enrich items with full product details
     * 
     * @private
     */
    static async _enrichItems(items, merchant) {
        const enriched = [];

        for (const item of items) {
            try {
                // If item already has full details, use it
                if (item.name && item.unit_price) {
                    enriched.push(item);
                    continue;
                }

                // Otherwise, fetch from merchant
                const response = await axios.get(
                    `${merchant.api_url}/api/products/${item.product_id}`
                );
                const product = response.data.product;

                enriched.push({
                    product_id: item.product_id,
                    name: product.name,
                    quantity: item.quantity || 1,
                    unit_price: product.price,
                    total: (item.quantity || 1) * product.price
                });

            } catch (error) {
                console.error(`Failed to fetch product ${item.product_id}:`, error.message);
                throw new Error(`Product ${item.product_id} not found`);
            }
        }

        return enriched;
    }

    /**
     * Calculate totals
     * 
     * @private
     */
    static _calculateTotals(items, providedTotals = {}) {
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const tax = providedTotals.tax || 0;
        const shipping = providedTotals.shipping || 0;
        const total = subtotal + tax + shipping;

        return { subtotal, tax, shipping, total };
    }

    /**
     * Route to appropriate payment method
     * 
     * @private
     */
    static async _routePayment(paymentMethod, checkout, merchant, paymentRequest) {
        console.log('🔀 Routing to payment method:', paymentMethod);

        switch (paymentMethod) {
            case 'link':
                return await this._handleLinkPayment(checkout, merchant, paymentRequest);

            case 'stripe':
                return await this._handleStripePayment(checkout, merchant, paymentRequest);

            case 'mastercard':
                return await this._handleMastercardPayment(checkout, merchant, paymentRequest);

            case 'visa':
                return await this._handleVisaPayment(checkout, merchant, paymentRequest);

            default:
                // Default to link-based payment
                return await this._handleLinkPayment(checkout, merchant, paymentRequest);
        }
    }

    /**
     * Handle link-based payment (SMS with payment page)
     * 
     * @private
     */
    static async _handleLinkPayment(checkout, merchant, paymentRequest) {
        console.log('🔗 Processing link-based payment');

        // Generate payment token
        const paymentToken = PaymentService.createPaymentToken(checkout.id);

        // Generate payment link
        const paymentLink = `${process.env.BASE_URL || 'http://localhost:4000'}/payment/${paymentToken}`;

        // Send SMS if phone number provided
        let smsResult = { success: false };
        if (checkout.customer_phone) {
            smsResult = await SMSService.sendPaymentLink(
                checkout.customer_phone,
                paymentLink,
                {
                    product_name: checkout.product_name,
                    amount: checkout.amount.toFixed(2),
                    merchant_name: merchant.name
                }
            );

            console.log('📱 SMS Result:', smsResult.success ? '✅ Sent' : '❌ Failed');
        }

        return new PaymentResponse({
            success: true,
            transaction_id: paymentRequest.transaction_id,
            checkout_id: checkout.id,
            payment: {
                method: 'link',
                status: 'pending',
                amount: checkout.amount,
                currency: 'USD'
            },
            payment_link: paymentLink,
            payment_token: paymentToken,
            requires_action: true,
            action_type: 'sms_link',
            message: smsResult.success
                ? 'Payment link sent via SMS'
                : 'Payment link generated (SMS failed)',
            metadata: {
                sms_sent: smsResult.success,
                sms_message_id: smsResult.message_sid
            }
        });
    }

    /**
     * Handle direct Stripe payment
     * 
     * @private
     */
    static async _handleStripePayment(checkout, merchant, paymentRequest) {
        console.log('💳 Processing direct Stripe payment');

        // TODO: Implement direct Stripe payment intent
        // For now, fall back to link-based
        console.log('⚠️ Direct Stripe not yet implemented, using link');
        return await this._handleLinkPayment(checkout, merchant, paymentRequest);
    }

    /**
     * Handle Mastercard Agent Pay
     * 
     * @private
     */
    static async _handleMastercardPayment(checkout, merchant, paymentRequest) {
        console.log('🔴 Processing Mastercard Agent Pay');

        // TODO: Implement Mastercard Agent Pay integration
        // For now, fall back to link-based
        console.log('⚠️ Mastercard Agent Pay not yet implemented, using link');
        return await this._handleLinkPayment(checkout, merchant, paymentRequest);
    }

    /**
     * Handle Visa Agent Toolkit
     * 
     * @private
     */
    static async _handleVisaPayment(checkout, merchant, paymentRequest) {
        console.log('🔵 Processing Visa Agent Toolkit');

        // TODO: Implement Visa Agent Toolkit integration
        // For now, fall back to link-based
        console.log('⚠️ Visa Agent Toolkit not yet implemented, using link');
        return await this._handleLinkPayment(checkout, merchant, paymentRequest);
    }

    /**
     * Get checkout status
     * 
     * @param {string} checkoutId
     * @returns {PaymentResponse}
     */
    static async getCheckoutStatus(checkoutId) {
        try {
            const checkout = db.getVoiceCheckout(checkoutId);

            if (!checkout) {
                return new PaymentResponse({
                    success: false,
                    error: 'Checkout not found'
                });
            }

            return new PaymentResponse({
                success: true,
                checkout_id: checkout.id,
                payment: {
                    status: checkout.status,
                    amount: checkout.amount,
                    currency: 'USD',
                    payment_intent_id: checkout.payment_intent_id
                },
                merchant_order_id: checkout.merchant_order_id,
                metadata: {
                    created_at: checkout.created_at,
                    completed_at: checkout.completed_at
                }
            });

        } catch (error) {
            return new PaymentResponse({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = PaymentOrchestrator;
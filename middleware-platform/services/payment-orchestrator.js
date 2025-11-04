// services/payment-orchestrator.js
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../database');
const PaymentRequest = require('../models/payment-request');
const PaymentResponse = require('../models/payment-response');
const SMSService = require('./sms-service');
const EmailService = require('./email-service');

class PaymentOrchestrator {
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

            // Enrich items with full details
            const enrichedItems = await this._enrichItems(paymentRequest.items, merchant);

            // Calculate totals
            const totals = this._calculateTotals(enrichedItems, paymentRequest.totals);

            console.log('💰 Totals:', totals);

            // Normalize phone number
            const normalizedPhone = SMSService.formatPhoneNumber(paymentRequest.customer.phone);

            // Create checkout record
            const checkoutId = uuidv4();
            const checkout = {
                id: checkoutId,
                merchant_id: paymentRequest.merchant_id,
                product_id: enrichedItems[0].product_id,
                product_name: enrichedItems[0].name,
                quantity: enrichedItems[0].quantity,
                amount: totals.total,
                customer_phone: normalizedPhone,
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

    static async _enrichItems(items, merchant) {
        const enriched = [];

        for (const item of items) {
            try {
                if (item.name && item.unit_price) {
                    enriched.push(item);
                    continue;
                }

                const response = await axios.get(
                    `${merchant.api_url}/api/products/${item.product_id}`,
                    { timeout: 5000 }
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

    static _calculateTotals(items, providedTotals = {}) {
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const tax = providedTotals.tax || 0;
        const shipping = providedTotals.shipping || 0;
        const total = subtotal + tax + shipping;

        return { subtotal, tax, shipping, total };
    }

    static async _routePayment(paymentMethod, checkout, merchant, paymentRequest) {
        console.log('🔀 Routing to payment method:', paymentMethod);

        switch (paymentMethod) {
            case 'link':
                return await this._handleLinkPayment(checkout, merchant, paymentRequest);
            default:
                return await this._handleLinkPayment(checkout, merchant, paymentRequest);
        }
    }

    static async _handleLinkPayment(checkout, merchant, paymentRequest) {
        console.log('🔗 Processing link-based payment with email verification');

        // Generate payment token
        const paymentToken = crypto.randomBytes(32).toString('hex');

        // Generate 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store payment token with verification code
        db.createPaymentToken({
            token: paymentToken,
            checkout_id: checkout.id,
            verification_code: verificationCode,
            verification_code_expires: codeExpires.toISOString(),
            status: 'pending'
        });

        // Generate payment link (will require code verification)
        const paymentLink = `${process.env.BASE_URL || 'http://localhost:4000'}/payment/${paymentToken}`;

        // Send verification code via email if email provided
        let emailResult = { success: false };
        if (checkout.customer_email) {
            emailResult = await EmailService.sendCheckoutVerificationCode(
                checkout.customer_email,
                verificationCode
            );
            console.log('📧 Email Result:', emailResult.success ? '✅ Sent' : '❌ Failed');
        } else {
            console.log('⚠️  No email provided - cannot send verification code');
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
            // Hold back the link until verification; return token for verification step
            payment_token: paymentToken,
            requires_action: true,
            action_type: 'email_verification',
            message: emailResult.success
                ? `Verification code sent to ${checkout.customer_email}. Please enter the code to proceed with payment.`
                : 'Verification code generation failed. Please contact support.',
            metadata: {
                email_sent: emailResult.success,
                email_message_id: emailResult.message_id,
                payment_token: paymentToken,
                verification_required: true,
                product: {
                    id: checkout.product_id,
                    name: checkout.product_name,
                    quantity: checkout.quantity
                }
            }
        });
    }

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
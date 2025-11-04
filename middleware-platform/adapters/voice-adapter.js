/**
 * VOICE ADAPTER
 * 
 * Converts between Voice protocol format and standard payment format
 */

class VoiceAdapter {
    /**
     * Convert voice format products to simple format
     */
    static toVoiceFormat(products) {
        return products.map(product => ({
            id: product.id,
            name: product.name,
            description: this._truncateDescription(product.description),
            price: product.price.toFixed(2),
            price_spoken: `$${product.price.toFixed(2)}`,
            currency: 'USD',
            available: product.inventory > 0,
            inventory: product.inventory,
            category: product.category || ''
        }));
    }

    /**
     * Truncate description for voice (keep it short)
     */
    static _truncateDescription(description) {
        if (!description) return '';
        if (description.length <= 100) return description;
        return description.substring(0, 97) + '...';
    }

    /**
     * Convert voice checkout request to standard payment request
     * 
     * HANDLES MULTIPLE FORMATS:
     * - Retell format (nested in req.body.args)
     * - Direct format (flat req.body)
     * - Other voice platforms
     */
    static toStandardPaymentRequest(rawRequest) {
        // Extract data from nested or flat format
        let data;

        if (rawRequest.args) {
            // Retell/nested format
            data = rawRequest.args;
        } else {
            // Direct format
            data = rawRequest;
        }

        return {
            merchant_id: data.merchant_id,
            customer: {
                name: data.customer_name,
                phone: data.customer_phone,
                email: data.customer_email
            },
            items: [{
                product_id: data.product_id,
                quantity: data.quantity || 1
            }],
            payment: {
                method: data.payment_method || 'link',
                save_for_future: false,
                currency: 'USD'
            },
            source: {
                protocol: 'voice',
                platform: this._detectVoicePlatform(rawRequest),
                input_type: 'voice'
            },
            metadata: {
                original_request: rawRequest.call ? 'retell' : 'direct'
            }
        };
    }

    /**
     * Detect which voice platform sent the request
     */
    static _detectVoicePlatform(request) {
        if (request.call && request.call.agent_id) return 'retell';
        if (request.vapi) return 'vapi';
        if (request.platform) return request.platform;
        return 'unknown';
    }

    /**
     * Convert standard payment response to voice format
     */
    static fromStandardResponse(standardResponse) {
        return {
            success: standardResponse.success,
            checkout_id: standardResponse.checkout_id,
            payment_token: standardResponse.payment_token,
            payment_link: standardResponse.payment_link,
            amount: standardResponse.payment.amount?.toFixed(2),
            currency: standardResponse.payment.currency,
            sms_sent: standardResponse.metadata?.sms_sent || false,
            message: standardResponse.message || 'Payment link sent via SMS'
        };
    }

    /**
     * Convert checkout to merchant order format
     */
    static toMerchantOrderFormat(checkout) {
        return {
            customer_name: checkout.customer_name,
            customer_email: checkout.customer_email || checkout.customer_phone,
            customer_phone: checkout.customer_phone,
            items: [{
                product_id: checkout.product_id,
                quantity: checkout.quantity,
                price: checkout.amount / checkout.quantity
            }],
            total: checkout.amount,
            payment_method: 'credit_card',
            payment_id: checkout.payment_intent_id || checkout.id,
            status: 'paid'
        };
    }
}

module.exports = VoiceAdapter;
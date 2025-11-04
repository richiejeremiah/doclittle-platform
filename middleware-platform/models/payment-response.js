/**
 * STANDARD PAYMENT RESPONSE MODEL
 * 
 * This is what the orchestrator returns.
 * Protocol adapters convert THIS to protocol-specific format.
 */

class PaymentResponse {
    constructor(data) {
        this.success = data.success;
        this.transaction_id = data.transaction_id;
        this.checkout_id = data.checkout_id;
        this.payment = {
            method: data.payment?.method,
            status: data.payment?.status, // 'pending' | 'processing' | 'completed' | 'failed'
            amount: data.payment?.amount,
            currency: data.payment?.currency || 'USD',
            payment_intent_id: data.payment?.payment_intent_id || null
        };
        this.payment_link = data.payment_link || null;
        this.payment_token = data.payment_token || null;
        this.merchant_order_id = data.merchant_order_id || null;
        this.requires_action = data.requires_action || false;
        this.action_type = data.action_type || null; // 'sms_link' | 'redirect' | 'biometric'
        this.message = data.message || null;
        this.error = data.error || null;
        this.metadata = data.metadata || {};
    }

    /**
     * Check if this is a successful response
     */
    isSuccess() {
        return this.success === true;
    }

    /**
     * Check if customer action is required
     */
    requiresCustomerAction() {
        return this.requires_action === true;
    }
}

module.exports = PaymentResponse;
/**
 * ACP ADAPTER
 * Translates between merchant's format and ACP (Agentic Commerce Protocol) format
 * This is the "Plaid translation layer" for ChatGPT
 */

class ACPAdapter {
    /**
     * Convert merchant product to ACP product feed format
     */
    static toACPProductFeed(merchantProduct) {
        return {
            id: merchantProduct.id,
            title: merchantProduct.name,
            description: merchantProduct.description,
            price: merchantProduct.price.toString(),
            currency: 'USD',
            availability: merchantProduct.inventory > 0 ? 'in_stock' : 'out_of_stock',
            link: `http://localhost:3000/api/products/${merchantProduct.id}`,
            image_link: merchantProduct.image_url,
            brand: 'Demo Supplements',
            category: merchantProduct.category,
            inventory_count: merchantProduct.inventory
        };
    }

    /**
     * Convert multiple products to ACP feed
     */
    static toACPFeed(merchantProducts) {
        return merchantProducts.map(p => this.toACPProductFeed(p));
    }

    /**
     * Create ACP checkout session from ChatGPT request
     */
    static createCheckoutSession(acpRequest, merchantProduct) {
        // ACP format expects specific structure
        return {
            id: acpRequest.session_id,
            items: [{
                sku: merchantProduct.id,
                name: merchantProduct.name,
                price: merchantProduct.price,
                quantity: acpRequest.quantity || 1,
                image_url: merchantProduct.image_url
            }],
            subtotal: merchantProduct.price * (acpRequest.quantity || 1),
            tax: 0, // Simplified for demo
            shipping: 0, // Simplified for demo
            total: merchantProduct.price * (acpRequest.quantity || 1),
            currency: 'USD',
            buyer: {
                email: acpRequest.buyer_email,
                name: acpRequest.buyer_name
            },
            shipping_address: acpRequest.shipping_address || {},
            payment_methods: ['card', 'apple_pay', 'google_pay'],
            status: 'pending'
        };
    }

    /**
     * Convert merchant order to ACP order confirmation
     */
    static toACPOrderConfirmation(merchantOrder, product) {
        return {
            order_id: merchantOrder.id,
            status: 'confirmed',
            items: [{
                sku: merchantOrder.product_id,
                name: product.name,
                quantity: merchantOrder.quantity,
                price: product.price
            }],
            total: merchantOrder.total_amount,
            currency: 'USD',
            payment_status: 'completed',
            fulfillment: {
                status: 'processing',
                tracking_number: null,
                estimated_delivery: null
            },
            customer: {
                email: merchantOrder.customer_email,
                name: merchantOrder.customer_name
            },
            created_at: merchantOrder.created_at
        };
    }

    /**
     * Validate ACP request from ChatGPT
     */
    static validateACPRequest(request) {
        const required = ['product_id', 'buyer_email'];
        const missing = required.filter(field => !request[field]);

        if (missing.length > 0) {
            return {
                valid: false,
                error: `Missing required fields: ${missing.join(', ')}`
            };
        }

        return { valid: true };
    }

    /**
     * Generate ACP-compliant error response
     */
    static createErrorResponse(code, message) {
        return {
            error: {
                code,
                message,
                timestamp: new Date().toISOString()
            }
        };
    }
}

module.exports = ACPAdapter;
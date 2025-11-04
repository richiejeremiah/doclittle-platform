/**
 * CART SERVICE
 * Manages shopping carts for AP2 protocol
 * (ACP doesn't need this - ChatGPT manages the cart)
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../database');
const AP2Adapter = require('../adapters/ap2-adapter');

class CartService {
    /**
     * Create new shopping cart
     */
    static async createCart(merchantId, items, intentMandateId = null) {
        try {
            const merchant = db.getMerchant(merchantId);
            if (!merchant) {
                throw new Error('Merchant not found');
            }

            // Fetch product details from merchant
            const enrichedItems = [];
            for (const item of items) {
                const productResponse = await axios.get(
                    `${merchant.api_url}/api/products/${item.product_id}`
                );
                const product = productResponse.data.product;

                enrichedItems.push({
                    product_id: item.product_id,
                    name: product.name,
                    quantity: item.quantity,
                    price_cents: Math.round(product.price * 100),
                    subtotal_cents: Math.round(product.price * 100) * item.quantity
                });
            }

            // Calculate totals
            const totals = AP2Adapter.calculateCartTotals(enrichedItems, null);

            // Create cart object - items will be stringified by database layer
            const cart = {
                id: `cart_${uuidv4()}`,
                merchant_id: merchantId,
                intent_mandate_id: intentMandateId,
                items: enrichedItems, // Pass as array, db will stringify
                subtotal: totals.subtotal_cents / 100,
                tax: totals.tax_cents / 100,
                shipping: totals.shipping_cents / 100,
                total: totals.total_cents / 100
            };

            // Store in database
            db.createCart(cart);

            return {
                success: true,
                cart: {
                    ...cart,
                    subtotal_cents: totals.subtotal_cents,
                    tax_cents: totals.tax_cents,
                    shipping_cents: totals.shipping_cents,
                    total_cents: totals.total_cents,
                    currency: 'USD'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get cart by ID
     */
    static getCart(cartId) {
        try {
            const cart = db.getCart(cartId);
            if (!cart) {
                return { success: false, error: 'Cart not found' };
            }

            // Parse items if they're a string
            let items = cart.items;
            if (typeof items === 'string') {
                try {
                    items = JSON.parse(items);
                } catch (e) {
                    console.error('Failed to parse cart items:', e);
                    return { success: false, error: 'Invalid cart data' };
                }
            }

            return {
                success: true,
                cart: {
                    ...cart,
                    items: items,
                    subtotal_cents: Math.round(cart.subtotal * 100),
                    tax_cents: Math.round(cart.tax * 100),
                    shipping_cents: Math.round(cart.shipping * 100),
                    total_cents: Math.round(cart.total * 100),
                    currency: 'USD'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update cart items
     */
    static async updateCart(cartId, updates) {
        try {
            const cartResult = this.getCart(cartId);
            if (!cartResult.success) {
                return cartResult;
            }

            const cart = cartResult.cart;
            const merchant = db.getMerchant(cart.merchant_id);

            // Update items if provided
            if (updates.items) {
                const enrichedItems = [];
                for (const item of updates.items) {
                    const productResponse = await axios.get(
                        `${merchant.api_url}/api/products/${item.product_id}`
                    );
                    const product = productResponse.data.product;

                    enrichedItems.push({
                        product_id: item.product_id,
                        name: product.name,
                        quantity: item.quantity,
                        price_cents: Math.round(product.price * 100),
                        subtotal_cents: Math.round(product.price * 100) * item.quantity
                    });
                }

                cart.items = enrichedItems;
            }

            // Recalculate totals
            const totals = AP2Adapter.calculateCartTotals(
                cart.items,
                updates.shipping_address || null
            );

            const updatedCart = {
                items: cart.items, // Pass as array, db will stringify
                subtotal: totals.subtotal_cents / 100,
                tax: totals.tax_cents / 100,
                shipping: totals.shipping_cents / 100,
                total: totals.total_cents / 100
            };

            // Update in database
            db.updateCart(cartId, updatedCart);

            return {
                success: true,
                cart: {
                    id: cartId,
                    merchant_id: cart.merchant_id,
                    ...updatedCart,
                    subtotal_cents: totals.subtotal_cents,
                    tax_cents: totals.tax_cents,
                    shipping_cents: totals.shipping_cents,
                    total_cents: totals.total_cents,
                    currency: 'USD'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate cart against intent mandate constraints
     */
    static validateAgainstIntent(cart, intentMandate) {
        const constraints = intentMandate.constraints;

        // Check price limit
        if (constraints.price_limit) {
            if (cart.total_cents > constraints.price_limit.amount) {
                return {
                    valid: false,
                    error: `Cart total exceeds price limit (${cart.total_cents} > ${constraints.price_limit.amount})`
                };
            }
        }

        // Check product category
        if (constraints.product_category) {
            // In production: verify items match category
        }

        return { valid: true };
    }
}

module.exports = CartService;
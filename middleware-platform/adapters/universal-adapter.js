/**
 * UNIVERSAL ADAPTER
 * Master format that converts to both ACP and AP2
 *
 * Produces:
 *  - robust universal representation (id, title/name, price as number, currency, image, inventory)
 *  - ACP-friendly representation (ACP uses simple keys like title, price string, in_stock/out_of_stock)
 *  - AP2-friendly representation (structured price object, availability, images array)
 */

class UniversalAdapter {
    /**
     * Convert merchant product to universal format
     * This is the single source of truth
     */
    static toUniversalFormat(merchantProduct) {
        const price = Number(merchantProduct.price ?? merchantProduct.unit_price ?? 0);
        const inventory = Number(merchantProduct.inventory ?? merchantProduct.stock ?? 0);

        return {
            // Canonical identifiers
            id: String(merchantProduct.id ?? merchantProduct.sku ?? merchantProduct.product_id ?? ''),
            merchant_product_id: merchantProduct.id ?? merchantProduct.sku ?? merchantProduct.product_id ?? '',

            // Basic fields
            name: merchantProduct.title ?? merchantProduct.name ?? merchantProduct.product_name ?? '',
            description: merchantProduct.description ?? merchantProduct.summary ?? '',
            price: price, // numeric
            currency: merchantProduct.currency ?? 'USD',

            // Inventory & media
            inventory: inventory,
            image_url: merchantProduct.image_link ?? merchantProduct.image_url ?? merchantProduct.image ?? null,
            category: merchantProduct.category ?? 'general',
            brand: merchantProduct.brand ?? merchantProduct.manufacturer ?? '',

            // Metadata
            available: inventory > 0,

            // Keep raw original for debugging/reference
            original: merchantProduct
        };
    }

    /**
     * Convert universal format to ACP format
     * ACP expects price as a string like "24.99" and availability as 'in_stock' or 'out_of_stock'
     */
    static toACPFormat(univ) {
        return {
            id: univ.id,
            title: univ.name,
            description: univ.description,
            price: (typeof univ.price === 'number') ? univ.price.toFixed(2) : String(univ.price),
            currency: univ.currency || 'USD',
            availability: univ.available ? 'in_stock' : 'out_of_stock',
            link: univ.original?.link ?? `http://localhost:3000/api/products/${univ.id}`,
            image_link: univ.image_url,
            brand: univ.brand,
            category: univ.category,
            inventory_count: univ.inventory
        };
    }

    /**
     * Convert universal format to AP2 format (Google Agent Payments)
     * Produces structured price, availability, images[], link, id, title, etc.
     */
    static toAP2Format(univ) {
        return {
            id: univ.id,
            title: univ.name,
            description: univ.description,
            price: {
                value: (typeof univ.price === 'number') ? univ.price.toFixed(2) : String(univ.price),
                currency: univ.currency || 'USD'
            },
            availability: {
                status: univ.available ? 'IN_STOCK' : 'OUT_OF_STOCK',
                quantity: univ.inventory
            },
            link: univ.original?.link ?? `http://localhost:3000/api/products/${univ.id}`,
            images: univ.image_url ? [univ.image_url] : [],
            brand: univ.brand,
            category: univ.category,
            merchant_product_id: univ.merchant_product_id,
            raw: univ.original
        };
    }

    /**
     * Helper that returns the protocol-specific object
     */
    static getInFormat(univ, protocol) {
        switch ((protocol || '').toLowerCase()) {
            case 'acp':
                return this.toACPFormat(univ);
            case 'ap2':
                return this.toAP2Format(univ);
            default:
                return univ;
        }
    }

    /**
     * Convert an array of merchant products into target protocol format
     */
    static convertBatch(merchantProducts, protocol) {
        return (merchantProducts || []).map(product => {
            const universal = this.toUniversalFormat(product);
            return this.getInFormat(universal, protocol);
        });
    }
}

module.exports = UniversalAdapter;

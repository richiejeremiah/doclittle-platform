const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// ============================================
// MERCHANT API ENDPOINTS
// ============================================

// Get all products
app.get('/api/products', (req, res) => {
    try {
        const products = db.getAllProducts();
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single product
app.get('/api/products/:id', (req, res) => {
    try {
        const product = db.getProduct(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create order
app.post('/api/orders', (req, res) => {
    try {
        const { product_id, quantity, customer_email, customer_name, shipping_address } = req.body;

        // Validate product and inventory
        const product = db.getProduct(product_id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        if (product.inventory < quantity) {
            return res.status(400).json({ success: false, error: 'Insufficient inventory' });
        }

        // Create order
        const order = {
            id: uuidv4(),
            product_id,
            quantity,
            customer_email,
            customer_name,
            shipping_address: JSON.stringify(shipping_address),
            total_amount: product.price * quantity,
            status: 'confirmed',
            payment_status: 'completed',
            source: req.body.source || 'direct'
        };

        db.createOrder(order);
        db.updateInventory(product_id, quantity);

        res.json({
            success: true,
            order: {
                ...order,
                product_name: product.name
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all orders
app.get('/api/orders', (req, res) => {
    try {
        const orders = db.getAllOrders();
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single order
app.get('/api/orders/:id', (req, res) => {
    try {
        const order = db.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'merchant-shop' });
});

app.listen(PORT, () => {
    console.log(`
🏪 MERCHANT SHOP RUNNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${PORT}
📦 Products: http://localhost:${PORT}/api/products
📋 Orders: http://localhost:${PORT}/api/orders
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
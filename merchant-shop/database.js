const Database = require('better-sqlite3');
const db = new Database('merchant.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    inventory INTEGER NOT NULL,
    image_url TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    shipping_address TEXT,
    total_amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'direct',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// Seed initial products if empty
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();

if (productCount.count === 0) {
    const insertProduct = db.prepare(`
    INSERT INTO products (id, name, description, price, inventory, image_url, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const products = [
        ['VIT-D3-5000', 'Vitamin D3 5000 IU', 'High-potency vitamin D supplement for bone and immune health. 120 softgels.', 24.99, 100, 'https://via.placeholder.com/300x300?text=Vitamin+D3', 'vitamins'],
        ['OMEGA-3-1000', 'Omega-3 Fish Oil 1000mg', 'Premium fish oil with EPA and DHA for heart and brain health. 180 softgels.', 29.99, 150, 'https://via.placeholder.com/300x300?text=Omega-3', 'supplements'],
        ['PROB-50B', 'Probiotic 50 Billion CFU', 'Multi-strain probiotic for digestive and immune support. 60 capsules.', 34.99, 80, 'https://via.placeholder.com/300x300?text=Probiotic', 'probiotics'],
        ['MAG-400', 'Magnesium Glycinate 400mg', 'Highly absorbable magnesium for muscle relaxation and sleep. 120 capsules.', 19.99, 120, 'https://via.placeholder.com/300x300?text=Magnesium', 'minerals'],
    ];

    products.forEach(product => insertProduct.run(...product));
    console.log('✅ Seeded 4 products');
}

module.exports = {
    // Products
    getAllProducts: () => db.prepare('SELECT * FROM products').all(),

    getProduct: (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id),

    updateInventory: (id, quantity) => {
        return db.prepare('UPDATE products SET inventory = inventory - ? WHERE id = ?')
            .run(quantity, id);
    },

    // Orders
    createOrder: (order) => {
        return db.prepare(`
      INSERT INTO orders (id, product_id, quantity, customer_email, customer_name, 
                         shipping_address, total_amount, status, payment_status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            order.id,
            order.product_id,
            order.quantity,
            order.customer_email,
            order.customer_name,
            order.shipping_address,
            order.total_amount,
            order.status || 'pending',
            order.payment_status || 'pending',
            order.source || 'direct'
        );
    },

    getOrder: (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),

    getAllOrders: () => db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),

    updateOrderStatus: (id, status) => {
        return db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    }
};
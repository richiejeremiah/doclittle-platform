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
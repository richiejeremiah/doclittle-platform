/**
 * Migration: Add payment_method and appointment_id columns to voice_checkouts table
 * 
 * Run this script to update existing databases:
 * node scripts/migrate-add-payment-method.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'middleware.db');

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('⚠️  Database file not found. It will be created when the server starts.');
  process.exit(0);
}

const db = new Database(dbPath);

try {
  console.log('🔄 Running migration: Add payment_method and appointment_id columns...\n');
  
  // Get current table structure
  const tableInfo = db.prepare('PRAGMA table_info(voice_checkouts)').all();
  const columns = tableInfo.map(col => col.name);
  
  console.log('Current columns:', columns.join(', '));
  console.log('');
  
  // Check and add appointment_id column
  if (!columns.includes('appointment_id')) {
    console.log('➕ Adding appointment_id column...');
    db.prepare(`
      ALTER TABLE voice_checkouts 
      ADD COLUMN appointment_id TEXT DEFAULT NULL
    `).run();
    console.log('✅ appointment_id column added');
  } else {
    console.log('✅ appointment_id column already exists');
  }
  
  // Check and add payment_method column
  if (!columns.includes('payment_method')) {
    console.log('➕ Adding payment_method column...');
    db.prepare(`
      ALTER TABLE voice_checkouts 
      ADD COLUMN payment_method TEXT DEFAULT NULL
    `).run();
    console.log('✅ payment_method column added');
  } else {
    console.log('✅ payment_method column already exists');
  }
  
  // Verify migration
  const updatedTableInfo = db.prepare('PRAGMA table_info(voice_checkouts)').all();
  const updatedColumns = updatedTableInfo.map(col => col.name);
  
  console.log('\nUpdated columns:', updatedColumns.join(', '));
  console.log('\n✅ Migration completed successfully!');
  
  db.close();
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  db.close();
  process.exit(1);
}


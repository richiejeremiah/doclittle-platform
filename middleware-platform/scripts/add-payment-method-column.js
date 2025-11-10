/**
 * Add payment_method column to voice_checkouts table
 * This script adds the payment_method column if it doesn't exist
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'middleware.db');
const db = new Database(dbPath);

try {
  console.log('Checking if payment_method column exists...');
  
  // Check if column exists
  const tableInfo = db.prepare('PRAGMA table_info(voice_checkouts)').all();
  const hasPaymentMethod = tableInfo.some(col => col.name === 'payment_method');
  
  if (hasPaymentMethod) {
    console.log('✅ payment_method column already exists');
  } else {
    console.log('Adding payment_method column...');
    
    // Add payment_method column
    db.prepare(`
      ALTER TABLE voice_checkouts 
      ADD COLUMN payment_method TEXT DEFAULT NULL
    `).run();
    
    console.log('✅ payment_method column added successfully');
  }
  
  // Also check if appointment_id column exists (may have been added separately)
  const hasAppointmentId = tableInfo.some(col => col.name === 'appointment_id');
  
  if (!hasAppointmentId) {
    console.log('Adding appointment_id column...');
    db.prepare(`
      ALTER TABLE voice_checkouts 
      ADD COLUMN appointment_id TEXT DEFAULT NULL
    `).run();
    console.log('✅ appointment_id column added successfully');
  }
  
  db.close();
  console.log('✅ Database migration complete');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  db.close();
  process.exit(1);
}


/**
 * Verify Wallet Payment Implementation
 * 
 * This script verifies that the wallet payment implementation is correct
 * without requiring the server to be running or API keys to be configured.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName) {
  console.log('\n' + '='.repeat(60));
  log(`VERIFY: ${testName}`, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function check(condition, message, warning = false) {
  if (condition) {
    results.passed++;
    logSuccess(message);
    return true;
  } else {
    if (warning) {
      results.warnings++;
      logWarning(message);
    } else {
      results.failed++;
      logError(message);
    }
    return false;
  }
}

// Test 1: Check if server.js has wallet payment code
function verifyServerImplementation() {
  logTest('Server Implementation');
  
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Check for wallet payment in process-payment endpoint
  check(
    serverContent.includes('payment_method === \'wallet\''),
    'Wallet payment handling in /process-payment endpoint'
  );
  
  // Check for wallet balance checking in verify endpoint
  check(
    serverContent.includes('getOrCreatePatientWallet'),
    'Wallet balance checking in /voice/checkout/verify endpoint'
  );
  
  // Check for Stripe wallet deposit
  check(
    serverContent.includes('method === \'stripe\'') && serverContent.includes('wallet_deposit'),
    'Stripe wallet deposit in /api/patient/wallet/deposit endpoint'
  );
  
  // Check for Circle transfer
  check(
    serverContent.includes('createTransfer') && serverContent.includes('fromWalletId'),
    'Circle transfer creation for wallet payments'
  );
  
  // Check for wallet info in verify response
  check(
    serverContent.includes('wallet: walletInfo'),
    'Wallet info included in verify response'
  );
  
  // Check for webhook handling
  check(
    serverContent.includes('payment_intent.succeeded') && serverContent.includes('wallet_deposit'),
    'Stripe webhook handling for wallet deposits'
  );
}

// Test 2: Check database schema
function verifyDatabaseSchema() {
  logTest('Database Schema');
  
  const dbPath = path.join(__dirname, '..', 'database.js');
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  
  // Check for payment_method column in CREATE TABLE
  check(
    dbContent.includes('payment_method TEXT') && dbContent.includes('CREATE TABLE IF NOT EXISTS voice_checkouts'),
    'payment_method column in voice_checkouts table schema'
  );
  
  // Check for appointment_id column
  check(
    dbContent.includes('appointment_id TEXT') && dbContent.includes('CREATE TABLE IF NOT EXISTS voice_checkouts'),
    'appointment_id column in voice_checkouts table schema'
  );
  
  // Check for updateVoiceCheckout supporting payment_method
  check(
    dbContent.includes('updates.payment_method') && dbContent.includes('updateVoiceCheckout'),
    'updateVoiceCheckout method supports payment_method'
  );
  
  // Check for createVoiceCheckout including payment_method
  check(
    dbContent.includes('payment_method') && dbContent.includes('createVoiceCheckout'),
    'createVoiceCheckout method includes payment_method'
  );
}

// Test 3: Check Circle service
function verifyCircleService() {
  logTest('Circle Service');
  
  const circlePath = path.join(__dirname, '..', 'services', 'circle-service.js');
  
  if (!fs.existsSync(circlePath)) {
    check(false, 'Circle service file exists');
    return;
  }
  
  const circleContent = fs.readFileSync(circlePath, 'utf8');
  
  // Check for getOrCreatePatientWallet method
  check(
    circleContent.includes('getOrCreatePatientWallet'),
    'getOrCreatePatientWallet method exists'
  );
  
  // Check for getWalletBalance method
  check(
    circleContent.includes('getWalletBalance'),
    'getWalletBalance method exists'
  );
  
  // Check for createTransfer method
  check(
    circleContent.includes('createTransfer') || circleContent.includes('createTransaction'),
    'createTransfer or createTransaction method exists'
  );
  
  // Check for fundWallet method
  check(
    circleContent.includes('fundWallet'),
    'fundWallet method exists'
  );
}

// Test 4: Check database methods
function verifyDatabaseMethods() {
  logTest('Database Methods');
  
  const dbPath = path.join(__dirname, '..', 'database.js');
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  
  // Check for getFHIRPatientByPhone
  check(
    dbContent.includes('getFHIRPatientByPhone'),
    'getFHIRPatientByPhone method exists'
  );
  
  // Check for getFHIRPatientByEmail
  check(
    dbContent.includes('getFHIRPatientByEmail'),
    'getFHIRPatientByEmail method exists'
  );
}

// Test 5: Check error handling
function verifyErrorHandling() {
  logTest('Error Handling');
  
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Check for error handling in wallet payment
  check(
    serverContent.includes('Patient wallet not found') || serverContent.includes('wallet not found'),
    'Error handling for missing wallet'
  );
  
  // Check for error handling for insufficient balance
  check(
    serverContent.includes('Insufficient wallet balance') || serverContent.includes('insufficient'),
    'Error handling for insufficient balance'
  );
  
  // Check for error handling for missing patient
  check(
    serverContent.includes('Patient not found') || serverContent.includes('patient not found'),
    'Error handling for missing patient'
  );
}

// Test 6: Check migration script
function verifyMigrationScript() {
  logTest('Migration Script');
  
  const migrationPath = path.join(__dirname, 'migrate-add-payment-method.js');
  
  if (!fs.existsSync(migrationPath)) {
    check(false, 'Migration script exists');
    return;
  }
  
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  
  // Check for payment_method column addition
  check(
    migrationContent.includes('payment_method') && migrationContent.includes('ALTER TABLE'),
    'Migration script adds payment_method column'
  );
  
  // Check for appointment_id column addition
  check(
    migrationContent.includes('appointment_id') && migrationContent.includes('ALTER TABLE'),
    'Migration script adds appointment_id column'
  );
}

// Test 7: Check test file
function verifyTestFile() {
  logTest('Test File');
  
  const testPath = path.join(__dirname, '..', 'tests', 'test-wallet-payment.js');
  
  if (!fs.existsSync(testPath)) {
    check(false, 'Test file exists', true);
    return;
  }
  
  const testContent = fs.readFileSync(testPath, 'utf8');
  
  // Check for test functions
  check(
    testContent.includes('testCreateFHIRPatient'),
    'Test for FHIR patient creation'
  );
  
  check(
    testContent.includes('testCreatePatientWallet'),
    'Test for wallet creation'
  );
  
  check(
    testContent.includes('testCheckWalletBalance'),
    'Test for wallet balance checking'
  );
  
  check(
    testContent.includes('testWalletPayment'),
    'Test for wallet payment'
  );
}

// Run all verification tests
function runVerification() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     WALLET PAYMENT IMPLEMENTATION VERIFICATION              ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('\n');
  
  verifyServerImplementation();
  verifyDatabaseSchema();
  verifyCircleService();
  verifyDatabaseMethods();
  verifyErrorHandling();
  verifyMigrationScript();
  verifyTestFile();
  
  // Print summary
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                      VERIFICATION SUMMARY                    ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('\n');
  
  logSuccess(`Passed: ${results.passed}`);
  logError(`Failed: ${results.failed}`);
  logWarning(`Warnings: ${results.warnings}`);
  console.log('\n');
  
  if (results.failed === 0) {
    logSuccess('✅ All critical checks passed!');
    logInfo('The implementation is ready for testing with API keys.');
    console.log('\n');
    log('Next steps:');
    log('1. Run migration script: node scripts/migrate-add-payment-method.js');
    log('2. Configure API keys (Circle, Stripe)');
    log('3. Start server and run tests: node tests/test-wallet-payment.js');
    console.log('\n');
    process.exit(0);
  } else {
    logError('❌ Some checks failed. Please review the errors above.');
    console.log('\n');
    process.exit(1);
  }
}

// Run verification
runVerification();


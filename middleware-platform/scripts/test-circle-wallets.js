/**
 * Test Circle Wallets for 3 Test Accounts
 * Tests wallet creation and balance retrieval for Provider, Insurer, and Patient
 */

require('dotenv').config();
const db = require('../database');
const CircleService = require('../services/circle-service');

const TEST_ACCOUNTS = [
    { entityType: 'provider', entityId: 'default', name: 'Healthcare Provider' },
    { entityType: 'insurer', entityId: 'TEST_INSURER_001', name: 'Insurer Admin' },
    { entityType: 'patient', entityId: 'default', name: 'Patient Wallet' }
];

async function testWallets() {
    console.log('🧪 Testing Circle Wallets for 3 Test Accounts\n');
    console.log('='.repeat(60));

    // Check if Circle Service is available
    if (!CircleService.isAvailable()) {
        console.error('❌ Circle SDK not available or entity secret not configured');
        console.error('   Please run: node scripts/setup-circle-entity-secret.js');
        process.exit(1);
    }

    console.log('✅ Circle Service is available\n');

    // Test each account
    for (const account of TEST_ACCOUNTS) {
        console.log(`\n📦 Testing ${account.name} (${account.entityType}:${account.entityId})...`);
        console.log('-'.repeat(60));

        try {
            // Check if wallet exists in database
            const existingAccount = db.getCircleAccountByEntity(account.entityType, account.entityId);
            
            if (existingAccount) {
                console.log(`   ✅ Wallet exists: ${existingAccount.circle_wallet_id}`);
                
                // Get wallet balance
                const balanceResult = await CircleService.getWalletBalance(existingAccount.circle_wallet_id);
                if (balanceResult.success) {
                    console.log(`   💰 Balance:`, balanceResult.balances);
                } else {
                    console.log(`   ⚠️  Could not get balance: ${balanceResult.error || 'Unknown error'}`);
                }
            } else {
                console.log(`   ⚠️  Wallet not found in database`);
                console.log(`   💡 Create wallet via API: POST /api/circle/wallets`);
                console.log(`      Body: { "entityType": "${account.entityType}", "entityId": "${account.entityId}" }`);
            }
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Wallet testing complete!');
    console.log('\n💡 Next Steps:');
    console.log('   1. View wallets in frontend: http://localhost:8000/business/wallets.html');
    console.log('   2. Create missing wallets via API or frontend');
    console.log('   3. Fund test wallets if needed');
    console.log('   4. Test payment transfers between wallets');
}

testWallets().catch(console.error);


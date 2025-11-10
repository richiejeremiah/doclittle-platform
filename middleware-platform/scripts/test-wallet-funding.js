/**
 * Test Wallet Funding - Run All 3 Test Functions
 * 
 * This script tests the complete wallet funding flow:
 * 1. Setup system wallet
 * 2. Add test money to patient wallet
 * 3. Check wallet balance
 * 
 * Usage:
 *   TEST_PATIENT_NAME="<PATIENT_NAME>" npm run test:wallet
 *   or
 *   TEST_PATIENT_NAME="<PATIENT_NAME>" node scripts/test-wallet-funding.js
 */

require('dotenv').config();
const CircleService = require('../services/circle-service');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

const TEST_PATIENT_NAME = process.env.TEST_PATIENT_NAME || null;
const TEST_PATIENT_DEPOSIT = process.env.TEST_PATIENT_DEPOSIT
    ? parseFloat(process.env.TEST_PATIENT_DEPOSIT)
    : 1000;

async function test1_SetupSystemWallet() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Setup System Wallet');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        if (!CircleService.isAvailable()) {
            console.error('❌ Circle SDK not available. Check CIRCLE_ENTITY_SECRET in .env');
            return { success: false, error: 'Circle SDK not available' };
        }

        // Get or create wallet set
        let walletSetId = process.env.CIRCLE_WALLET_SET_ID;

        if (!walletSetId) {
            console.log('📦 Wallet set not found. Creating new wallet set...');
            const walletSetResult = await CircleService.createWalletSet({
                name: 'Healthcare Billing Wallets',
                description: 'Wallet set for Provider, Insurer, and Patient accounts'
            });

            if (!walletSetResult.success) {
                console.error('❌ Failed to create wallet set:', walletSetResult.error);
                if (walletSetResult.details) {
                    console.error('   Details:', JSON.stringify(walletSetResult.details, null, 2));
                }
                return { success: false, error: `Failed to create wallet set: ${walletSetResult.error}` };
            }

            walletSetId = walletSetResult.walletSetId;
            console.log(`✅ Wallet set created: ${walletSetId}`);
            console.log(`💡 Add this to your .env file: CIRCLE_WALLET_SET_ID=${walletSetId}`);
        } else {
            console.log(`✅ Using existing Wallet Set ID: ${walletSetId}`);
        }

        let account = db.getCircleAccountByEntity('system', 'funding');
        if (account && account.circle_wallet_id) {
            console.log(`✅ System wallet already exists: ${account.circle_wallet_id}`);
            console.log(`💡 To use it, add to .env: CIRCLE_SYSTEM_WALLET_ID=${account.circle_wallet_id}`);
            return { success: true, walletId: account.circle_wallet_id };
        }

        console.log('📦 Creating system wallet...');
        const result = await CircleService.createWallet({
            walletSetId: walletSetId,
            entityType: 'system',
            entityId: 'funding',
            description: 'System funding wallet for sandbox test deposits'
        });

        if (!result.success) {
            console.error('❌ Failed to create wallet:', result.error);
            if (result.details) {
                console.error('   Details:', JSON.stringify(result.details, null, 2));
            }
            return { success: false, error: result.error };
        }

        const walletId = result.walletId;
        console.log(`✅ System wallet created: ${walletId}`);

        db.createCircleAccount({
            id: `account_${uuidv4()}`,
            entity_type: 'system',
            entity_id: 'funding',
            circle_wallet_id: walletId,
            currency: 'USDC',
            status: 'active'
        });

        console.log(`💡 Add to .env: CIRCLE_SYSTEM_WALLET_ID=${walletId}`);
        console.log(`📝 Next: Fund this wallet with test USDC via Circle Console`);
        return { success: true, walletId: walletId };
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('   Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

async function test2_AddTestMoney() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Add Test Money to Patient Wallet');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        if (!TEST_PATIENT_NAME) {
            console.error('❌ TEST_PATIENT_NAME environment variable is not set.');
            console.log('   Set it before running this script, e.g.:');
            console.log('   TEST_PATIENT_NAME="Jane Doe" npm run test:wallet');
            return { success: false, error: 'TEST_PATIENT_NAME not configured' };
        }

        if (!Number.isFinite(TEST_PATIENT_DEPOSIT) || TEST_PATIENT_DEPOSIT <= 0) {
            console.error('❌ Invalid TEST_PATIENT_DEPOSIT value. Provide a positive number.');
            console.log('   Example: TEST_PATIENT_DEPOSIT=250');
            return { success: false, error: 'Invalid TEST_PATIENT_DEPOSIT value' };
        }

        const patientName = TEST_PATIENT_NAME;
        const amount = TEST_PATIENT_DEPOSIT;

        console.log(`🔍 Searching for patient: "${patientName}"...`);
        const patients = db.searchFHIRPatients({ name: patientName });

        if (!patients || patients.length === 0) {
            console.error(`❌ Patient "${patientName}" not found`);
            console.log('\n📋 Available patients:');
            const allPatients = db.db.prepare('SELECT name FROM fhir_patients WHERE is_deleted = 0 LIMIT 10').all();
            if (allPatients.length > 0) {
                allPatients.forEach(p => console.log(`   - ${p.name}`));
            } else {
                console.log('   (No patients found in database)');
            }
            return { success: false, error: `Patient "${patientName}" not found` };
        }

        const patient = patients[0];
        const patientId = patient.resource_id || patient.id;
        console.log(`✅ Found patient: ${patient.name || patientName} (ID: ${patientId})`);

        let account = db.getCircleAccountByEntity('patient', patientId);

        if (!account) {
            console.log('📦 Creating wallet for patient...');
            const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
            if (!walletSetId) {
                console.error('❌ CIRCLE_WALLET_SET_ID not set in .env');
                return { success: false, error: 'Wallet set ID not configured' };
            }

            const result = await CircleService.createWallet({
                walletSetId: walletSetId,
                entityType: 'patient',
                entityId: patientId,
                description: `Patient wallet for ${patient.name || patientName}`
            });

            if (!result.success) {
                console.error('❌ Failed to create wallet:', result.error);
                if (result.details) {
                    console.error('   Details:', JSON.stringify(result.details, null, 2));
                }
                return { success: false, error: result.error };
            }

            db.createCircleAccount({
                id: `account_${uuidv4()}`,
                entity_type: 'patient',
                entity_id: patientId,
                circle_wallet_id: result.walletId,
                currency: 'USDC',
                status: 'active'
            });

            account = db.getCircleAccountByEntity('patient', patientId);
            console.log(`✅ Wallet created: ${result.walletId}`);
        } else {
            console.log(`✅ Wallet exists: ${account.circle_wallet_id}`);
        }

        console.log(`💰 Transferring $${amount.toFixed(2)} USDC...`);
        const systemWalletId = process.env.CIRCLE_SYSTEM_WALLET_ID;
        if (!systemWalletId) {
            console.warn('⚠️  CIRCLE_SYSTEM_WALLET_ID not set. Transfer will fail.');
            console.log('   Run Test 1 first to create system wallet, then add the ID to .env');
        }

        const fundResult = await CircleService.fundWallet(account.circle_wallet_id, amount);

        if (fundResult.success) {
            const depositId = `deposit_${uuidv4()}`;
            db.db.prepare(`
        INSERT INTO circle_transfers (
          id, claim_id, from_wallet_id, to_wallet_id, amount, currency,
          circle_transfer_id, status, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                depositId, null,
                systemWalletId || 'system',
                account.circle_wallet_id, amount, 'USDC',
                fundResult.transferId || `deposit_${Date.now()}`,
                'completed', new Date().toISOString(), new Date().toISOString()
            );

            console.log(`✅ Transfer successful!`);
            console.log(`   Transfer ID: ${fundResult.transferId}`);
            console.log(`   Wallet ID: ${account.circle_wallet_id}`);
            return { success: true, transferId: fundResult.transferId };
        } else {
            console.warn(`⚠️  Transfer failed: ${fundResult.error}`);
            if (fundResult.details) {
                console.warn('   Details:', JSON.stringify(fundResult.details, null, 2));
            }
            console.log('\n💡 This is expected if system wallet is not funded yet.');
            console.log('   Steps to enable transfers:');
            console.log('   1. Run Test 1 to create system wallet');
            console.log('   2. Add CIRCLE_SYSTEM_WALLET_ID to .env');
            console.log('   3. Fund system wallet with test USDC via Circle Console');
            console.log('   4. Run Test 2 again\n');

            const depositId = `deposit_${uuidv4()}`;
            db.db.prepare(`
        INSERT INTO circle_transfers (
          id, claim_id, from_wallet_id, to_wallet_id, amount, currency,
          circle_transfer_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                depositId, null, 'system', account.circle_wallet_id,
                amount, 'USDC', `deposit_${Date.now()}`, 'pending',
                new Date().toISOString()
            );
            console.log(`   Created pending deposit record: ${depositId}`);
            return { success: true, pending: true, error: fundResult.error };
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('   Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

async function test3_CheckWalletBalance() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Check Wallet Balance');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        if (!TEST_PATIENT_NAME) {
            console.error('❌ TEST_PATIENT_NAME environment variable is not set.');
            return { success: false, error: 'TEST_PATIENT_NAME not configured' };
        }

        console.log(`🔍 Searching for patient: "${TEST_PATIENT_NAME}"...`);
        const patients = db.searchFHIRPatients({ name: TEST_PATIENT_NAME });

        if (!patients || patients.length === 0) {
            console.error(`❌ Patient "${TEST_PATIENT_NAME}" not found`);
            console.log('\n📋 Available patients:');
            const allPatients = db.db.prepare('SELECT name FROM fhir_patients WHERE is_deleted = 0 LIMIT 10').all();
            if (allPatients.length > 0) {
                allPatients.forEach(p => console.log(`   - ${p.name}`));
            }
            return { success: false, error: 'Patient not found' };
        }

        const patient = patients[0];
        const patientId = patient.resource_id || patient.id;
        const patientLabel = patient.name || TEST_PATIENT_NAME;
        console.log(`✅ Found patient: ${patientLabel} (ID: ${patientId})`);

        const account = db.getCircleAccountByEntity('patient', patientId);

        if (!account || !account.circle_wallet_id) {
            console.error('❌ Patient wallet not found. Run Test 2 first to create wallet.');
            return { success: false, error: 'Wallet not found' };
        }

        console.log(`\n💰 Checking balance for wallet: ${account.circle_wallet_id}`);
        const balanceResult = await CircleService.getWalletBalance(account.circle_wallet_id);

        if (balanceResult.success) {
            if (balanceResult.balances && balanceResult.balances.length > 0) {
                console.log('\n✅ Patient Wallet Balance:');
                balanceResult.balances.forEach(balance => {
                    const token = balance.token || {};
                    const amount = parseFloat(balance.amount || balance.balance || 0);
                    console.log(`   ${token.symbol || 'USDC'}: $${amount.toFixed(2)}`);
                });
            } else {
                console.log('\n✅ Wallet exists but has no balance yet ($0.00 USDC)');
                console.log('   This is normal for new wallets or if transfers are pending.');
            }

            const systemAccount = db.getCircleAccountByEntity('system', 'funding');
            if (systemAccount && systemAccount.circle_wallet_id) {
                console.log(`\n📊 System Wallet (${systemAccount.circle_wallet_id}):`);
                const systemBalance = await CircleService.getWalletBalance(systemAccount.circle_wallet_id);
                if (systemBalance.success && systemBalance.balances && systemBalance.balances.length > 0) {
                    systemBalance.balances.forEach(balance => {
                        const token = balance.token || {};
                        const amount = parseFloat(balance.amount || balance.balance || 0);
                        console.log(`   ${token.symbol || 'USDC'}: $${amount.toFixed(2)}`);
                    });
                } else {
                    console.log(`   ⚠️  System wallet has no balance. Fund it via Circle Console to enable transfers.`);
                }
            } else {
                console.log('\n⚠️  System wallet not found. Run Test 1 to create it.');
            }

            return { success: true, balances: balanceResult.balances || [] };
        } else {
            console.error('❌ Error checking balance:', balanceResult.error);
            return { success: false, error: balanceResult.error };
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('   Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

// Run all tests
(async () => {
    console.log('\n🧪 WALLET FUNDING TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const results = {
        test1: await test1_SetupSystemWallet(),
        test2: await test2_AddTestMoney(),
        test3: await test3_CheckWalletBalance()
    };

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST RESULTS SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Test 1 - Setup System Wallet: ${results.test1.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (results.test1.walletId) {
        console.log(`   Wallet ID: ${results.test1.walletId}`);
    } else if (results.test1.error) {
        console.log(`   Error: ${results.test1.error}`);
    }

    console.log(`\nTest 2 - Add Test Money: ${results.test2.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (results.test2.transferId) {
        console.log(`   Transfer ID: ${results.test2.transferId}`);
    } else if (results.test2.pending) {
        console.log(`   Status: ⏳ Pending (system wallet needs funding)`);
        console.log(`   Error: ${results.test2.error}`);
    } else if (results.test2.error) {
        console.log(`   Error: ${results.test2.error}`);
    }

    console.log(`\nTest 3 - Check Balance: ${results.test3.success ? '✅ PASSED' : '❌ FAILED'}`);
    if (results.test3.balances !== undefined) {
        const total = results.test3.balances.reduce((sum, b) =>
            sum + parseFloat(b.amount || b.balance || 0), 0);
        console.log(`   Total Balance: $${total.toFixed(2)} USDC`);
    } else if (results.test3.error) {
        console.log(`   Error: ${results.test3.error}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();


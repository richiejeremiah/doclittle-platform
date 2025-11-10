/**
 * Setup Wallet Configuration
 * 
 * This script helps you:
 * 1. View all existing wallets in the database
 * 2. Choose a wallet set to use
 * 3. Create a system wallet in that wallet set
 * 4. Generate .env configuration
 * 
 * Usage:
 *   node scripts/setup-wallet-config.js
 */

require('dotenv').config();
const db = require('../database');
const CircleService = require('../services/circle-service');
const { v4: uuidv4 } = require('uuid');

async function setupWalletConfig() {
    console.log('\n🔧 Circle Wallet Configuration Setup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check if SDK is available
    if (!CircleService.isAvailable()) {
        console.error('❌ Circle SDK not available. Check CIRCLE_ENTITY_SECRET in .env');
        return;
    }

    try {
        // Get all wallets from database
        console.log('📋 Existing Wallets in Database:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const allAccounts = db.db.prepare('SELECT * FROM circle_accounts ORDER BY created_at DESC').all();

        if (allAccounts.length === 0) {
            console.log('   No wallets found in database.\n');
        } else {
            allAccounts.forEach((account, index) => {
                console.log(`${index + 1}. ${account.entity_type}:${account.entity_id}`);
                console.log(`   Wallet ID: ${account.circle_wallet_id}`);
                console.log(`   Status: ${account.status}`);
                console.log(`   Created: ${account.created_at}`);
                console.log('');
            });
        }

        // Check for system wallet
        console.log('🔍 Checking system wallet...\n');
        const systemWallet = db.getCircleAccountByEntity('system', 'funding');

        if (systemWallet) {
            console.log(`✅ System wallet found:`);
            console.log(`   Wallet ID: ${systemWallet.circle_wallet_id}`);
            console.log('');
        } else {
            console.log('   ⚠️  System wallet not found.\n');
        }

        // Get or create wallet set
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📦 Wallet Set Configuration');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        let walletSetId = process.env.CIRCLE_WALLET_SET_ID;

        if (!walletSetId) {
            console.log('⚠️  CIRCLE_WALLET_SET_ID not set in .env');
            console.log('   Creating new wallet set...\n');

            const walletSetResult = await CircleService.createWalletSet({
                name: 'Healthcare Billing Wallets',
                description: 'Wallet set for Provider, Insurer, and Patient accounts'
            });

            if (!walletSetResult.success) {
                console.error('❌ Failed to create wallet set:', walletSetResult.error);
                return;
            }

            walletSetId = walletSetResult.walletSetId;
            console.log(`✅ Wallet set created: ${walletSetId}\n`);
        } else {
            console.log(`✅ Using existing wallet set: ${walletSetId}\n`);
        }

        // Create system wallet if it doesn't exist
        if (!systemWallet) {
            console.log('📦 Creating system wallet...\n');

            const result = await CircleService.createWallet({
                walletSetId: walletSetId,
                entityType: 'system',
                entityId: 'funding',
                description: 'System funding wallet for sandbox test deposits'
            });

            if (!result.success) {
                console.error('❌ Failed to create system wallet:', result.error);
                return;
            }

            const systemWalletId = result.walletId;
            console.log(`✅ System wallet created: ${systemWalletId}\n`);

            // Save to database
            db.createCircleAccount({
                id: `account_${uuidv4()}`,
                entity_type: 'system',
                entity_id: 'funding',
                circle_wallet_id: systemWalletId,
                currency: 'USDC',
                status: 'active'
            });

            // Get wallet address
            try {
                const walletInfo = await CircleService.getWallet(systemWalletId);
                if (walletInfo.success && walletInfo.walletData) {
                    const walletData = walletInfo.walletData.data?.wallet || walletInfo.walletData.wallet || walletInfo.walletData.data || walletInfo.walletData;
                    console.log(`   Wallet Address: ${walletData.address || 'N/A'}`);
                    console.log(`   Blockchain: ${walletData.blockchain || 'N/A'}`);
                    console.log('');
                }
            } catch (error) {
                console.log(`   ⚠️  Could not fetch wallet address: ${error.message}\n`);
            }
        }

        // Generate .env configuration
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 .env Configuration');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('Add these to your .env file:\n');
        console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);

        const finalSystemWallet = db.getCircleAccountByEntity('system', 'funding');
        if (finalSystemWallet) {
            console.log(`CIRCLE_SYSTEM_WALLET_ID=${finalSystemWallet.circle_wallet_id}`);
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 Next Steps');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('1. Add the above configuration to your .env file');
        console.log('2. Fund the system wallet with test USDC via Circle Console');
        console.log('   - Go to: https://console.circle.com');
        console.log('   - Find wallet:', finalSystemWallet?.circle_wallet_id || 'N/A');
        console.log('   - Use Circle\'s testnet faucet or mint capability');
        console.log('3. Run the test again: npm run test:wallet');
        console.log('');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('   Stack:', error.stack);
    }
}

setupWalletConfig();


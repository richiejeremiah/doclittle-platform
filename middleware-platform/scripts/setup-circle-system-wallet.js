/**
 * Setup Circle System Wallet for Sandbox Funding
 * 
 * This script creates a system wallet that can be used to fund patient wallets
 * with test USDC in the Circle sandbox environment.
 * 
 * Usage:
 *   node scripts/setup-circle-system-wallet.js
 */

require('dotenv').config();
const CircleService = require('../services/circle-service');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

async function setupSystemWallet() {
  try {
    console.log('\n🔧 Setting Up Circle System Wallet for Sandbox Funding');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!CircleService.isAvailable()) {
      console.error('❌ Circle SDK not available. Please set CIRCLE_ENTITY_SECRET in .env');
      process.exit(1);
    }

    const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
    if (!walletSetId) {
      console.error('❌ CIRCLE_WALLET_SET_ID not set. Please create a wallet set first.');
      process.exit(1);
    }

    // Check if system wallet already exists
    const existingAccount = db.getCircleAccountByEntity('system', 'funding');
    if (existingAccount && existingAccount.circle_wallet_id) {
      console.log(`✅ System wallet already exists: ${existingAccount.circle_wallet_id}`);
      console.log(`\n💡 To use this wallet, add to .env:`);
      console.log(`   CIRCLE_SYSTEM_WALLET_ID=${existingAccount.circle_wallet_id}`);
      console.log(`\n📝 Next steps:`);
      console.log(`   1. Go to Circle Console: https://console.circle.com`);
      console.log(`   2. Find wallet: ${existingAccount.circle_wallet_id}`);
      console.log(`   3. Fund it with test USDC (use Circle's testnet faucet or mint capability)`);
      console.log(`   4. Once funded, patient wallets can receive test USDC transfers\n`);
      return;
    }

    // Create system wallet
    console.log('📦 Creating system funding wallet...');
    const result = await CircleService.createWallet({
      walletSetId: walletSetId,
      entityType: 'system',
      entityId: 'funding',
      description: 'System funding wallet for sandbox test deposits'
    });

    if (!result.success) {
      console.error('❌ Failed to create system wallet:', result.error);
      process.exit(1);
    }

      const walletId = result.walletId;
      console.log(`✅ System wallet created: ${walletId}`);

      // Save to database
      db.createCircleAccount({
        id: `account_${uuidv4()}`,
        entity_type: 'system',
        entity_id: 'funding',
        circle_wallet_id: walletId,
        currency: 'USDC',
        status: 'active'
      });

      console.log(`\n💡 Add this to your .env file:`);
      console.log(`   CIRCLE_SYSTEM_WALLET_ID=${walletId}`);
      console.log(`\n📝 Next steps to fund the wallet:`);
      console.log(`   1. Go to Circle Console: https://console.circle.com`);
      console.log(`   2. Navigate to your wallet set`);
      console.log(`   3. Find wallet: ${walletId}`);
      console.log(`   4. Fund it with test USDC:`);
      console.log(`      - Use Circle's testnet faucet (if available)`);
      console.log(`      - Or use Circle Console to mint test USDC`);
      console.log(`      - Or transfer test USDC from another testnet wallet`);
      console.log(`   5. Once funded, patient wallets can receive test USDC via "Add Money"\n`);

  } catch (error) {
    console.error('\n❌ Error setting up system wallet:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupSystemWallet();

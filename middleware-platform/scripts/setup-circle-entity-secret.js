/**
 * Setup Circle Entity Secret
 * Generates and registers an Entity Secret with Circle
 * 
 * Documentation: https://developers.circle.com/wallets/dev-controlled/register-entity-secret
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

let CircleSDK;
try {
    CircleSDK = require('@circle-fin/developer-controlled-wallets');
} catch (error) {
    console.error('❌ Circle SDK not installed. Run: npm install @circle-fin/developer-controlled-wallets');
    process.exit(1);
}

const API_KEY = process.env.CIRCLE_API_KEY;
if (!API_KEY) {
    console.error('❌ CIRCLE_API_KEY environment variable is required');
    console.error('   Please set it in your .env file or export it before running this script');
    console.error('   Get your API key from: https://console.circle.com/');
    process.exit(1);
}

async function setupEntitySecret() {
    console.log('🔐 Setting up Circle Entity Secret...\n');
    console.log('📚 Documentation: https://developers.circle.com/wallets/dev-controlled/register-entity-secret\n');

    // Step 1: Generate Entity Secret
    console.log('📦 Step 1: Generating Entity Secret...');
    let entitySecret;
    const crypto = require('crypto');
    
    // Check if entity secret already exists in .env
    if (process.env.CIRCLE_ENTITY_SECRET || process.env.ENTITY_SECRET) {
        entitySecret = process.env.CIRCLE_ENTITY_SECRET || process.env.ENTITY_SECRET;
        console.log('   ℹ️  Using existing Entity Secret from .env file');
        console.log(`   🔹 Entity Secret: ${entitySecret.substring(0, 20)}...${entitySecret.slice(-10)}`);
        console.log('   ⚠️  If you want to generate a new one, remove CIRCLE_ENTITY_SECRET from .env first\n');
    } else {
        // Generate new Entity Secret (32-byte hex string)
        console.log('   🔹 Generating new Entity Secret (32-byte hex string)...');
        entitySecret = crypto.randomBytes(32).toString('hex');
        console.log(`   ✅ Entity Secret generated: ${entitySecret}\n`);
        console.log('   ⚠️  IMPORTANT: Save this Entity Secret securely!');
        console.log('   💡 This will be added to your .env file automatically\n');
    }

    // Step 2: Register Entity Secret with Circle
    console.log('📦 Step 2: Registering Entity Secret with Circle...');
    console.log('   🔹 API Key: ' + API_KEY.split(':')[0] + ':' + API_KEY.split(':')[1] + ':***');
    
    // Create recovery file directory and path
    const recoveryDir = path.join(__dirname, '..');
    const recoveryFileName = `circle-entity-secret-recovery-${Date.now()}.json`;
    const recoveryFilePath = path.join(recoveryDir, recoveryFileName);
    
    try {
        console.log('   🔹 Registering Entity Secret Ciphertext...');
        console.log('   🔹 Recovery file will be saved to: ' + recoveryFilePath);
        
        const result = await CircleSDK.registerEntitySecretCiphertext({
            apiKey: API_KEY,
            entitySecret: entitySecret,
            recoveryFileDownloadPath: recoveryDir  // Directory path, not file path
        });
        
        // The SDK saves the recovery file automatically, but we can also handle it manually
        if (result.data?.recoveryFile) {
            fs.writeFileSync(recoveryFilePath, result.data.recoveryFile, 'utf8');
        }

        console.log('   ✅ Entity Secret registered successfully!');
        console.log('   ✅ Recovery file saved to: ' + recoveryFilePath);
        console.log('\n   ⚠️  CRITICAL: Save the recovery file in a secure location!');
        console.log('   💡 This is the only way to recover your Entity Secret if it\'s lost.\n');

        // Step 3: Update .env file
        console.log('📦 Step 3: Updating .env file...');
        const envPath = path.join(__dirname, '..', '.env');
        
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Update or add CIRCLE_API_KEY
        if (envContent.includes('CIRCLE_API_KEY=')) {
            envContent = envContent.replace(/CIRCLE_API_KEY=.*/g, `CIRCLE_API_KEY=${API_KEY}`);
        } else {
            envContent += `\n# Circle API Configuration\nCIRCLE_API_KEY=${API_KEY}\n`;
        }

        // Update or add CIRCLE_ENTITY_SECRET
        if (envContent.includes('CIRCLE_ENTITY_SECRET=')) {
            envContent = envContent.replace(/CIRCLE_ENTITY_SECRET=.*/g, `CIRCLE_ENTITY_SECRET=${entitySecret}`);
        } else {
            envContent += `CIRCLE_ENTITY_SECRET=${entitySecret}\n`;
        }

        // Add other Circle config if not present
        if (!envContent.includes('CIRCLE_BASE_URL=')) {
            envContent += `CIRCLE_BASE_URL=https://api-sandbox.circle.com\n`;
        }
        if (!envContent.includes('CIRCLE_ENVIRONMENT=')) {
            envContent += `CIRCLE_ENVIRONMENT=sandbox\n`;
        }

        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log('   ✅ .env file updated\n');

        console.log('✅ Entity Secret setup complete!');
        console.log('\n📋 Summary:');
        console.log('   ✅ Entity Secret generated');
        console.log('   ✅ Entity Secret registered with Circle');
        console.log('   ✅ Recovery file saved');
        console.log('   ✅ .env file updated');
        console.log('\n💡 Next Steps:');
        console.log('   1. Verify .env file has CIRCLE_ENTITY_SECRET set');
        console.log('   2. Securely backup the recovery file');
        console.log('   3. Run: node scripts/setup-circle-wallets.js');
        console.log('   4. Test wallet creation');

    } catch (error) {
        console.error('\n❌ Error registering Entity Secret:');
        console.error('   Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Details:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Verify API key is correct');
        console.error('   2. Check API key has proper permissions');
        console.error('   3. Verify you\'re using the correct Circle account');
        console.error('   4. Check Circle Console for account status');
        process.exit(1);
    }
}

// Run setup
setupEntitySecret().catch(console.error);


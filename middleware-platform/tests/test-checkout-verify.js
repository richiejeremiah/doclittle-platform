/**
 * VERIFY CODE AND SEND PAYMENT LINK TEST
 * 
 * Tests the verification step:
 * 1. Verify code with token
 * 2. Payment link email should be sent
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000';

const token = process.argv[2];
const code = process.argv[3];

if (!token || !code) {
  console.error('Usage: node test-checkout-verify.js <payment_token> <verification_code>');
  console.error('Example: node test-checkout-verify.js abc123... 456789');
  process.exit(1);
}

async function testVerification() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 VERIFY CODE TEST');
  console.log('='.repeat(60));

  try {
    console.log('\n🔐 Step 2: Verifying code...');
    console.log('   Token:', token.substring(0, 20) + '...');
    console.log('   Code:', code);

    const verifyResponse = await axios.post(`${API_BASE}/voice/checkout/verify`, {
      payment_token: token,
      code: code
    });

    if (!verifyResponse.data.success) {
      throw new Error(`Verification failed: ${verifyResponse.data.error}`);
    }

    console.log('✅ Code verified successfully!');
    console.log('   Message:', verifyResponse.data.message);
    console.log('   Checkout ID:', verifyResponse.data.checkout_id);

    console.log('\n📧 Email 2 should be sent with payment link');
    console.log('   Check email inbox or server logs');

    console.log('\n✅ Full flow completed!');
    console.log('   User should now have payment link in email');

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status);
      console.error('   Error:', error.response.data.error || error.response.data);
      if (error.response.status === 400) {
        console.error('\n💡 Common issues:');
        console.error('   - Code expired (10 minutes)');
        console.error('   - Code mismatch');
        console.error('   - Invalid token');
      }
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

testVerification();


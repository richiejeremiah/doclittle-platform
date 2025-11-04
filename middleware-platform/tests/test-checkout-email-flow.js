/**
 * CHECKOUT EMAIL FLOW TEST
 * 
 * Tests the two-email checkout flow:
 * 1. Create checkout → Email 1: Verification code sent
 * 2. Verify code → Email 2: Payment link sent
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000';

async function testCheckoutFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 CHECKOUT EMAIL FLOW TEST');
  console.log('='.repeat(60));

  try {
    // Step 1: Create checkout
    console.log('\n📦 Step 1: Creating checkout...');
    const checkoutResponse = await axios.post(`${API_BASE}/voice/checkout/create`, {
      args: {
        merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
        product_id: 'VIT-D3-5000',
        customer_name: 'Mary April',
        customer_email: 'tylert16@ymail.com',
        customer_phone: '8262307479',
        quantity: 1
      }
    });

    if (!checkoutResponse.data.success) {
      throw new Error(`Checkout failed: ${checkoutResponse.data.error}`);
    }

    const checkout = checkoutResponse.data;
    console.log('✅ Checkout created:', checkout.checkout_id);
    console.log('   Payment Token:', checkout.payment_token);
    console.log('   Requires Verification:', checkout.requires_verification);
    console.log('   Email Sent:', checkout.email_sent);
    console.log('   Message:', checkout.message);

    if (!checkout.payment_token) {
      throw new Error('❌ payment_token not returned from checkout');
    }

    if (!checkout.requires_verification) {
      console.warn('⚠️  Warning: requires_verification is false');
    }

    console.log('\n📧 Email 1 should be sent to:', 'tylert16@ymail.com');
    console.log('   Check console logs or email inbox for verification code');

    // Step 2: Get verification code from token (simulating user entering it)
    // In real flow, user would enter the code from email
    // For testing, we need to retrieve it from the database
    console.log('\n⏸️  PAUSE: Please check email for verification code');
    console.log('   Or check server logs for the code (if SMTP not configured)');
    console.log('   Then run: node tests/test-checkout-verify.js <token> <code>');

    return {
      success: true,
      checkout_id: checkout.checkout_id,
      payment_token: checkout.payment_token,
      email: 'tylert16@ymail.com'
    };

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Error:', error.message);
    }
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  testCheckoutFlow()
    .then(result => {
      console.log('\n✅ Test completed successfully!');
      console.log('\nNext steps:');
      console.log(`   1. Check email at ${result.email} for verification code`);
      console.log(`   2. Run: node tests/test-checkout-verify.js ${result.payment_token} <code>`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testCheckoutFlow };


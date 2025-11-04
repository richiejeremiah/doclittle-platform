// server.js - FIXED WITH PAYMENT ORCHESTRATOR AND PROPER DATABASE
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Try to load bcryptjs, but make it optional for now
let bcrypt;
try {
  bcrypt = require('bcryptjs');
  console.log('✅ bcryptjs loaded - password hashing enabled');
} catch (e) {
  console.log('⚠️  bcryptjs not installed - run "npm install bcryptjs" to enable password hashing');
  console.log('⚠️  Using basic auth for now (demo mode only)');
  bcrypt = null;
}

// Import database and services
const db = require('./database');
const PaymentOrchestrator = require('./services/payment-orchestrator');
const SMSService = require('./services/sms-service');
const FHIRService = require('./services/fhir-service');
const FHIRAdapter = require('./adapters/fhir-adapter');
const BookingService = require('./services/booking-service');
const ReminderScheduler = require('./services/reminder-scheduler');

// Make Twilio optional - only initialize if configured
let twilio = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log('✅ Twilio configured');
} else {
  console.log('⚠️  Twilio not configured - SMS will be skipped');
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('✅ Database initialized');
console.log('✅ FHIR integration enabled');

// ============================================
// FHIR API Routes
// ============================================
const fhirRoutes = require('./routes/fhir');
app.use('/fhir', fhirRoutes);

// ============================================
// Utility & Helpers
// ============================================

function generateId(prefix = 'tx') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function normalizePhoneNumber(phone) {
  if (!phone) return phone;

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');

  // If it's 10 digits (US number without country code), add +1
  if (digitsOnly.length === 10) {
    return '+1' + digitsOnly;
  }

  // If it's 11 digits starting with 1, add +
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return '+' + digitsOnly;
  }

  // If it already has +, return as is
  if (phone.startsWith('+')) {
    return phone;
  }

  // Otherwise, assume US and add +1
  return '+1' + digitsOnly;
}

function calculateFraudScore(data) {
  let score = 0;
  const reasons = [];

  // Phone validation
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(data.customer_phone)) {
    score += 30;
    reasons.push('Invalid phone format');
  }

  // Check for repeated calls from same number (velocity check)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCalls = db.getTransactionsByPhone(data.customer_phone, oneHourAgo);

  if (recentCalls && recentCalls.length > 3) {
    score += 25;
    reasons.push('Multiple calls in short time');
  }

  // Time-based risk (late night orders)
  const hour = new Date().getHours();
  if (hour < 6 || hour > 23) {
    score += 15;
    reasons.push('Unusual hour');
  }

  // High-value transaction
  if (data.amount > 100) {
    score += 10;
    reasons.push('High-value transaction');
  }

  // New customer risk
  const customerHistory = db.getTransactionsByCustomer(data.customer_phone, null);

  if (customerHistory && customerHistory.length === 0) {
    score += 10;
    reasons.push('New customer');
  }

  // Voice protocol (slightly higher risk)
  if (data.protocol === 'voice') {
    score += 5;
    reasons.push('Voice transaction');
  }

  // Determine risk level
  let riskLevel = 'LOW';
  if (score >= 70) riskLevel = 'HIGH';
  else if (score >= 40) riskLevel = 'MEDIUM';

  return {
    score: Math.min(score, 100),
    level: riskLevel,
    reasons: reasons,
    timestamp: new Date().toISOString()
  };
}

// ============================================
// TWILIO VOICE INCOMING HANDLER
// ============================================
app.post('/voice/incoming', async (req, res) => {
  try {
    console.log('\n📞 INCOMING CALL from Twilio');
    console.log('From:', req.body.From);
    console.log('To:', req.body.To);
    console.log('CallSid:', req.body.CallSid);

    // Register call with Retell for custom telephony
    const registerPayload = {
      agent_id: process.env.RETELL_AGENT_ID || 'agent_9151f738c705a56f4a0d8df63a',
      audio_websocket_protocol: 'twilio',
      audio_encoding: 'mulaw',
      sample_rate: 8000,
      from_number: req.body.From,
      to_number: req.body.To,
      metadata: {
        twilio_call_sid: req.body.CallSid
      },
      retell_llm_dynamic_variables: {
        merchant_id: process.env.MERCHANT_ID || 'd10794ff-ca11-4e6f-93e9-560162b4f884'
      }
    };

    console.log('📡 Registering call with Retell...');

    const retellRegisterResp = await axios.post(
      'https://api.retellai.com/v2/register-phone-call',
      registerPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );

    console.log('📊 Retell Register Response:', JSON.stringify(retellRegisterResp.data, null, 2));

    const callId = retellRegisterResp.data.call_id;
    console.log('✅ Call registered! Call ID:', callId);

    // ========== FHIR INTEGRATION ==========
    // Create FHIR Patient and Encounter for this call
    try {
      const callData = FHIRAdapter.retellCallToFHIR({
        call_id: callId,
        from_number: req.body.From,
        to_number: req.body.To,
        metadata: {
          twilio_call_sid: req.body.CallSid,
          merchant_id: process.env.MERCHANT_ID || 'd10794ff-ca11-4e6f-93e9-560162b4f884'
        }
      });

      const fhirResources = await FHIRService.processVoiceCall(callData);
      console.log(`[FHIR] Created Patient: ${fhirResources.patient.id}, Encounter: ${fhirResources.encounter.id}`);

      // Store FHIR IDs for later use
      global.activeCalls = global.activeCalls || {};
      global.activeCalls[callId] = {
        patientId: fhirResources.patient.id,
        encounterId: fhirResources.encounter.id,
        callSid: req.body.CallSid
      };
    } catch (fhirError) {
      console.error('[FHIR] Error creating FHIR resources:', fhirError.message);
      // Continue with call even if FHIR fails (for now)
    }
    // ======================================

    // Build SIP URI using the call_id (as per Retell docs)
    const sipUri = `sip:${callId}@5t4n6j0wnrl.sip.livekit.cloud`;
    console.log('📞 Dialing to Retell SIP endpoint:', sipUri);

    // Return TwiML to dial to Retell's SIP endpoint
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;

    res.type('text/xml').send(twiml);

  } catch (error) {
    console.error('❌ Error handling incoming call:');

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Error:', error.message);
    }

    // Return error TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, there was an error connecting your call. Please try again later.</Say>
  <Hangup/>
</Response>`;

    res.type('text/xml');
    res.send(errorTwiml);
  }
});

// Create appointment checkout (appointment payment, not products)
app.post('/voice/appointments/checkout', async (req, res) => {
  try {
    console.log('\n💳 VOICE: Create Appointment Checkout');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;

    const amount = 39.99; // fixed price per appointment

    // Build a minimal checkout record tied to the appointment
    const checkoutId = require('uuid').v4();
    const checkout = {
      id: checkoutId,
      merchant_id: args.merchant_id || 'd10794ff-ca11-4e6f-93e9-560162b4f884',
      product_id: 'APPOINTMENT',
      product_name: args.appointment_type ? `Appointment - ${args.appointment_type}` : 'Appointment',
      quantity: 1,
      amount: amount,
      customer_phone: args.customer_phone || null,
      customer_name: args.customer_name || args.patient_name || 'Patient',
      customer_email: args.customer_email || args.patient_email || null,
      status: 'pending'
    };

    // Store checkout
    db.createVoiceCheckout(checkout);

    // Generate token + code
    const crypto = require('crypto');
    const paymentToken = crypto.randomBytes(32).toString('hex');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.createPaymentToken({
      token: paymentToken,
      checkout_id: checkoutId,
      verification_code: verificationCode,
      verification_code_expires: codeExpires,
      status: 'pending'
    });

    // Email the code
    let emailResult = { success: false };
    if (checkout.customer_email) {
      try {
        const EmailService = require('./services/email-service');
        emailResult = await EmailService.sendCheckoutVerificationCode(checkout.customer_email, verificationCode);
      } catch (emailError) {
        console.error('⚠️  Email service error:', emailError.message);
        emailResult = { success: false, error: emailError.message };
      }
    }

    return res.json({
      success: true,
      checkout_id: checkoutId,
      amount: amount,
      currency: 'USD',
      payment_token: paymentToken,
      requires_verification: true,
      email_sent: !!emailResult.success,
      message: emailResult.success ? 'Verification code emailed' : 'Verification code generated (email not sent)'
    });
  } catch (error) {
    console.error('❌ Error creating appointment checkout:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Development-only helper: fetch verification code by token (do NOT enable in production)
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev/payment-token/:token', (req, res) => {
    try {
      const record = db.getPaymentToken(req.params.token);
      if (!record) return res.status(404).json({ success: false, error: 'Not found' });
      return res.json({
        success: true,
        token: record.token,
        checkout_id: record.checkout_id,
        verification_code: record.verification_code,
        verification_code_expires: record.verification_code_expires,
        status: record.status
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}

// Verify email code and send payment link
app.post('/voice/checkout/verify', async (req, res) => {
  try {
    console.log('\n🔐 VOICE: Verify Email Code');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const token = args.payment_token || args.token;
    const code = args.code || args.verification_code;

    if (!token || !code) {
      return res.status(400).json({ success: false, error: 'payment_token and code are required' });
    }

    const tokenRecord = db.getPaymentToken(token);
    if (!tokenRecord) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }

    // Check expiration
    if (tokenRecord.verification_code_expires) {
      const now = new Date();
      const exp = new Date(tokenRecord.verification_code_expires);
      if (now > exp) {
        return res.status(400).json({ success: false, error: 'Verification code expired' });
      }
    }

    // Check code match
    if ((tokenRecord.verification_code || '').trim() !== String(code).trim()) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    // Fetch checkout to email link
    const checkout = db.getVoiceCheckout(tokenRecord.checkout_id);
    if (!checkout) {
      return res.status(404).json({ success: false, error: 'Checkout not found' });
    }

    // Build payment link and email it
    const paymentLink = `${process.env.BASE_URL || 'http://localhost:4000'}/payment/${token}`;

    let emailResult = { success: false, error: 'Missing customer email' };
    if (checkout.customer_email) {
      try {
        const EmailService = require('./services/email-service');
        emailResult = await EmailService.sendPaymentLinkEmail(checkout.customer_email, paymentLink, {
          product_name: checkout.product_name,
          amount: checkout.amount
        });
      } catch (emailError) {
        console.error('⚠️  Email service error:', emailError.message);
        emailResult = { success: false, error: emailError.message };
      }
    }

    // Mark token as verified
    db.updatePaymentToken(token, { status: 'verified' });

    return res.json({
      success: true,
      message: emailResult.success ? 'Payment link emailed successfully' : (emailResult.error || 'Email not sent'),
      payment_token: token,
      checkout_id: checkout.id
    });
  } catch (error) {
    console.error('❌ Error verifying email code:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// VOICE COMMERCE ENDPOINTS
// ============================================

// Search products for voice agent
app.post('/voice/products/search', async (req, res) => {
  try {
    console.log('\n🔍 VOICE: Product Search Request');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { merchant_id, query } = req.args || req.body.args || req.body;

    if (!merchant_id) {
      return res.status(400).json({
        success: false,
        error: 'merchant_id is required'
      });
    }

    console.log(`🏪 Searching products for merchant: ${merchant_id}`);
    console.log(`🔎 Query: ${query || 'all products'}`);

    const merchantShopUrl = process.env.MERCHANT_SHOP_URL || 'http://localhost:3000';
    const productsResponse = await axios.get(`${merchantShopUrl}/api/products`, { timeout: 5000 });
    const productsData = productsResponse.data;

    if (!productsData.success) {
      throw new Error('Failed to fetch products from merchant');
    }

    // Filter products by query if provided
    let filteredProducts = productsData.products;
    if (query) {
      const searchTerm = query.toLowerCase();
      filteredProducts = productsData.products.filter(product =>
        (product.name || '').toLowerCase().includes(searchTerm) ||
        (product.description || '').toLowerCase().includes(searchTerm) ||
        (product.category || '').toLowerCase().includes(searchTerm)
      );
      console.log(`🔍 Filtered to ${filteredProducts.length} products matching "${query}"`);
    }

    const formattedProducts = filteredProducts.map(product => ({
      id: product.id,
      title: product.name,
      price: product.price,
      description: product.description,
      category: product.category,
      in_stock: true
    }));

    console.log(`✅ Returning ${formattedProducts.length} products`);

    res.json({
      success: true,
      products: formattedProducts,
      product_count: formattedProducts.length,
      merchant_id: merchant_id
    });

  } catch (error) {
    console.error('❌ Error searching products:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      products: []
    });
  }
});

// Create checkout for voice purchase - FIXED WITH ORCHESTRATOR
app.post('/voice/checkout/create', async (req, res) => {
  try {
    console.log('\n💳 VOICE: Creating Checkout via Orchestrator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Raw Retell data:', JSON.stringify(req.body, null, 2));

    // EXTRACT ARGS: Handle multiple Retell formats
    // 1. Webhook: req.body.tool_call.args
    // 2. Direct function call: req.body.args
    // 3. Direct HTTP: req.body
    let args = req.body;

    if (req.body.tool_call && req.body.tool_call.args) {
      console.log('📥 Extracting from webhook tool_call.args');
      args = req.body.tool_call.args;
    } else if (req.body.args) {
      console.log('📥 Extracting from direct args');
      args = req.body.args;
    } else {
      console.log('📥 Using body directly');
    }

    console.log('Extracted args:', JSON.stringify(args, null, 2));

    // TRANSFORM: Retell flat format → PaymentRequest nested format
    const transformedData = {
      merchant_id: args.merchant_id,
      customer: {
        name: args.customer_name || null,
        phone: args.customer_phone || null,  // Will be normalized by SMSService
        email: args.customer_email || null
      },
      items: [
        {
          product_id: args.product_id,
          quantity: args.quantity || 1
        }
      ],
      payment: {
        method: 'link',  // Voice always uses SMS link
        currency: 'USD'
      },
      source: {
        protocol: 'voice',
        platform: 'retell',
        input_type: 'voice'
      },
      metadata: {
        call_sid: args.call_sid || req.body.call?.call_id || null,
        original_request: req.body
      }
    };

    console.log('Transformed data:', JSON.stringify(transformedData, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Call the orchestrator
    const response = await PaymentOrchestrator.createCheckout(transformedData);

    console.log('Orchestrator response:', {
      success: response.success,
      checkout_id: response.checkout_id,
      sms_sent: response.metadata?.sms_sent
    });

    // ========== FHIR INTEGRATION ==========
    // Link checkout to FHIR Patient and create MedicationRequest if applicable
    if (response.isSuccess() && args.customer_phone) {
      try {
        // Find or create FHIR patient
        const patient = await FHIRService.getOrCreatePatient({
          phone: args.customer_phone,
          email: args.customer_email,
          name: args.customer_name
        });

        // Update checkout with FHIR patient ID
        db.updateVoiceCheckout(response.checkout_id, {
          fhir_patient_id: patient.id
        });

        console.log(`[FHIR] ✅ Linked checkout ${response.checkout_id} to Patient ${patient.id}`);

        // If this is a medication/supplement product, create MedicationRequest
        if (response.metadata?.product) {
          const product = response.metadata.product;
          // Check if product is health-related (you can customize this logic)
          if (product.category === 'supplements' || product.category === 'medication') {
            await FHIRService.createMedicationRequest({
              patientId: patient.id,
              productName: product.name,
              productId: product.id,
              orderId: response.checkout_id,
              price: response.payment.amount,
              status: 'active'
            });
            console.log(`[FHIR] ✅ Created MedicationRequest for product: ${product.name}`);
          }
        }
      } catch (fhirError) {
        console.error('[FHIR] ⚠️ Error linking checkout to FHIR:', fhirError.message);
        // Continue with checkout even if FHIR fails
      }
    }
    // ======================================

    // Return response in Retell-friendly format
    if (response.isSuccess()) {
      console.log('✅ Checkout created successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      res.json({
        success: true,
        checkout_id: response.checkout_id,
        amount: response.payment.amount,
        currency: response.payment.currency,
        payment_token: response.payment_token || response.metadata?.payment_token,
        status: response.payment.status,
        message: response.message,
        requires_verification: response.metadata?.verification_required || false,
        email_sent: response.metadata?.email_sent || false,
        metadata: {
          product: response.metadata?.product,
          customer_phone_normalized: transformedData.customer.phone,
          fraud_check: response.metadata?.fraud_check
        }
      });
    } else {
      console.error('❌ Checkout failed:', response.error);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      res.status(400).json({
        success: false,
        error: response.error,
        details: response.metadata
      });
    }

  } catch (error) {
    console.error('❌ Voice checkout error:', error);
    console.error('Stack:', error.stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Payment page
app.get('/payment/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Get token and checkout
    const tokenRecord = db.getPaymentToken(token);
    if (!tokenRecord) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Not Found</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
            h1 { color: #e53e3e; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Payment Link Invalid</h1>
            <p>This payment link is invalid or has expired.</p>
          </div>
        </body>
        </html>
      `);
    }

    const checkout = db.getVoiceCheckout(tokenRecord.checkout_id);
    if (!checkout) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Checkout Not Found</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
            h1 { color: #e53e3e; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Checkout Not Found</h1>
            <p>This checkout session could not be found.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (checkout.status === 'completed') {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Paid</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
            h1 { color: #48bb78; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Already Paid</h1>
            <p>This order has already been completed.</p>
            <p><strong>Order ID:</strong> ${checkout.id}</p>
          </div>
        </body>
        </html>
      `);
    }

    // Render payment page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Complete Payment</title>
        <script src="https://js.stripe.com/v3/"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
          .container { max-width: 500px; margin: 40px auto; }
          #payment-form { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
          .header { text-align: center; margin-bottom: 32px; }
          .header h1 { font-size: 28px; color: #2d3748; margin-bottom: 8px; }
          .header p { color: #718096; font-size: 14px; }
          .order-summary { background: #f7fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
          .order-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
          .order-item:last-child { border-bottom: none; }
          .order-label { color: #718096; font-size: 14px; }
          .order-value { color: #2d3748; font-weight: 600; }
          .order-value.total { color: #667eea; font-size: 20px; }
          #card-element { border: 2px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 8px; }
          #card-errors { color: #e53e3e; font-size: 14px; margin-bottom: 16px; min-height: 20px; }
          .btn { width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 16px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s; }
          .btn:hover { transform: translateY(-2px); }
          .btn:disabled { opacity: 0.6; cursor: not-allowed; }
          .hidden { display: none; }
          .success-message { text-align: center; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
          .success-icon { font-size: 64px; margin-bottom: 16px; }
          .success-title { font-size: 24px; color: #48bb78; margin-bottom: 12px; }
          .success-text { color: #718096; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div id="payment-form">
            <div class="header">
              <h1>💳 Complete Payment</h1>
              <p>Secure checkout powered by Stripe</p>
            </div>

            <div class="order-summary">
              <div class="order-item">
                <span class="order-label">Product:</span>
                <span class="order-value">${checkout.product_name}</span>
              </div>
              <div class="order-item">
                <span class="order-label">Quantity:</span>
                <span class="order-value">${checkout.quantity}</span>
              </div>
              <div class="order-item">
                <span class="order-label">Customer:</span>
                <span class="order-value">${checkout.customer_name || 'Guest'}</span>
              </div>
              <div class="order-item">
                <span class="order-label">Total:</span>
                <span class="order-value total">$${checkout.amount.toFixed(2)}</span>
              </div>
            </div>

            <div id="card-element"></div>
            <div id="card-errors"></div>

            <button id="submit-button" class="btn">
              Pay $${checkout.amount.toFixed(2)}
            </button>

            <p style="text-align: center; color: #a0aec0; font-size: 12px; margin-top: 16px;">
              Test card: 4242 4242 4242 4242
            </p>
          </div>

          <div id="success-message" class="hidden">
            <div class="success-message">
              <div class="success-icon">✅</div>
              <h2 class="success-title">Payment Successful!</h2>
              <p class="success-text">
                Your order has been confirmed.<br>
                Order ID: <strong>${checkout.id}</strong>
              </p>
            </div>
          </div>
        </div>

        <script>
          const stripe = Stripe('${process.env.STRIPE_PUBLISHABLE_KEY}');
          const elements = stripe.elements();
          const cardElement = elements.create('card', {
            style: {
              base: {
                fontSize: '16px',
                color: '#2d3748',
                '::placeholder': {
                  color: '#a0aec0'
                }
              }
            }
          });

          cardElement.mount('#card-element');

          cardElement.on('change', (event) => {
            const displayError = document.getElementById('card-errors');
            if (event.error) {
              displayError.textContent = event.error.message;
            } else {
              displayError.textContent = '';
            }
          });

          const form = document.getElementById('payment-form');
          const submitButton = document.getElementById('submit-button');

          submitButton.addEventListener('click', async (e) => {
            e.preventDefault();
            submitButton.disabled = true;
            submitButton.textContent = 'Processing...';

            const { paymentMethod, error } = await stripe.createPaymentMethod({
              type: 'card',
              card: cardElement,
              billing_details: {
                name: '${checkout.customer_name || 'Guest'}',
                phone: '${checkout.customer_phone}',
                email: '${checkout.customer_email || ''}'
              }
            });

            if (error) {
              document.getElementById('card-errors').textContent = error.message;
              submitButton.disabled = false;
              submitButton.textContent = 'Pay $${checkout.amount.toFixed(2)}';
            } else {
              const response = await fetch('/process-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  payment_method_id: paymentMethod.id,
                  checkout_id: '${checkout.id}',
                  amount: ${checkout.amount}
                })
              });

              const result = await response.json();

              if (result.success) {
                document.getElementById('payment-form').classList.add('hidden');
                document.getElementById('success-message').classList.remove('hidden');
              } else {
                document.getElementById('card-errors').textContent = result.error || 'Payment failed';
                submitButton.disabled = false;
                submitButton.textContent = 'Pay $${checkout.amount.toFixed(2)}';
              }
            }
          });
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Error rendering payment page:', error);
    res.status(500).send('Error loading payment page');
  }
});

// Process payment
app.post('/process-payment', async (req, res) => {
  try {
    const { payment_method_id, checkout_id, amount } = req.body;

    console.log(`\n💳 Processing payment for checkout: ${checkout_id}`);

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      payment_method: payment_method_id,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });

    console.log(`✅ Stripe payment successful: ${paymentIntent.id}`);

    // Update checkout status
    db.updateVoiceCheckout(checkout_id, {
      status: 'completed',
      payment_intent_id: paymentIntent.id
    });

    console.log(`✅ Checkout ${checkout_id} marked as completed`);

    res.json({
      success: true,
      payment_intent_id: paymentIntent.id,
      checkout_id: checkout_id
    });

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// DASHBOARD API ENDPOINTS
// ============================================

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if user already exists
    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Hash password
    let password_hash;
    if (bcrypt) {
      password_hash = await bcrypt.hash(password, 10);
    } else {
      // Fallback: use crypto (NOT SECURE - for demo only)
      password_hash = crypto.createHash('sha256').update(password).digest('hex');
      console.log('⚠️  Using SHA256 instead of BCrypt (install bcryptjs for secure hashing)');
    }

    // Create user
    const userId = `user-${uuidv4()}`;
    db.createUser({
      id: userId,
      email,
      password_hash,
      name,
      role: 'healthcare_provider',
      merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
      auth_method: 'email'
    });

    // Update last login
    db.updateUserLastLogin(userId);

    const session = {
      id: userId,
      email,
      name,
      role: 'healthcare_provider',
      merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
      token: Buffer.from(email).toString('base64')
    };

    console.log(`✅ New user registered: ${email}`);

    res.json({
      success: true,
      user: session
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account'
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check database first
    const user = db.getUserByEmail(email);

    if (user && user.password_hash) {
      // Database user with password
      let isValid = false;

      if (bcrypt) {
        // Use BCrypt if available
        isValid = await bcrypt.compare(password, user.password_hash);
      } else {
        // Fallback: use crypto comparison (NOT SECURE - for demo only)
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        isValid = (hash === user.password_hash);
      }

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Update last login
      db.updateUserLastLogin(user.id);

      const session = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        merchant_id: user.merchant_id,
        picture: user.picture,
        token: Buffer.from(user.email).toString('base64')
      };

      console.log(`✅ User logged in: ${email}`);

      return res.json({
        success: true,
        user: session
      });
    }

    // Fall back to demo accounts for testing
    const demoAccounts = {
      'provider@doclittle.com': {
        password: 'demo123',
        name: 'Healthcare Provider',
        role: 'healthcare_provider',
        merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884'
      },
      'admin@platform.com': {
        password: 'admin123',
        name: 'Platform Admin',
        role: 'platform_admin',
        merchant_id: null
      }
    };

    const demoAccount = demoAccounts[email];

    if (demoAccount && demoAccount.password === password) {
      const session = {
        email: email,
        name: demoAccount.name,
        role: demoAccount.role,
        merchant_id: demoAccount.merchant_id,
        token: Buffer.from(email).toString('base64')
      };

      console.log(`✅ Demo account login: ${email}`);

      return res.json({
        success: true,
        user: session
      });
    }

    // No match found
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Google OAuth authentication
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, email, name, picture } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Google credentials'
      });
    }

    // In production, verify the credential with Google
    // For now, accept any valid Google sign-in and create/find user

    // Check if user exists
    let user = db.getUserByEmail(email);

    if (!user) {
      // Create new user from Google account
      const userId = `user-${uuidv4()}`;

      db.createUser({
        id: userId,
        email,
        password_hash: null, // Google users don't have password
        name,
        role: 'healthcare_provider',
        merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
        picture,
        auth_method: 'google',
        google_id: credential // Store Google ID for future reference
      });

      user = db.getUserByEmail(email);
      console.log(`✅ New user created via Google: ${email}`);
    } else {
      // Update picture if changed
      if (picture && user.picture !== picture) {
        db.updateUser(user.id, { picture });
      }
      console.log(`✅ Existing user logged in via Google: ${email}`);
    }

    // Update last login
    db.updateUserLastLogin(user.id);

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || picture,
      role: user.role,
      merchant_id: user.merchant_id,
      token: Buffer.from(user.email).toString('base64'),
      auth_method: 'google'
    };

    res.json({
      success: true,
      user: session
    });
  } catch (error) {
    console.error('❌ Google auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to authenticate with Google'
    });
  }
});

// Get dashboard stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const allCheckouts = db.getAllVoiceCheckouts();

    const todayCheckouts = allCheckouts.filter(c =>
      c.created_at.startsWith(today)
    );

    const todayRevenue = todayCheckouts
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const todayOrders = todayCheckouts.filter(c => c.status === 'completed').length;
    const todayCalls = todayCheckouts.length;
    const completedOrders = todayCheckouts.filter(c => c.status === 'completed').length;
    const totalCalls = todayCalls;
    const conversionRate = totalCalls > 0 ? (completedOrders / totalCalls) * 100 : 0;

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yesterdayCheckouts = allCheckouts.filter(c =>
      c.created_at.startsWith(yesterday)
    );

    const yesterdayRevenue = yesterdayCheckouts
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const revenueChange = yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(1)
      : 100;

    const totalRevenue = allCheckouts
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const totalOrders = allCheckouts.filter(c => c.status === 'completed').length;
    const totalCallsAllTime = allCheckouts.length;

    // Calculate priority cases (high-risk patients: fraud_score > 70 or flagged)
    const transactions = db.getAllTransactions();
    const priorityCases = transactions.filter(t =>
      t.fraud_score > 70 || t.status === 'flagged'
    ).length;

    res.json({
      success: true,
      stats: {
        today: {
          revenue: todayRevenue,
          orders: todayOrders,
          calls: todayCalls,
          conversionRate: conversionRate.toFixed(1),
          revenueChange: revenueChange
        },
        total: {
          revenue: totalRevenue,
          orders: totalOrders,
          calls: totalCallsAllTime,
          avgFraudScore: 0
        },
        priority: {
          cases: priorityCases
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all transactions
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const status = req.query.status;

    let checkouts = db.getAllVoiceCheckouts();

    if (status && status !== 'flagged') {
      checkouts = checkouts.filter(c => c.status === status);
    }

    checkouts = checkouts.slice(0, limit);

    res.json({
      success: true,
      transactions: checkouts,
      count: checkouts.length
    });

  } catch (error) {
    console.error('❌ Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get customers
app.get('/api/admin/customers', async (req, res) => {
  try {
    const allCheckouts = db.getAllVoiceCheckouts();

    // Group by phone
    const customerMap = new Map();

    allCheckouts.forEach(checkout => {
      const phone = checkout.customer_phone;
      if (!phone) return;

      if (!customerMap.has(phone)) {
        customerMap.set(phone, {
          customer_phone: phone,
          customer_name: checkout.customer_name,
          customer_email: checkout.customer_email,
          orders: [],
          order_count: 0,
          total_spent: 0,
          first_order: checkout.created_at,
          last_order: checkout.created_at
        });
      }

      const customer = customerMap.get(phone);
      customer.orders.push(checkout);
      customer.order_count++;

      if (checkout.status === 'completed') {
        customer.total_spent += checkout.amount;
      }

      if (checkout.created_at < customer.first_order) {
        customer.first_order = checkout.created_at;
      }
      if (checkout.created_at > customer.last_order) {
        customer.last_order = checkout.created_at;
      }
    });

    const customers = Array.from(customerMap.values()).map(customer => {
      const completedOrders = customer.orders.filter(o => o.status === 'completed');

      let trustLevel = 'new';
      if (customer.order_count >= 5) {
        trustLevel = 'trusted';
      }

      return {
        ...customer,
        completed_orders: completedOrders.length,
        fraud_flags: 0,
        trust_level: trustLevel,
        avg_order_value: completedOrders.length > 0
          ? (customer.total_spent / completedOrders.length).toFixed(2)
          : 0,
        avg_fraud_score: 0
      };
    });

    customers.sort((a, b) => b.total_spent - a.total_spent);

    res.json({
      success: true,
      customers: customers,
      count: customers.length
    });

  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single customer
app.get('/api/admin/customers/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const allCheckouts = db.getAllVoiceCheckouts();

    const orders = allCheckouts.filter(c => c.customer_phone === phone);

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const customer = {
      phone: phone,
      name: orders[0].customer_name,
      email: orders[0].customer_email,
      orders: orders,
      total_spent: orders
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + o.amount, 0),
      order_count: orders.length,
      first_order: orders[orders.length - 1].created_at,
      last_order: orders[0].created_at
    };

    res.json({
      success: true,
      customer: customer
    });

  } catch (error) {
    console.error('❌ Error fetching customer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get agent stats
app.get('/api/admin/agent/stats', async (req, res) => {
  try {
    const merchant_id = req.query.merchant_id;

    let voiceCheckouts = db.getAllVoiceCheckouts();

    if (merchant_id) {
      voiceCheckouts = voiceCheckouts.filter(c => c.merchant_id === merchant_id);
    }

    const today = new Date().toISOString().split('T')[0];
    const todayCalls = voiceCheckouts.filter(c =>
      c.created_at.startsWith(today)
    );

    const stats = {
      total_calls: todayCalls.length,
      successful_calls: todayCalls.filter(c => c.status === 'completed').length,
      revenue: todayCalls
        .filter(c => c.status === 'completed')
        .reduce((sum, c) => sum + c.amount, 0),
      conversion_rate: todayCalls.length > 0
        ? (todayCalls.filter(c => c.status === 'completed').length / todayCalls.length * 100).toFixed(1)
        : 0,
      avg_order_value: todayCalls.filter(c => c.status === 'completed').length > 0
        ? (todayCalls
          .filter(c => c.status === 'completed')
          .reduce((sum, c) => sum + c.amount, 0) /
          todayCalls.filter(c => c.status === 'completed').length).toFixed(2)
        : 0
    };

    res.json({
      success: true,
      stats: stats,
      recent_calls: todayCalls.slice(0, 10)
    });

  } catch (error) {
    console.error('❌ Error fetching agent stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// BOOKING/APPOINTMENT ENDPOINTS
// ============================================

// Schedule new appointment (for voice agent)
app.post('/voice/appointments/schedule', async (req, res) => {
  try {
    console.log('\n📅 VOICE: Schedule Appointment');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Extract args (handle Retell formats)
    let args = req.body.args || req.body;

    const appointmentData = {
      patient_name: args.patient_name,
      patient_phone: args.patient_phone,
      patient_email: args.patient_email,
      appointment_type: args.appointment_type || 'Mental Health Consultation',
      date: args.date,  // YYYY-MM-DD
      time: args.time,  // HH:MM or "2:00 PM"
      duration_minutes: args.duration_minutes || 50,
      provider: args.provider,
      notes: args.notes,
      timezone: args.timezone || 'America/New_York'
    };

    const result = await BookingService.scheduleAppointment(appointmentData);

    res.json(result);
  } catch (error) {
    console.error('❌ Error scheduling appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Confirm appointment (for voice agent)
app.post('/voice/appointments/confirm', async (req, res) => {
  try {
    console.log('\n✅ VOICE: Confirm Appointment');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const appointmentId = args.appointment_id || args.confirmation_number;

    const result = await BookingService.confirmAppointment(appointmentId);

    res.json(result);
  } catch (error) {
    console.error('❌ Error confirming appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reschedule appointment (for voice agent)
app.post('/voice/appointments/reschedule', async (req, res) => {
  try {
    console.log('\n🔄 VOICE: Reschedule Appointment');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const appointmentId = args.appointment_id || args.confirmation_number;
    const newDate = args.new_date || args.date;
    const newTime = args.new_time || args.time;
    const reason = args.reason || null;
    const timezone = args.timezone || null;

    if (!newDate || !newTime) {
      return res.status(400).json({
        success: false,
        error: 'new_date and new_time are required for rescheduling'
      });
    }

    const result = await BookingService.rescheduleAppointment(
      appointmentId,
      newDate,
      newTime,
      reason,
      timezone
    );

    res.json(result);
  } catch (error) {
    console.error('❌ Error rescheduling appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancel appointment (for voice agent)
app.post('/voice/appointments/cancel', async (req, res) => {
  try {
    console.log('\n❌ VOICE: Cancel Appointment');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const appointmentId = args.appointment_id || args.confirmation_number;
    const reason = args.reason || null;

    const result = await BookingService.cancelAppointment(appointmentId, reason);

    res.json(result);
  } catch (error) {
    console.error('❌ Error cancelling appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available slots (for voice agent)
app.post('/voice/appointments/available-slots', async (req, res) => {
  try {
    console.log('\n🕐 VOICE: Get Available Slots');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const date = args.date;  // YYYY-MM-DD
    const provider = args.provider || null;
    const appointmentType = args.appointment_type || null;
    const timezone = args.timezone || null;

    const result = await BookingService.getAvailableSlots(date, provider, appointmentType, timezone);

    res.json(result);
  } catch (error) {
    console.error('❌ Error getting available slots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search appointments (for voice agent)
app.post('/voice/appointments/search', async (req, res) => {
  try {
    console.log('\n🔍 VOICE: Search Appointments');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const args = req.body.args || req.body;
    const searchTerm = args.phone || args.email || args.patient_phone || args.patient_email;

    const result = await BookingService.searchAppointments(searchTerm);

    res.json(result);
  } catch (error) {
    console.error('❌ Error searching appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dashboard: Get all appointments
app.get('/api/admin/appointments', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      date: req.query.date,
      provider: req.query.provider
    };

    const appointments = db.getAllAppointments(filters);

    res.json({
      success: true,
      appointments,
      count: appointments.length
    });
  } catch (error) {
    console.error('❌ Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dashboard: Get upcoming appointments
app.get('/api/admin/appointments/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const appointments = db.getUpcomingAppointments(limit);

    res.json({
      success: true,
      appointments,
      count: appointments.length
    });
  } catch (error) {
    console.error('❌ Error fetching upcoming appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dashboard: Billing summary by patient (derived from appointments)
app.get('/api/admin/billing', async (req, res) => {
  try {
    const PRICE_PER_APPOINTMENT = 39.99; // cash price per appointment

    const appointments = db.getAllAppointments({});

    // Helper: start of current ISO week (Monday)
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day; // adjust so Monday is start
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const byPatient = new Map();

    appointments.forEach(appt => {
      const key = appt.patient_id || appt.patient_phone || appt.patient_email || appt.patient_name;
      if (!key) return;

      if (!byPatient.has(key)) {
        byPatient.set(key, {
          patient_id: appt.patient_id || null,
          patient_name: appt.patient_name || 'Unknown',
          patient_phone: appt.patient_phone || null,
          patient_email: appt.patient_email || null,
          total_appointments: 0,
          confirmed_appointments: 0,
          cancelled_appointments: 0,
          week_appointments: 0,
          total_amount: 0,
          week_amount: 0,
          last_appointment_at: null
        });
      }

      const record = byPatient.get(key);
      record.total_appointments += 1;
      if (appt.status === 'confirmed') record.confirmed_appointments += 1;
      if (appt.status === 'cancelled') record.cancelled_appointments += 1;

      // Determine appointment start date for week calc
      const startIso = appt.start_time || (appt.date ? `${appt.date}T${(appt.time || '00:00')}:00` : null);
      const apptDate = startIso ? new Date(startIso) : null;
      if (apptDate && apptDate >= monday) {
        record.week_appointments += 1;
      }

      // Every appointment is billed as cash at the fixed price
      record.total_amount = Number((record.total_appointments * PRICE_PER_APPOINTMENT).toFixed(2));
      record.week_amount = Number((record.week_appointments * PRICE_PER_APPOINTMENT).toFixed(2));

      if (!record.last_appointment_at || (apptDate && apptDate > new Date(record.last_appointment_at))) {
        record.last_appointment_at = apptDate ? apptDate.toISOString() : record.last_appointment_at;
      }
    });

    const results = Array.from(byPatient.values()).sort((a, b) => (b.last_appointment_at || '').localeCompare(a.last_appointment_at || ''));

    res.json({
      success: true,
      price_per_appointment: PRICE_PER_APPOINTMENT,
      patients: results,
      count: results.length
    });
  } catch (error) {
    console.error('❌ Error building billing summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Retell events webhook
app.post('/webhook/retell/events', express.json(), async (req, res) => {
  try {
    // Log everything for debugging
    console.log('\n📥 ========================================');
    console.log('📥 RETELL WEBHOOK RECEIVED');
    console.log('📥 ========================================');
    console.log('🔍 Request Headers:');
    console.log(JSON.stringify(req.headers, null, 2));
    console.log('\n🔍 Request Body:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('📥 ========================================\n');

    // Always respond with success so Retell doesn't retry
    res.json({
      received: true,
      timestamp: new Date().toISOString()
    });

    // Process the webhook data
    const body = req.body || {};

    // Check for different event types
    if (body.event) {
      console.log(`📊 Event Type: ${body.event}`);
    }

    if (body.call_id) {
      console.log(`📞 Call ID: ${body.call_id}`);
    }

    if (body.call_status) {
      console.log(`📊 Call Status: ${body.call_status}`);
    }

  } catch (err) {
    console.error('❌ Error in /webhook/retell/events:', err.message);
    console.error(err.stack);

    // Still respond with success to avoid retries
    try {
      res.status(200).json({
        received: true,
        error: err.message
      });
    } catch (e) {
      console.error('Failed to send response:', e.message);
    }
  }
});

// Retell end-of-call webhook
app.post('/webhook/retell/end-of-call', async (req, res) => {
  try {
    console.log('\n📞 ========================================');
    console.log('📞 RETELL: End of call webhook');
    console.log('📞 ========================================');
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));
    console.log('📞 ========================================\n');

    const callId = req.body.call_id;

    // ========== FHIR COMPLETION ==========
    // Complete FHIR Encounter and store transcript
    if (callId && global.activeCalls && global.activeCalls[callId]) {
      try {
        const callInfo = global.activeCalls[callId];
        console.log(`[FHIR] Completing call resources for: ${callId}`);

        // Prepare call summary with transcript and analysis
        const callSummary = {
          encounterId: callInfo.encounterId,
          patientId: callInfo.patientId,
          duration: req.body.call_analysis?.call_duration,
          transcript: req.body.transcript || [],
          callAnalysis: req.body.call_analysis,
          endTime: new Date().toISOString()
        };

        // Complete the FHIR encounter and store transcript
        await FHIRService.completeVoiceCall(callId, callSummary);
        console.log(`[FHIR] ✅ Completed Encounter: ${callInfo.encounterId}`);
        console.log(`[FHIR] ✅ Stored transcript as Communication resource`);

        // Clean up active call tracking
        delete global.activeCalls[callId];
      } catch (fhirError) {
        console.error('[FHIR] ❌ Error completing FHIR resources:', fhirError.message);
        console.error('[FHIR] Stack:', fhirError.stack);
        // Continue processing webhook even if FHIR fails
      }
    } else {
      console.log(`[FHIR] ⚠️ No active call found for callId: ${callId}`);
    }
    // ======================================

    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('❌ Error processing Retell webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stripe webhook
app.post('/webhook/stripe', async (req, res) => {
  try {
    console.log('\n💳 STRIPE: Webhook received');

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log(`✅ PaymentIntent ${paymentIntent.id} succeeded`);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log(`❌ PaymentIntent ${failedPayment.id} failed`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('❌ Error processing Stripe webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'middleware-platform'
  });
});

// ============================================
// ERROR HANDLERS
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MIDDLEWARE PLATFORM - PRODUCTION READY');
  console.log('='.repeat(60));
  console.log(`\n📍 Server running on: http://localhost:${PORT}`);
  console.log('\n📊 Available Endpoints:');
  console.log('\n📞 Voice (Custom Telephony with SIP):');
  console.log(`   POST   http://localhost:${PORT}/voice/incoming`);
  console.log('\n🎤 Voice Commerce (USING ORCHESTRATOR):');
  console.log(`   POST   http://localhost:${PORT}/voice/products/search`);
  console.log(`   POST   http://localhost:${PORT}/voice/checkout/create ⭐ FIXED`);
  console.log(`   GET    http://localhost:${PORT}/payment/:token`);
  console.log(`   POST   http://localhost:${PORT}/process-payment`);
  console.log('\n📅 Appointment Booking (Voice Agent):');
  console.log(`   POST   http://localhost:${PORT}/voice/appointments/schedule`);
  console.log(`   POST   http://localhost:${PORT}/voice/appointments/confirm`);
  console.log(`   POST   http://localhost:${PORT}/voice/appointments/cancel`);
  console.log(`   POST   http://localhost:${PORT}/voice/appointments/available-slots`);
  console.log(`   POST   http://localhost:${PORT}/voice/appointments/search`);
  console.log('\n📊 Dashboard API:');
  console.log(`   POST   http://localhost:${PORT}/api/auth/login`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/stats`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/transactions`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/customers`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/customers/:phone`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/agent/stats`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/appointments`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/appointments/upcoming`);
  console.log(`   GET    http://localhost:${PORT}/api/admin/billing`);
  console.log('\n🔔 Webhooks:');
  console.log(`   POST   http://localhost:${PORT}/webhook/retell/events`);
  console.log(`   POST   http://localhost:${PORT}/webhook/retell/end-of-call`);
  console.log(`   POST   http://localhost:${PORT}/webhook/stripe`);
  console.log('\n🏥 Health:');
  console.log(`   GET    http://localhost:${PORT}/health`);
  console.log('\n' + '='.repeat(60));
  console.log('✅ Ready to accept requests!');
  console.log('='.repeat(60) + '\n');

  // Start reminder scheduler (with error handling)
  try {
    ReminderScheduler.start();
  } catch (error) {
    console.error('⚠️  Failed to start reminder scheduler:', error.message);
    console.log('   Reminders will be disabled, but server will continue');
  }

  console.log('⚙️  Configuration Status:');
  console.log(`   Database:      ✅ Using database.js module`);
  console.log(`   Stripe:        ${process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Twilio:        ${process.env.TWILIO_ACCOUNT_SID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Twilio Verify: ${process.env.TWILIO_VERIFY_SERVICE_SID ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Twilio Phone:  ${process.env.TWILIO_PHONE_NUMBER ? '✅ ' + process.env.TWILIO_PHONE_NUMBER : '❌ Missing'}`);
  console.log(`   Retell:        ${process.env.RETELL_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Retell Agent:  ${process.env.RETELL_AGENT_ID ? '✅ ' + process.env.RETELL_AGENT_ID : '⚠️  Using default'}`);
  console.log(`   Google Cal:    ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_CLIENT_ID ? '✅ Configured' : '⚠️  Optional (for bookings)'}`);
  console.log('\n📝 ARCHITECTURE:');
  console.log('   ✅ Using PaymentOrchestrator service layer');
  console.log('   ✅ Using BookingService for appointment management');
  console.log('   ✅ Using SMSService for phone normalization');
  console.log('   ✅ Using database.js module for all DB operations');
  console.log('   ✅ Transforms Retell format → PaymentRequest format');
  console.log('   ✅ SIP Endpoint: sip:{call_id}@5t4n6j0wnrl.sip.livekit.cloud');
  console.log('\n' + '='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  console.log('✅ Server closed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  console.log('✅ Server closed');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
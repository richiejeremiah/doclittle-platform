# Payment Architecture Overview

## Two Separate Payment Systems

### 1. **Circle API Wallets** (Already Implemented ✅)
**Purpose**: USDC cryptocurrency payments for **insurance claims**

**Flow**:
- Insurance claim gets approved
- Insurer pays provider via Circle (USDC transfer)
- Provider receives USDC in their Circle wallet
- Used for healthcare billing/insurance reimbursements

**Status**: ✅ **FULLY IMPLEMENTED**
- Wallet creation
- Balance checking
- USDC transfers
- Webhook verification

---

### 2. **Payment Methods** (TODOs - Different System)
**Purpose**: Traditional card payments for **appointments/products**

**Current Status**:
- ✅ **Link-based payment** (working) - Email verification → Payment page
- ❌ **Direct Stripe** (TODO) - Direct payment intent
- ❌ **Mastercard Agent Pay** (TODO) - Voice commerce integration
- ❌ **Visa Agent Toolkit** (TODO) - Voice commerce integration

**These are for**:
- Patient pays for appointments ($39.99)
- Patient pays for products/services
- Voice agent purchases
- AI commerce transactions

---

## Payment Method Implementation Details

### Current: Link-Based Payment (Working ✅)

**Flow**:
1. Create checkout → Generate verification code
2. Email code to patient
3. Patient verifies code → Get payment link
4. Patient clicks link → Stripe payment page
5. Patient enters card → Payment processed

**Code**: `_handleLinkPayment()` in `payment-orchestrator.js`

---

### TODO 1: Direct Stripe Payment Intent

**What it does**: Process payment immediately without email verification step

**Implementation**:
```javascript
static async _handleStripePayment(checkout, merchant, paymentRequest) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
        amount: checkout.amount * 100, // Convert to cents
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
            checkout_id: checkout.id,
            merchant_id: merchant.id
        }
    });
    
    return {
        success: true,
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        requires_action: paymentIntent.status === 'requires_action'
    };
}
```

**When to use**: When you have card details already (e.g., saved cards, direct API calls)

---

### TODO 2: Mastercard Agent Pay

**What it does**: Voice commerce payment protocol from Mastercard

**Requirements**:
- Mastercard Agent Pay API credentials
- Integration with Mastercard's voice commerce SDK
- Mandate verification

**Implementation**:
```javascript
static async _handleMastercardPayment(checkout, merchant, paymentRequest) {
    // 1. Verify Mastercard mandate
    // 2. Create payment authorization
    // 3. Process payment via Mastercard API
    // 4. Return payment result
}
```

**When to use**: Voice agent purchases via Mastercard

---

### TODO 3: Visa Agent Toolkit

**What it does**: Voice commerce payment protocol from Visa

**Requirements**:
- Visa Agent Toolkit API credentials
- Integration with Visa's voice commerce SDK
- Mandate verification

**Implementation**:
```javascript
static async _handleVisaPayment(checkout, merchant, paymentRequest) {
    // 1. Verify Visa mandate
    // 2. Create payment authorization
    // 3. Process payment via Visa API
    // 4. Return payment result
}
```

**When to use**: Voice agent purchases via Visa

---

## Summary

**Circle API Wallets** = ✅ Done (for insurance claims)
**Payment Methods** = Partially done (link-based works, others are TODOs)

The TODOs are for **enhancing** the appointment/product payment flow, not replacing Circle.


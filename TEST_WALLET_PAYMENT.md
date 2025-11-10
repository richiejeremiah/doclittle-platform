# Wallet Payment Integration Test Guide

## Overview

This guide explains how to test the wallet payment integration that has been implemented.

## What Was Implemented

1. **Stripe Funding for Patient Wallet** (`/api/patient/wallet/deposit`)
   - Patients can fund their wallets using Stripe (credit/debit card)
   - Supports Payment Intent creation and confirmation
   - Integrates with Circle API to deposit USDC to patient wallet

2. **Wallet Payment for Appointments** (`/process-payment`)
   - Patients can pay for appointments from their wallet
   - Checks wallet balance before processing payment
   - Creates Circle transfer from patient to provider wallet
   - Auto-confirms appointments after payment

3. **Wallet Balance Checking** (`/voice/checkout/verify`)
   - Checks if patient has wallet with sufficient balance
   - Returns wallet info in checkout verification response
   - Enables frontend to offer wallet payment option

## Prerequisites

### Required Environment Variables

```bash
# Circle API (for wallet operations)
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
CIRCLE_PROVIDER_WALLET_ID=your_provider_wallet_id  # Optional: for wallet payments

# Stripe (for funding wallets)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret  # Optional: for webhook handling
```

### Database Migration

Run the migration script to add the `payment_method` column:

```bash
cd middleware-platform
node scripts/migrate-add-payment-method.js
```

## Testing Steps

### Step 1: Start the Server

```bash
cd middleware-platform
npm start
# or
node server.js
```

### Step 2: Create a Test Patient

```bash
curl -X POST http://localhost:4000/fhir/Patient \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Patient",
    "name": [{"given": ["Test"], "family": "Patient"}],
    "telecom": [
      {"system": "phone", "value": "+15551234567"},
      {"system": "email", "value": "test.patient@example.com"}
    ]
  }'
```

### Step 3: Create Patient Wallet

```bash
curl -X POST http://localhost:4000/api/circle/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "entityType": "patient",
    "entityId": "patient-resource-id",
    "description": "Test patient wallet"
  }'
```

### Step 4: Fund Patient Wallet (Stripe)

```bash
curl -X POST http://localhost:4000/api/patient/wallet/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-resource-id",
    "amount": 100.00,
    "method": "stripe",
    "payment_method_id": "pm_test_...",  # From Stripe Payment Intent
    "customer_email": "test.patient@example.com"
  }'
```

**Note:** In a real scenario, you would:
1. Create a Payment Intent (returns `client_secret`)
2. Use Stripe.js on frontend to collect payment method
3. Confirm the Payment Intent
4. Wallet will be funded via webhook or immediately

### Step 5: Create Appointment Checkout

```bash
curl -X POST http://localhost:4000/voice/appointments/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test Patient",
    "customer_phone": "+15551234567",
    "customer_email": "test.patient@example.com",
    "amount": 50.00,
    "appointment_type": "Test Appointment"
  }'
```

Response will include:
- `checkout_id`
- `payment_token`
- `verification_code` (sent to email)

### Step 6: Verify Checkout Code

```bash
curl -X POST http://localhost:4000/voice/checkout/verify \
  -H "Content-Type: application/json" \
  -d '{
    "payment_token": "token-from-step-5",
    "verification_code": "123456"
  }'
```

Response will include:
- `wallet` object with:
  - `has_wallet`: true/false
  - `balance`: wallet balance in USDC
  - `sufficient_balance`: true/false
  - `wallet_id`: Circle wallet ID

### Step 7: Process Payment (Wallet)

```bash
curl -X POST http://localhost:4000/process-payment \
  -H "Content-Type: application/json" \
  -d '{
    "checkout_id": "checkout-id-from-step-5",
    "amount": 50.00,
    "payment_method": "wallet"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "payment_method": "wallet",
  "transfer_id": "circle-transfer-id",
  "checkout_id": "checkout-id",
  "wallet_balance_after": 50.00,
  "appointment_confirmed": true
}
```

### Step 8: Process Payment (Stripe - Alternative)

```bash
curl -X POST http://localhost:4000/process-payment \
  -H "Content-Type: application/json" \
  -d '{
    "checkout_id": "checkout-id-from-step-5",
    "amount": 50.00,
    "payment_method": "stripe",
    "payment_method_id": "pm_test_..."
  }'
```

## Automated Testing

Run the automated test suite:

```bash
cd middleware-platform
node tests/test-wallet-payment.js
```

The test suite will:
1. Create a FHIR patient
2. Create a patient wallet
3. Check wallet balance
4. Create an appointment checkout
5. Verify checkout code (with wallet check)
6. Test wallet payment (if balance is sufficient)
7. Test Stripe wallet deposit (configuration check)

## Test Scenarios

### Scenario 1: Wallet Payment with Sufficient Balance

1. Fund wallet with $100
2. Create checkout for $50
3. Verify checkout code (should show wallet balance)
4. Process payment with `payment_method: "wallet"`
5. Verify payment succeeds and balance decreases to $50

### Scenario 2: Wallet Payment with Insufficient Balance

1. Fund wallet with $30
2. Create checkout for $50
3. Verify checkout code (should show insufficient balance)
4. Process payment with `payment_method: "wallet"`
5. Verify payment fails with "Insufficient wallet balance" error

### Scenario 3: Wallet Payment for Patient Without Wallet

1. Create patient without wallet
2. Create checkout
3. Verify checkout code (should not show wallet info)
4. Process payment with `payment_method: "wallet"`
5. Verify payment fails with "Patient wallet not found" error

### Scenario 4: Stripe Wallet Funding

1. Create Payment Intent for $100
2. Confirm payment with Stripe
3. Verify wallet is funded via webhook or immediately
4. Check wallet balance (should show $100)

## Troubleshooting

### Error: "Patient wallet not found"

- Ensure patient has a wallet created via `/api/circle/wallets`
- Check that `entityType` is "patient" and `entityId` matches FHIR patient `resource_id`

### Error: "Provider wallet not configured"

- Set `CIRCLE_PROVIDER_WALLET_ID` or `CIRCLE_SYSTEM_WALLET_ID` in environment variables
- This wallet receives payments from patients

### Error: "Insufficient wallet balance"

- Fund the wallet using `/api/patient/wallet/deposit` with `method: "stripe"` or `method: "test"`
- Check wallet balance using Circle API or `/api/circle/accounts/patient/{resource_id}`

### Error: "Could not retrieve wallet balance"

- Check Circle API configuration (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`)
- Verify wallet exists in Circle
- Check Circle API logs for errors

### Error: "Stripe payment failed"

- Verify Stripe keys are configured (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`)
- Check Stripe dashboard for payment errors
- Ensure Payment Intent is created correctly

## Database Schema

The `voice_checkouts` table now includes:
- `payment_method`: TEXT (values: 'stripe', 'wallet', 'ach', 'wire', etc.)
- `appointment_id`: TEXT (links to appointment)

Run migration script to add these columns to existing databases.

## API Endpoints

### Wallet Operations

- `POST /api/patient/wallet/deposit` - Fund patient wallet
- `GET /api/patient/wallet/transactions` - Get transaction history
- `POST /api/circle/wallets` - Create wallet
- `GET /api/circle/accounts/{entityType}/{entityId}` - Get wallet balance

### Payment Operations

- `POST /voice/appointments/checkout` - Create appointment checkout
- `POST /voice/checkout/verify` - Verify checkout code (includes wallet check)
- `POST /process-payment` - Process payment (supports wallet and Stripe)

### Webhooks

- `POST /webhook/stripe` - Stripe webhook (handles wallet deposits)

## Next Steps

1. Test with real Circle API credentials (sandbox)
2. Test with real Stripe credentials (test mode)
3. Integrate frontend to show wallet balance and payment options
4. Add wallet payment option to payment page UI
5. Test end-to-end flow with voice agent

## Notes

- Wallet payments require Circle API configuration
- Stripe funding requires Stripe API configuration
- Provider wallet must be configured for wallet payments to work
- All wallet amounts are in USDC (USD Coin)
- Balance checking happens in real-time during checkout verification


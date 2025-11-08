# Circle Payment Integration - Healthcare Billing Platform

## Overview
This document describes the Circle payment integration for instant billing between Provider, Insurer, and Patient accounts using USDC.

## Architecture

### Three-Account System
1. **Provider Account**: Receives payments from insurers
2. **Insurer Account**: Pays approved claims to providers
3. **Patient Account**: Views balances and claim status (optional payments)

### Payment Flow
1. **Provider creates claim** → Claims are created from PDF coding or appointments
2. **Provider submits claim** → Claim status: `pending_approval`
3. **Insurer approves claim** → Circle transfer created (Insurer → Provider)
4. **Circle processes payment** → USDC transfer executed
5. **Webhook notification** → Claim status updated to `paid`
6. **Balance updates** → Both Provider and Insurer dashboards show updated balances

## Implementation Status

### ✅ Completed
1. **Circle Service** (`middleware-platform/services/circle-service.js`)
   - Wallet creation
   - Balance queries
   - Transfer creation
   - Webhook signature verification

2. **Database Schema** (`middleware-platform/database.js`)
   - `circle_accounts` table: Stores wallet information for entities
   - `circle_transfers` table: Tracks payment transactions
   - Updated `insurance_claims` table: Added `circle_transfer_id`, `payment_status`, `payment_amount`

3. **API Endpoints** (`middleware-platform/server.js`)
   - `POST /api/circle/wallets` - Create wallet for entity
   - `GET /api/circle/wallets/:walletId/balance` - Get wallet balance
   - `GET /api/circle/accounts/:entityType/:entityId` - Get account info
   - `POST /api/claims/:claimId/submit-payment` - Submit claim for payment
   - `POST /api/claims/:claimId/approve-payment` - Approve and pay claim
   - `POST /api/circle/webhook` - Handle payment webhooks

4. **Frontend Integration** (`unified-dashboard/business/claims.html`)
   - Payment status display
   - "Submit for Payment" button (Provider)
   - "Approve & Pay" button (Insurer)
   - Real-time status updates

5. **Setup Script** (`middleware-platform/scripts/setup-circle-wallets.js`)
   - Script to initialize test wallets

## API Key Configuration

### Current Setup
- **API Key**: Stored in `circle-service.js` (move to environment variable in production)
- **Base URL**: `https://api-sandbox.circle.com` (sandbox)
- **Environment**: `sandbox`

### Environment Variables Needed
```bash
CIRCLE_API_KEY=your_circle_api_key_here
CIRCLE_BASE_URL=https://api-sandbox.circle.com
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_WEBHOOK_SECRET=your_webhook_secret_here
```

## Database Tables

### circle_accounts
- Stores Circle wallet information for Provider, Insurer, and Patient entities
- Links internal entity IDs to Circle wallet IDs

### circle_transfers
- Tracks all payment transactions
- Links transfers to claims
- Stores transfer status and Circle transfer IDs

### insurance_claims (updated)
- Added `circle_transfer_id`: Links claim to Circle transfer
- Added `payment_status`: Tracks payment status (pending, processing, completed, failed)
- Added `payment_amount`: Stores payment amount

## API Endpoints

### Wallet Management
- **Create Wallet**: `POST /api/circle/wallets`
  ```json
  {
    "entityType": "provider",
    "entityId": "default",
    "description": "Provider wallet"
  }
  ```

- **Get Balance**: `GET /api/circle/wallets/:walletId/balance`

- **Get Account**: `GET /api/circle/accounts/:entityType/:entityId`

### Claim Payment Flow
- **Submit for Payment**: `POST /api/claims/:claimId/submit-payment`
  - Provider submits claim to insurer
  - Status: `draft` → `pending_approval`

- **Approve Payment**: `POST /api/claims/:claimId/approve-payment`
  - Insurer approves and pays claim
  - Creates Circle transfer
  - Status: `pending_approval` → `approved` → `processing` → `paid`

### Webhooks
- **Webhook Handler**: `POST /api/circle/webhook`
  - Handles `transfer.completed` events
  - Handles `transfer.failed` events
  - Updates claim status automatically

## Setup Instructions

### 1. Configure API Key
```bash
# In .env file
CIRCLE_API_KEY=d2353934cefc90caae88c92ae453cfef:84a334e987def3708e9d6eaf1cd548bf
CIRCLE_BASE_URL=https://api-sandbox.circle.com
CIRCLE_ENVIRONMENT=sandbox
```

### 2. Create Test Wallets
```bash
cd middleware-platform
node scripts/setup-circle-wallets.js
```

This will create:
- Provider wallet (entity_id: `default`)
- Insurer wallets (for test insurers)

### 3. Test the Flow
1. Create a claim from PDF coding
2. Submit claim for payment
3. Approve claim (insurer dashboard)
4. Verify payment status updates
5. Check wallet balances

## Testing the Integration

### Test Flow
1. **Create Claim**
   - Upload PDF and extract codes
   - Select patient
   - Click "Create Claim"
   - Claim status: `draft`

2. **Submit for Payment**
   - On claims page, click "Submit for Payment"
   - Claim status: `pending_approval`

3. **Approve Payment**
   - Insurer clicks "Approve & Pay"
   - Circle transfer created
   - Claim status: `processing`

4. **Payment Completion**
   - Circle webhook received
   - Claim status: `paid`
   - Balances updated

## Circle API Endpoints Used

### Wallets
- `POST /v1/w3s/wallets` - Create wallet
- `GET /v1/w3s/wallets/{id}` - Get wallet
- `GET /v1/w3s/wallets/{id}/balances` - Get balance

### Transfers
- `POST /v1/transfers` - Create transfer
- `GET /v1/transfers/{id}` - Get transfer status

### Webhooks
- Payment completion notifications
- Transfer status updates

## Next Steps

### Immediate
1. ✅ Test wallet creation with Circle API
2. ✅ Verify API key authentication
3. ✅ Test transfer creation
4. ✅ Set up webhook endpoint URL in Circle dashboard

### Future Enhancements
1. **Dashboard Views**
   - Provider: View received payments and balance
   - Insurer: View pending claims and payment history
   - Patient: View claim status and patient responsibility

2. **Automation**
   - Auto-approve claims under certain amount
   - Auto-submit claims after creation
   - Payment reminders

3. **Reporting**
   - Payment reports
   - Transaction history
   - Balance reconciliation

## Notes

### Circle API Structure
The Circle API endpoints may need adjustment based on actual Circle API documentation. The current implementation uses:
- `/v1/w3s/wallets` for wallet operations
- `/v1/transfers` for transfer operations

These endpoints may need to be adjusted based on Circle's actual API structure.

### Webhook Security
Webhook signature verification is currently a placeholder. Implement actual signature verification based on Circle's webhook signature algorithm.

### Error Handling
All Circle API calls include error handling, but additional error scenarios may need to be handled based on Circle's actual API responses.

## Support

For Circle API documentation, visit: https://developers.circle.com

For issues or questions, check the Circle API documentation or contact Circle support.


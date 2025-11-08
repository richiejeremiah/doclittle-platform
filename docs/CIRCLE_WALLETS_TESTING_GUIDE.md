# Circle Wallets Testing Guide

## ✅ Status: Ready for Testing!

All 3 test accounts now have Circle wallets set up and ready for testing.

## Test Accounts & Wallets

### 1. Healthcare Provider
- **Email**: `provider@doclittle.com`
- **Password**: `demo123`
- **Entity Type**: `provider`
- **Entity ID**: `default`
- **Wallet ID**: `ffe046e9-7edd-5f3a-8b13-2e2bfeaed3b6`
- **Status**: ✅ Active
- **Balance**: $0.00 USDC (new wallets start with $0)

### 2. Insurer Admin
- **Email**: `insurer@doclittle.com`
- **Password**: `demo123`
- **Entity Type**: `insurer`
- **Entity ID**: `TEST_INSURER_001`
- **Wallet ID**: `c60aeb23-1fe3-5add-8b64-19d8871e82e0`
- **Status**: ✅ Active
- **Balance**: $0.00 USDC (new wallets start with $0)

### 3. Patient Wallet
- **Email**: `patient@doclittle.com`
- **Password**: `demo123`
- **Entity Type**: `patient`
- **Entity ID**: `default`
- **Wallet ID**: `387ecc48-8348-58de-a49a-8a08e1a5fdc2`
- **Status**: ✅ Active
- **Balance**: $0.00 USDC (new wallets start with $0)

## Frontend Visualization

### Wallets Page
**URL**: `http://localhost:8000/business/wallets.html`

**Features**:
- ✅ View all 3 wallet accounts
- ✅ See real-time USDC balances
- ✅ Create missing wallets (if needed)
- ✅ Refresh wallet balances
- ✅ View wallet IDs and status

### How to Test

1. **Login to Dashboard**:
   - Go to: `http://localhost:8000/login.html`
   - Use any of the 3 test accounts:
     - `insurer@doclittle.com` / `demo123`
     - `provider@doclittle.com` / `demo123`
     - `patient@doclittle.com` / `demo123`

2. **View Wallets**:
   - Click "Wallets" in the sidebar navigation
   - You'll see all 3 wallet cards:
     - Healthcare Provider wallet
     - Insurer Admin wallet
     - Patient Wallet

3. **Test Wallet Operations**:
   - **Refresh Balance**: Click "🔄 Refresh Balance" to get latest balance from Circle
   - **Create Wallet**: If a wallet is missing, click "➕ Create Wallet" (shouldn't be needed - all 3 are created)
   - **View Details**: See wallet ID, entity type, status, and balance

## Payment Flow Testing

### Workflow
1. **Provider creates claim** from PDF scan
2. **Provider submits claim** for payment (moves to `pending_approval`)
3. **Insurer approves claim** and payment is processed via Circle
4. **Payment transfer** happens: Insurer → Provider (USDC)
5. **Balances update** in both wallets

### Testing Steps

1. **Create a Claim**:
   - Go to "Scan" page
   - Upload a PDF
   - Extract codes
   - Select a patient
   - Click "Create Claim"

2. **Submit for Payment**:
   - Go to "Billing" page
   - Click on a claim
   - Click "Submit for Payment" button
   - Claim status changes to `pending_approval`

3. **Approve & Pay** (as Insurer):
   - Login as `insurer@doclittle.com`
   - Go to "Billing" page
   - Find claim with `pending_approval` status
   - Click "Approve & Pay" button
   - Circle transfer is created (Insurer → Provider)

4. **View Wallet Balances**:
   - Go to "Wallets" page
   - Click "🔄 Refresh Balance" on both wallets
   - See updated balances after payment

## API Endpoints for Testing

### Get Wallet Balance
```bash
GET /api/circle/accounts/:entityType/:entityId
```

**Examples**:
- `GET /api/circle/accounts/provider/default`
- `GET /api/circle/accounts/insurer/TEST_INSURER_001`
- `GET /api/circle/accounts/patient/default`

### Create Wallet
```bash
POST /api/circle/wallets
Body: {
  "entityType": "patient",
  "entityId": "default",
  "description": "Patient Wallet"
}
```

### Submit Claim for Payment
```bash
POST /api/claims/:claimId/submit-payment
```

### Approve Claim Payment
```bash
POST /api/claims/:claimId/approve-payment
```

## Current Wallet Status

All 3 wallets are created and active:
- ✅ Provider wallet: Created and stored in database
- ✅ Insurer wallet: Created and stored in database  
- ✅ Patient wallet: Created and stored in database

**Note**: Wallets start with $0.00 USDC balance. To test payments:
1. Fund test wallets with testnet USDC (if Circle provides testnet faucet)
2. Or test the payment flow - it will show $0.00 until wallets are funded

## Testing Checklist

- [x] All 3 test accounts can login
- [x] All 3 wallets are created in Circle
- [x] Wallets page displays all 3 accounts
- [x] Balance retrieval works (shows $0.00 for new wallets)
- [x] Wallet creation works via API
- [x] Wallet creation works via frontend
- [ ] Test payment transfer (Provider → Insurer)
- [ ] Test claim payment flow (Insurer → Provider)
- [ ] Verify balances update after payment
- [ ] Test webhook handling (when Circle sends payment updates)

## Next Steps

1. **Fund Test Wallets** (Optional):
   - Use Circle testnet faucet if available
   - Or transfer testnet USDC from another wallet
   - Or test with $0.00 balances (flow will work, just show $0)

2. **Test Payment Flow**:
   - Create a claim
   - Submit for payment
   - Approve payment (as Insurer)
   - Verify transfer is created
   - Check wallet balances

3. **Monitor Webhooks**:
   - Set up webhook endpoint: `POST /api/circle/webhook`
   - Circle will send updates when transfers complete
   - Balances will update automatically

## Troubleshooting

### Wallet Balance Shows $0.00
- **Expected**: New wallets start with $0.00 USDC
- **Solution**: Fund wallets with testnet USDC or test payment flow

### Wallet Not Found
- **Check**: Wallet exists in database (`circle_accounts` table)
- **Solution**: Create wallet via frontend or API

### Balance Not Updating
- **Check**: Circle webhook is configured
- **Solution**: Manually refresh balance or wait for webhook

### Payment Transfer Fails
- **Check**: Both wallets have sufficient balance (for testing, you might need to fund)
- **Check**: Wallet IDs are correct
- **Check**: Circle API key and entity secret are set correctly

## Summary

✅ **All 3 test accounts have Circle wallets**
✅ **Frontend visualization is ready** at `/business/wallets.html`
✅ **Payment flow is implemented** (submit → approve → transfer)
✅ **Balance retrieval works** (shows real-time balances from Circle)
✅ **Ready for end-to-end testing** of the payment workflow

**You can now test the complete billing and payment flow with the 3 test accounts!**


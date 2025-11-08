# Circle SDK Integration Guide

## Overview

We've updated the Circle integration to use the **official Circle Node.js SDK** for Developer-Controlled Wallets instead of direct API calls. This provides:

- ✅ Proper authentication handling
- ✅ Simplified API usage
- ✅ Better error handling
- ✅ Type safety and validation
- ✅ Automatic retry logic

## What Changed

### Before (Direct API Calls)
- Used `axios` to make direct HTTP requests
- Manual authentication header management
- Manual endpoint construction
- Authentication failures

### After (Circle SDK)
- Uses `@circle-fin/developer-controlled-wallets` SDK
- SDK handles authentication automatically
- Simplified method calls
- Proper error handling

## Required Setup

### 1. Install Circle SDK
```bash
cd middleware-platform
npm install @circle-fin/developer-controlled-wallets
```

✅ **Already installed!**

### 2. Get Your Entity Secret

**This is required for developer-controlled wallets!**

1. Log into Circle Console: https://console.circle.com
2. Navigate to your Developer Services account
3. Go to **Settings** or **Entity Secrets**
4. Generate or copy your **Entity Secret**
5. **Important**: Entity Secret is shown only once - save it securely!

### 3. Update Environment Variables

Add to your `.env` file:

```bash
# Circle API Configuration
CIRCLE_API_KEY=TEST_API_KEY:d2353934cefc90caae88c92ae453cfef:84a334e987def3708e9d6eaf1cd548bf
CIRCLE_ENTITY_SECRET=your_entity_secret_here
CIRCLE_BASE_URL=https://api-sandbox.circle.com
CIRCLE_ENVIRONMENT=sandbox

# Optional: Store wallet set ID after first creation
CIRCLE_WALLET_SET_ID=your_wallet_set_id
```

## Key Concepts

### Wallet Sets
- **Wallet Sets** group wallets together for easier management
- Required before creating wallets
- Created automatically if not provided
- Store the wallet set ID for reuse

### Developer-Controlled Wallets
- Wallets are controlled by your server (not end users)
- Perfect for Provider and Insurer accounts
- Requires Entity Secret for authentication
- All operations happen server-side

## Updated Code Structure

### Circle Service (`services/circle-service.js`)

**New Methods:**
- `isAvailable()` - Check if SDK is configured
- `createWalletSet()` - Create a wallet set (required first)
- `createWallet()` - Create a wallet (now uses SDK)
- `getWalletBalance()` - Get wallet balance (SDK)
- `createTransfer()` - Create transfer (SDK)
- `getTransferStatus()` - Get transfer status (SDK)
- `getWallet()` - Get wallet details (SDK)

**All methods now:**
- Use Circle SDK internally
- Handle authentication automatically
- Return consistent error formats
- Include detailed error messages

## Setup Script

### Running the Setup

```bash
cd middleware-platform
node scripts/setup-circle-wallets.js
```

**What it does:**
1. ✅ Checks if SDK is available
2. ✅ Creates a wallet set
3. ✅ Creates wallets for Provider and Insurers
4. ✅ Stores wallet IDs in database
5. ✅ Displays wallet balances

## API Endpoints

All existing API endpoints continue to work:

- `POST /api/circle/wallets` - Create wallet
- `GET /api/circle/wallets/:walletId/balance` - Get balance
- `GET /api/circle/accounts/:entityType/:entityId` - Get account
- `POST /api/claims/:claimId/submit-payment` - Submit claim
- `POST /api/claims/:claimId/approve-payment` - Approve & pay
- `POST /api/circle/webhook` - Webhook handler

## Workflow

### 1. Initial Setup
```bash
# 1. Install SDK (already done)
npm install @circle-fin/developer-controlled-wallets

# 2. Add Entity Secret to .env
CIRCLE_ENTITY_SECRET=your_entity_secret

# 3. Run setup script
node scripts/setup-circle-wallets.js
```

### 2. Create Wallets
The setup script will:
- Create a wallet set
- Create Provider wallet
- Create Insurer wallets
- Store wallet IDs in database

### 3. Use Wallets
- Provider submits claim → Status: `pending_approval`
- Insurer approves → Circle transfer created
- Payment processed → Status: `paid`
- Balances updated

## Troubleshooting

### Error: "Circle SDK not available"
**Solution**: Install the SDK
```bash
npm install @circle-fin/developer-controlled-wallets
```

### Error: "Entity secret not configured"
**Solution**: Add Entity Secret to .env file
```bash
CIRCLE_ENTITY_SECRET=your_entity_secret_here
```

### Error: "Failed to create wallet set"
**Possible causes:**
- Invalid API key
- Invalid entity secret
- Account not set up properly
- Network issues

**Solution**: 
1. Verify API key in Circle Console
2. Verify entity secret is correct
3. Check Circle Console for account status
4. Review error details in console output

### Error: "Wallet set ID not found"
**Solution**: The setup script creates a wallet set automatically. If this error occurs:
1. Run the setup script again
2. Or manually create a wallet set and store the ID

## Documentation References

- **Circle SDK Docs**: https://developers.circle.com/sdk-explorer/developer-controlled-wallets/Node.js/getting-started
- **Getting Started Guide**: https://developers.circle.com/interactive-quickstarts/get-started
- **Circle Console**: https://console.circle.com

## Next Steps

1. ✅ **Get Entity Secret** from Circle Console
2. ✅ **Add to .env** file
3. ✅ **Run setup script** to create wallets
4. ✅ **Test wallet creation** via API
5. ✅ **Test payment transfers** between wallets

## Benefits of Using SDK

1. **Simplified Integration**: No need to manage API endpoints manually
2. **Better Error Handling**: SDK provides detailed error messages
3. **Automatic Retries**: SDK handles retry logic
4. **Type Safety**: Better IDE support and type checking
5. **Future-Proof**: SDK is updated with new Circle features automatically
6. **Security**: SDK handles authentication securely

## Migration Notes

- ✅ All existing API endpoints remain the same
- ✅ Database schema unchanged
- ✅ Frontend integration unchanged
- ✅ Only backend service updated to use SDK
- ✅ Backward compatible with existing data

## Support

If you encounter issues:
1. Check Circle Console for account status
2. Verify API key and entity secret are correct
3. Review error messages in console output
4. Check Circle documentation for latest updates
5. Contact Circle support if needed

---

**Last Updated**: Based on Circle SDK v1.0.0
**Circle Documentation**: https://developers.circle.com


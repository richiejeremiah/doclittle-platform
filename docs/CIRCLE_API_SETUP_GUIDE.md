# Circle API Setup Guide

## API Key Format Issue

The Circle API requires API keys in a specific format:
```
ENVIRONMENT:ID:SECRET
```

For example:
```
TEST_API_KEY:d2353934cefc90caae88c92ae453cfef:84a334e987def3708e9d6eaf1cd548bf
```

## Current Status

The integration code has been updated to:
1. ✅ Automatically add `TEST_API_KEY:` prefix if key is in old format (2 parts)
2. ✅ Try multiple endpoint patterns
3. ✅ Try different authentication methods (Bearer token, API key header)
4. ✅ Provide detailed error logging

## Current Error: "Invalid credentials"

This suggests:
- The API key format is now correct (3 parts)
- But either:
  1. The API key itself is invalid/expired
  2. The API key doesn't have permission for the endpoints we're trying
  3. The endpoints we're using are incorrect for your Circle account type

## Next Steps

### 1. Verify API Key in Circle Dashboard
- Log into your Circle Console (sandbox)
- Verify the API key is active
- Check what permissions/scopes it has
- Confirm it's for the correct environment (sandbox vs production)

### 2. Check Circle API Documentation
- Visit: https://developers.circle.com
- Check the exact endpoint structure for your account type
- Verify the authentication method required
- Check if your account needs special setup (e.g., Programmable Wallets enabled)

### 3. Test API Key Manually
You can test the API key directly using curl:

```bash
# Test with Bearer token (current method)
curl -X GET "https://api-sandbox.circle.com/v1/configuration" \
  -H "Authorization: Bearer TEST_API_KEY:YOUR_ID:YOUR_SECRET" \
  -H "Content-Type: application/json"

# Test with API key header (alternative method)
curl -X GET "https://api-sandbox.circle.com/v1/configuration" \
  -H "X-API-Key: TEST_API_KEY:YOUR_ID:YOUR_SECRET" \
  -H "Content-Type: application/json"
```

### 4. Common Circle API Endpoints

Based on Circle's API structure, try these endpoints:

#### Programmable Wallets (if enabled):
- `POST /v1/w3s/wallets` - Create wallet
- `GET /v1/w3s/wallets/{id}` - Get wallet
- `GET /v1/w3s/wallets/{id}/balances` - Get balance

#### Classic Payments API:
- `POST /v1/payments` - Create payment
- `GET /v1/payments/{id}` - Get payment

#### Transfers:
- `POST /v1/transfers` - Create transfer
- `GET /v1/transfers/{id}` - Get transfer

### 5. Account Type Considerations

Circle has different API structures for:
- **Programmable Wallets**: Requires entities, then wallets
- **Classic Payments**: Direct payment creation
- **Circle Account**: Different structure entirely

Check your Circle account type and use the appropriate endpoints.

## Troubleshooting

### Error: "Invalid credentials"
- ✅ API key format is correct (we fixed this)
- ❓ API key might be invalid - verify in Circle Console
- ❓ API key might not have correct permissions
- ❓ Endpoint might require different authentication

### Error: "Resource not found"
- Endpoint path might be incorrect
- Account might not have access to that endpoint
- Might need to enable feature in Circle Console

### Error: "Entity not found"
- Need to create entity first (for Programmable Wallets)
- Entity creation endpoint might be different

## Manual Testing

Once you have the correct API key and endpoint structure:

1. Update `.env` file:
```bash
CIRCLE_API_KEY=TEST_API_KEY:your_id:your_secret
CIRCLE_BASE_URL=https://api-sandbox.circle.com
```

2. Test wallet creation:
```bash
cd middleware-platform
node scripts/setup-circle-wallets.js
```

3. Check the detailed error messages to identify the exact issue

## Integration Status

✅ **Completed:**
- Circle service implementation
- Database schema for Circle accounts and transfers
- API endpoints for wallet creation and transfers
- Frontend integration for payment status
- Error handling and logging

⏳ **Pending:**
- Valid API key with correct permissions
- Correct endpoint structure for your Circle account
- Successful wallet creation
- End-to-end payment flow testing

## Support Resources

- Circle API Documentation: https://developers.circle.com
- Circle Support: Check your Circle Console for support options
- Circle Status: Check Circle's status page for API issues

## Next Action

**Please verify your Circle API key in the Circle Console and confirm:**
1. The API key is active and valid
2. What endpoints/permissions it has
3. What type of Circle account you have (Programmable Wallets, Classic Payments, etc.)
4. If there are any special setup requirements

Once we have this information, we can adjust the integration code to match your specific Circle account setup.


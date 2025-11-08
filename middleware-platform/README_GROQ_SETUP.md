# Groq API Setup Instructions

## Step 1: Install Dependencies

```bash
cd middleware-platform
npm install
```

This will install `groq-sdk` which was added to `package.json`.

## Step 2: Verify API Key

Add your Groq API key to your `.env` file:
```
GROQ_API_KEY=your_groq_api_key_here
```

You can get your API key from: https://console.groq.com/keys

## Step 3: Test Connection

Run the test script to verify Groq is working:

```bash
node tests/test-groq-connection.js
```

This will test:
- ✅ API key validation
- ✅ Basic API connection
- ✅ JSON response format
- ✅ Medical coding context

## Expected Output

```
🧪 Testing Groq API Connection

============================================================
✅ API Key found
   Key: gsk_tM7Luvn...
📡 Testing API connection...
✅ API Connection Successful!
📝 Response: Groq API is working!
📡 Testing JSON response format...
✅ JSON Format Working!
📡 Testing medical coding context...
✅ Medical Coding Context Working!
✅ All Groq API tests passed!
✅ Ready for medical coding integration
```

## Troubleshooting

If you see errors:

1. **Module not found**: Run `npm install` first
2. **API key error**: Check `.env` file has `GROQ_API_KEY`
3. **Network error**: Check internet connection
4. **Rate limit**: Free tier is 14,400 requests/day

## Next Steps

Once the test passes, we'll integrate Groq into the medical coding service!


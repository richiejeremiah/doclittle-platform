# Railway Timeout Troubleshooting

## Current Issue

**Error**: `11205 - Request to https://web-production-a783d.up.railway.app/voice/incoming timed out`

**Status**: 502 Bad Gateway  
**Duration**: ~15 seconds before timeout  
**Impact**: Calls show "Busy" or "No Answer"

## Possible Causes

### 1. Railway Server Not Running

The server might be:
- **Sleeping** (Railway free tier sleeps after inactivity)
- **Crashed** (Check Railway logs)
- **Not deployed** (Check Railway deployments)

**Check**:
1. Go to Railway Dashboard: https://railway.app/
2. Check service status
3. Check recent deployments
4. Check logs for errors

### 2. Retell API Slow/Unresponsive

The Retell API call might be taking too long:
- Network issues
- Retell API down
- Authentication problems

**Check**:
1. Verify `RETELL_API_KEY` is set in Railway
2. Check Retell API status
3. Test Retell API directly

### 3. Database Lock/Blocking

SQLite database might be locked:
- Concurrent access issues
- Long-running queries
- Database file corruption

**Check**:
1. Check Railway logs for database errors
2. Verify database file exists
3. Check for blocking queries

## Immediate Fixes

### Fix 1: Reduce Retell Timeout Further

Already implemented:
- Retell timeout: 3 seconds (reduced from 5 seconds)
- Immediate error handling if Retell fails
- Return error TwiML if Retell registration fails

### Fix 2: Check Railway Service Status

1. **Go to Railway Dashboard**
2. **Check Service Status**:
   - Is service running?
   - Are there any errors?
   - Is the latest deployment successful?

3. **Check Environment Variables**:
   - `RETELL_API_KEY` - Must be set
   - `RETELL_AGENT_ID` - Must be set
   - `NODE_ENV` - Should be `production`

### Fix 3: Restart Railway Service

If service is sleeping or stuck:

1. **Go to Railway Dashboard**
2. **Click on your service**
3. **Click "Restart"** or **"Redeploy"**
4. **Wait for deployment to complete**

### Fix 4: Check Railway Logs

1. **Go to Railway Dashboard**
2. **Click on your service**
3. **Go to "Logs" tab**
4. **Look for**:
   - Error messages
   - Timeout errors
   - Retell API errors
   - Database errors

## Testing

### Test 1: Check if Server is Running

```bash
curl https://web-production-a783d.up.railway.app/health
```

Should return: `{"status":"ok"}` or similar

### Test 2: Test Voice Endpoint Directly

```bash
curl -X POST https://web-production-a783d.up.railway.app/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B18622307479&To=%2B15856202445&CallSid=test123" \
  --max-time 5
```

Should return TwiML XML within 5 seconds

### Test 3: Check Retell API

```bash
curl -X POST https://api.retellai.com/v2/register-phone-call \
  -H "Authorization: Bearer YOUR_RETELL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent_9151f738c705a56f4a0d8df63a",
    "audio_websocket_protocol": "twilio",
    "from_number": "+18622307479",
    "to_number": "+15856202445"
  }' \
  --max-time 5
```

Should return call_id within 5 seconds

## Quick Actions

### If Server is Down:
1. Restart Railway service
2. Check Railway logs
3. Verify environment variables

### If Retell API is Slow:
1. Check Retell API status
2. Verify API key is correct
3. Consider using Retell's webhook instead of direct API call

### If Database is Locked:
1. Check Railway logs for database errors
2. Restart Railway service
3. Check database file permissions

## Expected Response Time

**Target**: < 3 seconds  
**Current**: 15+ seconds (timeout)

**Breakdown**:
- Retell API call: < 3 seconds (with timeout)
- TwiML generation: < 0.1 seconds
- **Total**: < 3.1 seconds

## Next Steps

1. **Check Railway Dashboard** - Verify service is running
2. **Check Railway Logs** - Look for errors
3. **Test Endpoint** - Use curl to test directly
4. **Check Retell API** - Verify API is responding
5. **Restart Service** - If needed, restart Railway service

## Monitoring

After fix, monitor:
- Response times in Railway logs
- Twilio call success rate
- Retell API response times
- Error rates

---

**Last Updated**: November 10, 2024  
**Error**: 11205 - Request timeout  
**Status**: Investigating Railway server response


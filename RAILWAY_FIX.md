# Railway Deployment Fix

## Issue
Railway failed with "Error creating build plan with Railpack"

## Solution Applied
1. ✅ Added `nixpacks.toml` to specify build configuration
2. ✅ Updated `railway.json` to simplify build process
3. ✅ Committed and pushed changes

## What You Need to Do in Railway

### Option 1: Update Settings (Recommended)
1. Go to your Railway project
2. Click on the "web" service
3. Go to **Settings** tab
4. Under **Build Settings**:
   - **Root Directory**: `middleware-platform` ✅ (should already be set)
   - **Build Command**: Leave empty or `npm install`
   - **Start Command**: `node server.js` ✅ (should already be set)
5. Click **Save**
6. Railway will auto-redeploy

### Option 2: Redeploy
1. Go to your Railway project
2. Click on the "web" service
3. Click **Deploy** → **Redeploy**
4. Wait for deployment

### Option 3: Check Logs
If it still fails:
1. Click **Build Logs** tab
2. Check the error message
3. Share the error with me

## Verify Environment Variables
Make sure all these are set in Railway:
- `PORT=4000`
- `RETELL_API_KEY`
- `RETELL_AGENT_ID`
- `STRIPE_SECRET_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- All Google Calendar variables
- All SMTP variables

## After Fix
Once deployed successfully:
1. Copy the Railway URL: `https://web-production-a783d.up.railway.app`
2. Test: Visit `https://web-production-a783d.up.railway.app/health`
3. Should return: `{"status":"ok","service":"middleware-platform"}`


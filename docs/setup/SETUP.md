# Complete Setup Guide - DocLittle Platform

This is the **only setup document** you need. It covers everything from initial setup to troubleshooting.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Local Development](#local-development)
4. [Production Deployment](#production-deployment)
5. [Domain Configuration](#domain-configuration)
6. [Voice Agent Setup](#voice-agent-setup)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ (install via nvm: `nvm install node`)
- Git repository cloned
- API keys for: Retell AI, Twilio, Stripe (optional), Circle (optional)

### Initial Setup

```bash
# 1. Install dependencies
cd middleware-platform
npm install

# 2. Create .env file
cp .env.example .env  # Or create manually

# 3. Add your API keys to .env (see Environment Variables section)

# 4. Start local server
npm start
```

---

## 🔧 Environment Variables

### Required Variables

```bash
# Server Configuration
PORT=4000
NODE_ENV=development  # or 'production'

# Retell AI (Voice Agent)
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=agent_9151f738c705a56f4a0d8df63a

# Twilio (Phone Calls)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# API Base URL (for production)
API_BASE_URL=https://web-production-a783d.up.railway.app
# Or for local development with tunnel:
# API_BASE_URL=https://your-tunnel-url.com
```

### Optional Variables

```bash
# Stripe (Payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Circle (USDC Wallets) - Optional, server works without it
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret

# Database
DATABASE_PATH=./database.sqlite

# Email (SMTP or Azure)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password

# Or Azure Communication Services
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=...
AZURE_EMAIL_SENDER=DoNotReply@your-domain.com
```

### Where to Set Variables

**Local Development:**
- File: `middleware-platform/.env`
- Create this file manually

**Production (Railway):**
- Railway Dashboard → Your Service → Variables
- Add each variable as `KEY=value`

---

## 💻 Local Development

### Running Locally

```bash
# Option 1: Use the start script
./start-local.sh

# Option 2: Manual start
cd middleware-platform
npm start
```

### Exposing Local Server to Internet (for Testing)

To test with Retell/Twilio, you need to expose your local server:

#### Option A: Cloudflare Tunnel (Recommended - Free)

```bash
# Install
brew install cloudflare/cloudflare/cloudflared

# Run tunnel (in separate terminal)
cloudflared tunnel --url http://localhost:4000

# Copy the URL (e.g., https://abc123.trycloudflare.com)
# Use this URL for Retell/Twilio webhooks
```

#### Option B: ngrok (Alternative)

```bash
# Install and sign up at ngrok.com
brew install ngrok/ngrok/ngrok
ngrok config add-authtoken YOUR_TOKEN

# Run tunnel
ngrok http 4000

# Copy the URL (e.g., https://abc123.ngrok-free.app)
```

#### Option C: localtunnel (Simplest)

```bash
npm install -g localtunnel
lt --port 4000
```

### Updating Retell/Twilio for Local Testing

1. **Get your tunnel URL** (from above)
2. **Update Retell:**
   ```bash
   API_BASE_URL=https://your-tunnel-url.com node middleware-platform/configure-retell.js
   ```
3. **Update Twilio:**
   - Go to: https://console.twilio.com/
   - Phone Numbers → Your Number → Voice & Fax
   - Set "A CALL COMES IN" to: `https://your-tunnel-url.com/voice/incoming`

---

## 🚀 Production Deployment

### Railway Deployment

1. **Connect GitHub to Railway:**
   - Railway Dashboard → New Project → Deploy from GitHub
   - Select your repository

2. **Set Environment Variables:**
   - Railway Dashboard → Your Service → Variables
   - Add all required variables (see Environment Variables section)
   - **Important**: Set `API_BASE_URL=https://web-production-a783d.up.railway.app`

3. **Deploy:**
   - Railway auto-deploys on git push
   - Check logs for deployment status

### Backend URL

- **Railway URL**: `https://web-production-a783d.up.railway.app`
- **Custom Domain** (optional): `api.doclittle.site` (if configured)

### Frontend URL

- **Netlify URL**: `https://doclittle.netlify.app`
- **Custom Domain**: `https://doclittle.site`

---

## 🌐 Domain Configuration

### Current Setup

- **Domain**: `doclittle.site` (registered with IONOS)
- **Frontend**: Hosted on Netlify
- **Backend**: Hosted on Railway
- **DNS**: Managed by Netlify (nameservers: `dns1-4.p06.nsone.net`)

### Connecting Domain to Netlify

1. **Update Nameservers in IONOS:**
   - Go to: https://my.ionos.com/domain-dns-settings/doclittle.site
   - Change nameservers to Netlify's:
     ```
     dns1.p06.nsone.net
     dns2.p06.nsone.net
     dns3.p06.nsone.net
     dns4.p06.nsone.net
     ```

2. **Add Domain in Netlify:**
   - Netlify Dashboard → Site Settings → Domain management
   - Click "Add domain alias"
   - Enter: `doclittle.site`
   - Wait for DNS verification (5-10 minutes)

3. **Wait for SSL:**
   - Netlify auto-provisions SSL certificates
   - Check: Domain Settings → HTTPS
   - Should show "Certificate provisioned"

### DNS Records

Netlify automatically manages:
- A records (for root domain)
- AAAA records (IPv6)
- CNAME records (for www subdomain)

**No manual DNS configuration needed** - Netlify handles it automatically.

---

## 🎙️ Voice Agent Setup

### Retell Configuration

1. **Configure Retell Agent:**
   ```bash
   cd middleware-platform
   node configure-retell.js
   ```

2. **This sets:**
   - LLM WebSocket URL: `wss://your-backend-url.com/webhook/retell/llm`
   - Agent name: "Kelly - DocLittle Medical Voice Assistant"
   - Functions: All healthcare functions (collect_insurance, schedule_appointment, etc.)

3. **Verify in Retell Dashboard:**
   - Go to: https://dashboard.retellai.com/
   - Check agent settings
   - Verify WebSocket URL is correct

### Twilio Configuration

1. **Get Phone Number:**
   - Twilio Console → Phone Numbers → Buy a number
   - Or use existing: `+15856202445`

2. **Set Voice Webhook:**
   - Phone Numbers → Your Number → Voice & Fax
   - **A CALL COMES IN**: `https://web-production-a783d.up.railway.app/voice/incoming`
   - **HTTP Method**: POST
   - Save

3. **For Local Testing:**
   - Use tunnel URL: `https://your-tunnel-url.com/voice/incoming`

### Testing Voice Calls

1. **Make a test call:**
   - Call your Twilio number
   - Should connect to voice agent

2. **Check logs:**
   - Railway logs (production) or local terminal (development)
   - Should see: `📞 INCOMING CALL from Twilio`

3. **Common issues:**
   - 404 error: Webhook URL is wrong
   - Timeout: Server not responding (check if running)
   - No answer: Twilio can't reach server

---

## 🔍 Troubleshooting

### Server Won't Start

**Error: "Cannot find module './middleware/security'"**
- **Fix**: Make sure all files are committed to git
- **Check**: `git status` - should show no untracked files in `middleware-platform/middleware/`

**Error: "Node.js is not installed"**
- **Fix**: Install Node.js via nvm: `nvm install node`
- **Or**: Use the start script which loads nvm automatically

**Error: "Port 4000 already in use"**
- **Fix**: Kill the process: `kill -9 $(lsof -ti:4000)`
- **Or**: Use a different port: `PORT=4001 npm start`

### Voice Agent Not Connecting

**Error: "11200 - HTTP 404"**
- **Problem**: Twilio webhook URL is wrong
- **Fix**: Update Twilio webhook to Railway backend URL:
  - `https://web-production-a783d.up.railway.app/voice/incoming`
  - NOT `https://doclittle.site/voice/incoming` (that's frontend)

**Error: "11205 - Request timed out"**
- **Problem**: Server taking too long to respond
- **Fix**: 
  - Check if server is running
  - Check Railway logs for errors
  - Verify Retell API key is correct

**Error: "No Answer"**
- **Problem**: Twilio can't reach server
- **Fix**:
  - Check webhook URL is correct
  - Verify server is running
  - Check firewall/network settings

### Domain Not Loading

**Error: "404 Not Found" on doclittle.site**
- **Problem**: Domain not connected to Netlify site
- **Fix**:
  1. Netlify Dashboard → Site Settings → Domain management
  2. Click "Add domain alias"
  3. Enter: `doclittle.site`
  4. Wait for DNS verification

**Error: "SSL Certificate Error"**
- **Problem**: SSL not provisioned yet
- **Fix**: Wait 5-10 minutes after adding domain, Netlify auto-provisions SSL

### Circle Wallet Issues

**Warning: "CIRCLE_API_KEY not set"**
- **Status**: This is OK - server works without Circle
- **Fix**: Only needed if you want wallet features
- **To enable**: Add `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` to environment variables

**Error: "Circle service not available"**
- **Problem**: Circle API keys missing or invalid
- **Fix**: 
  - Check API keys are correct
  - Verify keys are in environment variables
  - Server will continue without Circle (wallet features disabled)

### Database Issues

**Error: "Database locked"**
- **Problem**: Multiple processes accessing database
- **Fix**: 
  - Kill other server processes
  - Restart server
  - Check for concurrent database access

**Error: "Database file not found"**
- **Problem**: Database path incorrect
- **Fix**: 
  - Check `DATABASE_PATH` in `.env`
  - Default: `./database.sqlite` (relative to server.js)

---

## 📚 Quick Reference

### Important URLs

- **Backend (Railway)**: `https://web-production-a783d.up.railway.app`
- **Frontend (Netlify)**: `https://doclittle.site`
- **Retell Dashboard**: https://dashboard.retellai.com/
- **Twilio Console**: https://console.twilio.com/
- **Railway Dashboard**: https://railway.app/
- **Netlify Dashboard**: https://app.netlify.com/

### Important Endpoints

- **Health Check**: `GET /health`
- **Voice Incoming**: `POST /voice/incoming` (Twilio webhook)
- **Retell WebSocket**: `WS /webhook/retell/llm`
- **Payment Link**: `GET /payment/{token}`

### Environment Variable Priority

1. `API_BASE_URL` (highest priority)
2. `BASE_URL`
3. Railway URL (if `RAILWAY_PUBLIC_DOMAIN` is set)
4. Production domain (`doclittle.site` in production)
5. `localhost:4000` (development default)

---

## ✅ Setup Checklist

### Initial Setup
- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with API keys
- [ ] Server starts locally (`npm start`)

### Production Deployment
- [ ] Railway project created
- [ ] GitHub connected to Railway
- [ ] Environment variables set in Railway
- [ ] Server deployed and running
- [ ] Health check works: `curl https://web-production-a783d.up.railway.app/health`

### Domain Setup
- [ ] Domain registered (doclittle.site)
- [ ] Nameservers updated in IONOS
- [ ] Domain added in Netlify
- [ ] DNS verification complete
- [ ] SSL certificate provisioned
- [ ] Site loads at https://doclittle.site

### Voice Agent Setup
- [ ] Retell agent configured (`node configure-retell.js`)
- [ ] Twilio webhook URL set correctly
- [ ] Test call connects successfully
- [ ] Voice agent responds correctly

### Testing
- [ ] Local server works
- [ ] Production server works
- [ ] Voice calls work
- [ ] Payment links work
- [ ] All endpoints accessible

---

## 🆘 Getting Help

1. **Check Logs:**
   - Railway logs (production)
   - Local terminal (development)
   - Twilio logs (call issues)

2. **Verify Configuration:**
   - Environment variables set correctly
   - Webhook URLs are correct
   - API keys are valid

3. **Common Solutions:**
   - Restart server
   - Check network connectivity
   - Verify API keys
   - Check service status pages

---

**Last Updated**: November 2024  
**Version**: 1.0  
**Status**: Complete Setup Guide


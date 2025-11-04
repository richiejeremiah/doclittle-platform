# Booking System Quick Setup Guide

**DocLittle Mental Health Helpline - Get Started in 10 Minutes**

---

## Overview

This guide will get your appointment booking system up and running quickly. Follow these steps in order for the fastest setup.

---

## Prerequisites Checklist

- [ ] Node.js installed (v14 or higher)
- [ ] npm or yarn package manager
- [ ] Google account (for calendar integration - optional)
- [ ] Retell AI account with agent created
- [ ] Server with public URL or ngrok for testing

---

## Step 1: Install Dependencies

```bash
cd middleware-platform
npm install googleapis
```

**What this does:** Installs Google Calendar API client library.

---

## Step 2: Database Setup

The appointments table is automatically created when the server starts. No manual setup needed!

**Verify database migration:**
```bash
# Start the server once to initialize database
npm start

# You should see:
# ✅ Using database.js module
```

---

## Step 3: Configure Environment Variables

Edit your `.env` file in `middleware-platform/`:

### Required Variables (Already Set)

```bash
PORT=3001
RETELL_API_KEY=your-retell-api-key
RETELL_AGENT_ID=your-agent-id
```

### New Variables for Booking (Add These)

```bash
# Google Calendar Integration (OPTIONAL - recommended)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"..."}'
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com

# Or use OAuth2 instead (alternative to service account)
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-client-secret
# GOOGLE_REFRESH_TOKEN=your-refresh-token

# Optional: Timezone
GOOGLE_CALENDAR_TIMEZONE=America/New_York
```

**Note:** Google Calendar is optional. Appointments will be saved to the database regardless.

---

## Step 4: Set Up Google Calendar (Optional but Recommended)

If you want calendar sync, follow these steps:

### Quick Service Account Setup

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create new project** → "DocLittle-Calendar"
3. **Enable Google Calendar API**:
   - APIs & Services → Library → Search "Google Calendar API" → Enable
4. **Create Service Account**:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name: `doclittle-booking-service`
   - Create → Done
5. **Generate Key**:
   - Click on service account → Keys tab → Add Key → Create new key → JSON
   - Download the JSON file
6. **Share Your Calendar**:
   - Open Google Calendar
   - Settings → Your calendar → Share with specific people
   - Add service account email (from JSON): `doclittle-booking-service@...iam.gserviceaccount.com`
   - Permission: "Make changes to events"
7. **Get Calendar ID**:
   - Settings → Your calendar → Integrate calendar → Copy Calendar ID
8. **Add to .env**:
   ```bash
   GOOGLE_SERVICE_ACCOUNT_KEY='<paste entire JSON file content here as single line>'
   GOOGLE_CALENDAR_ID=<paste calendar ID>
   ```

**Detailed Instructions:** See [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md)

---

## Step 5: Start the Server

```bash
cd middleware-platform
npm start
```

**Look for these confirmation messages:**

```
🚀 MIDDLEWARE PLATFORM - PRODUCTION READY
📍 Server running on: http://localhost:3001

📅 Appointment Booking (Voice Agent):
   POST   http://localhost:3001/voice/appointments/schedule
   POST   http://localhost:3001/voice/appointments/confirm
   POST   http://localhost:3001/voice/appointments/cancel
   POST   http://localhost:3001/voice/appointments/available-slots
   POST   http://localhost:3001/voice/appointments/search

⚙️  Configuration Status:
   Database:      ✅ Using database.js module
   Google Cal:    ✅ Configured (or ⚠️ Optional if not configured)
   Retell:        ✅ Configured

📝 ARCHITECTURE:
   ✅ Using BookingService for appointment management
```

---

## Step 6: Test the Booking Endpoints

### Test 1: Check Available Slots

```bash
curl -X POST http://localhost:3001/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "date": "2025-11-15",
  "available_slots": [
    { "time": "9:00 AM", "start_time": "2025-11-15T09:00:00.000Z" },
    { "time": "10:00 AM", "start_time": "2025-11-15T10:00:00.000Z" },
    ...
  ],
  "total_slots": 8
}
```

### Test 2: Schedule an Appointment

```bash
curl -X POST http://localhost:3001/voice/appointments/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "patient_name": "Test Patient",
      "patient_phone": "+1234567890",
      "date": "November 15, 2025",
      "time": "2:30 PM"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "patient_name": "Test Patient",
    "date": "2025-11-15",
    "time": "2:30 PM",
    "status": "scheduled",
    "calendar_link": "https://calendar.google.com/..."
  },
  "message": "Appointment scheduled for Test Patient on November 15, 2025 at 2:30 PM"
}
```

✅ **If you get this response, your booking system is working!**

### Test 3: Search for Appointment

```bash
curl -X POST http://localhost:3001/voice/appointments/search \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "search_term": "+1234567890"
    }
  }'
```

---

## Step 7: Configure Retell AI Voice Agent

### A. Get Your Server URL

**For local testing, use ngrok:**

```bash
ngrok http 3001
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

**For production:** Use your actual domain.

### B. Add Functions to Retell Agent

1. **Go to [Retell Dashboard](https://beta.retellai.com/)**
2. **Select your agent**
3. **Add these 5 functions** (copy from [RETELL_FUNCTIONS_CONFIG.md](./RETELL_FUNCTIONS_CONFIG.md)):
   - `schedule_appointment`
   - `confirm_appointment`
   - `cancel_appointment`
   - `get_available_slots`
   - `search_appointments`

**Quick Copy-Paste Configuration:**

```json
{
  "name": "schedule_appointment",
  "description": "Schedule a new appointment for a patient. Always confirm date and time before scheduling.",
  "url": "https://your-domain.com/voice/appointments/schedule",
  "parameters": {
    "type": "object",
    "properties": {
      "patient_name": {"type": "string", "description": "Full name of the patient"},
      "patient_phone": {"type": "string", "description": "Phone number in E.164 format"},
      "patient_email": {"type": "string", "description": "Email address (optional)"},
      "date": {"type": "string", "description": "Appointment date (e.g., 'November 15, 2025')"},
      "time": {"type": "string", "description": "Appointment time (e.g., '2:30 PM')"},
      "notes": {"type": "string", "description": "Additional notes"}
    },
    "required": ["patient_name", "date", "time"]
  }
}
```

Repeat for all 5 functions with appropriate parameters.

**Full Configuration:** See [RETELL_FUNCTIONS_CONFIG.md](./RETELL_FUNCTIONS_CONFIG.md)

### C. Update Agent Prompt

Add to your agent's system prompt:

```
You can help patients schedule appointments. When they want to book:
1. Use get_available_slots to check availability
2. Offer them time options
3. Once they choose, use schedule_appointment to book it
4. Always confirm the appointment details clearly
5. Provide the confirmation number

For existing appointments:
- Use search_appointments to find by phone/email
- Use confirm_appointment to confirm
- Use cancel_appointment to cancel (ask for reason)
```

---

## Step 8: Test Voice Booking

1. **Call your Retell phone number** (or use test console)
2. **Say:** "I'd like to schedule an appointment"
3. **Agent should:**
   - Ask for preferred date
   - Check available slots
   - Offer time options
   - Collect your information
   - Schedule the appointment
   - Provide confirmation number

---

## Troubleshooting Quick Fixes

### ❌ "Cannot find module 'googleapis'"

**Fix:**
```bash
cd middleware-platform
npm install googleapis
```

### ❌ "Appointment endpoints not showing in server logs"

**Fix:** Make sure you have the latest server.js with updated console logs around line 1665-1670.

### ❌ "Google Calendar events not creating"

**Fix:** Check these:
```bash
# Verify env variable is set
echo $GOOGLE_SERVICE_ACCOUNT_KEY

# Check it's valid JSON
node -e "console.log(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY))"

# Verify calendar is shared with service account email
```

**Note:** Appointments will still save to database even if calendar sync fails.

### ❌ "Retell agent not calling functions"

**Fix:**
1. Verify function URLs are correct (use your ngrok or production URL)
2. Check functions are enabled in agent config
3. Test endpoints with curl first
4. Review Retell dashboard logs for errors

### ❌ "Invalid date format" errors

**Fix:** The system accepts natural language dates. Try these formats:
- "November 15, 2025"
- "2025-11-15"
- "tomorrow"
- "next Monday"

---

## What's Next?

### View Appointments in Dashboard

The dashboard automatically shows:
- **# of Calls** - Total calls received
- **Priority Cases** - High-risk patients
- **Revenue** - From orders/services
- **Call Costs** - Retell AI usage
- **Referral List** - Patients needing follow-up

Access at: `http://localhost:3000/business/dashboard.html`

### Customize Business Hours

Edit `middleware-platform/services/booking-service.js`:

```javascript
// Around line 200
const businessHours = {
  start: 9,   // 9 AM
  end: 17     // 5 PM
};

const slotDuration = 50;  // minutes
const breakBetweenSlots = 10;  // minutes
```

### Add More Providers

Currently all appointments use "DocLittle Mental Health Team". To support multiple providers:

1. Add provider field in booking requests
2. Filter available slots by provider
3. Update database queries to include provider filter

---

## Production Checklist

Before going live:

- [ ] Google Calendar service account configured
- [ ] Calendar properly shared with service account
- [ ] All 5 Retell functions configured and tested
- [ ] Agent prompt includes booking instructions
- [ ] Server deployed with public HTTPS URL
- [ ] Environment variables set on production server
- [ ] Database backup configured
- [ ] Test full booking flow end-to-end
- [ ] Test cancellation flow
- [ ] Monitor server logs for errors

---

## Getting Help

### Documentation

- [Booking System Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md) - Complete system overview
- [Google Calendar Setup](./GOOGLE_CALENDAR_SETUP.md) - Detailed calendar configuration
- [Retell AI Functions](./RETELL_FUNCTIONS_CONFIG.md) - Voice agent function setup
- [API Endpoints](./API_ENDPOINTS.md) - Complete API reference

### Common Issues

See troubleshooting sections in each documentation file.

### Support

For issues with:
- **Google Calendar API**: Check [Google Calendar API docs](https://developers.google.com/calendar)
- **Retell AI**: Check [Retell docs](https://docs.retellai.com/) or contact support
- **Database issues**: Check SQLite logs in server console

---

## Summary

You now have a fully functional appointment booking system that:

✅ Schedules appointments via voice conversation
✅ Syncs with Google Calendar (if configured)
✅ Checks real-time availability
✅ Confirms and cancels appointments
✅ Searches existing appointments
✅ Shows appointments in dashboard
✅ Tracks priority cases and referrals

**Total Setup Time:** 10-15 minutes (excluding Google Calendar setup)

**Next Steps:** Test with real calls and customize to your needs!

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

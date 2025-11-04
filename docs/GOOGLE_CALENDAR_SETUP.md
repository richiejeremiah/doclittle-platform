# Google Calendar API Setup Guide

**DocLittle Mental Health Helpline - Calendar Integration**

---

## Overview

This guide walks you through setting up Google Calendar integration for the DocLittle booking system. The integration allows appointments scheduled via the voice agent to automatically sync with Google Calendar.

**Benefits:**
- Automatic calendar event creation
- Cross-platform visibility (web, mobile, desktop)
- Built-in notifications and reminders
- Team calendar sharing
- Standard iCal format for compatibility

---

## Prerequisites

- Google account with access to Google Cloud Console
- Admin access to the DocLittle calendar
- Node.js and npm installed
- Access to server environment variables

---

## Setup Methods

There are two methods to authenticate with Google Calendar API:

1. **Service Account** (Recommended for production)
2. **OAuth2** (For user-based access)

### Which Method Should I Use?

| Use Case | Recommended Method |
|----------|-------------------|
| Production server | Service Account |
| Development/testing | OAuth2 |
| Multiple team members | Service Account with shared calendar |
| Personal calendar access | OAuth2 |

---

## Method 1: Service Account Setup (Recommended)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name: `DocLittle-Calendar`
4. Click **Create**

### Step 2: Enable Google Calendar API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click **Google Calendar API**
4. Click **Enable**

### Step 3: Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in details:
   - **Service account name:** `doclittle-booking-service`
   - **Service account ID:** `doclittle-booking-service` (auto-generated)
   - **Description:** `Service account for DocLittle appointment booking system`
4. Click **Create and Continue**
5. **Grant this service account access to project** (Optional - skip this step)
6. Click **Continue**
7. **Grant users access to this service account** (Optional - skip this step)
8. Click **Done**

### Step 4: Create Service Account Key

1. In **Credentials**, find your service account in the list
2. Click on the service account name
3. Go to **Keys** tab
4. Click **Add Key** → **Create new key**
5. Select **JSON** format
6. Click **Create**
7. **Important:** A JSON file will download - keep this secure!

The downloaded file looks like this:

```json
{
  "type": "service_account",
  "project_id": "doclittle-calendar",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "doclittle-booking-service@doclittle-calendar.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

### Step 5: Share Calendar with Service Account

1. Open [Google Calendar](https://calendar.google.com/)
2. Find the calendar you want to use (or create a new one)
3. Click the **three dots** next to the calendar → **Settings and sharing**
4. Scroll to **Share with specific people**
5. Click **Add people**
6. Enter the service account email (from JSON file):
   ```
   doclittle-booking-service@doclittle-calendar.iam.gserviceaccount.com
   ```
7. Set permission to **Make changes to events**
8. Click **Send**

### Step 6: Get Calendar ID

1. In calendar settings, scroll to **Integrate calendar**
2. Copy the **Calendar ID** (e.g., `abc123@group.calendar.google.com`)
3. If using your primary calendar, the ID is your email address

### Step 7: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Google Calendar Service Account Configuration
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"doclittle-calendar",...}'
GOOGLE_CALENDAR_ID=abc123@group.calendar.google.com
```

**Important:** The `GOOGLE_SERVICE_ACCOUNT_KEY` must be the entire JSON file content as a single-line string.

**Tip:** Convert JSON file to single line:

```bash
# macOS/Linux
cat service-account-key.json | jq -c . | pbcopy

# Or manually escape it
cat service-account-key.json | tr -d '\n'
```

### Step 8: Install Dependencies

```bash
cd middleware-platform
npm install googleapis
```

### Step 9: Test the Integration

Start the server and check the configuration status:

```bash
npm start
```

Look for:
```
⚙️  Configuration Status:
   Google Cal:    ✅ Configured
```

Test scheduling an appointment:

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

Check your Google Calendar - you should see the new appointment!

---

## Method 2: OAuth2 Setup (Alternative)

### Step 1: Create OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create new one)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure the consent screen:
   - **User Type:** Internal (if using Google Workspace) or External
   - **App name:** DocLittle Booking System
   - **User support email:** Your email
   - **Developer contact:** Your email
6. **Application type:** Web application
7. **Name:** DocLittle Calendar Integration
8. **Authorized redirect URIs:** `http://localhost:3001/oauth2callback`
9. Click **Create**
10. **Copy** the Client ID and Client Secret

### Step 2: Generate Refresh Token

Use this Node.js script to generate a refresh token:

```javascript
// generate-refresh-token.js
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3001/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Refresh token:', tokens.refresh_token);
  } catch (error) {
    console.error('Error retrieving access token', error);
  }
});
```

Run the script:

```bash
node generate-refresh-token.js
```

1. Visit the URL shown
2. Authorize the app
3. Copy the code from the redirect URL
4. Paste it into the terminal
5. **Save the refresh token** displayed

### Step 3: Configure Environment Variables

```bash
# Google Calendar OAuth2 Configuration
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_CALENDAR_ID=primary
```

### Step 4: Install Dependencies

```bash
cd middleware-platform
npm install googleapis
```

### Step 5: Test the Integration

Same as Service Account method - start server and test scheduling.

---

## Environment Variables Reference

### Service Account Method

```bash
# Required for Service Account
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
GOOGLE_CALENDAR_ID=calendar-id@group.calendar.google.com

# Optional
GOOGLE_CALENDAR_TIMEZONE=America/New_York
```

### OAuth2 Method

```bash
# Required for OAuth2
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_CALENDAR_ID=primary

# Optional
GOOGLE_CALENDAR_TIMEZONE=America/New_York
```

---

## Calendar Event Format

When an appointment is created, the system generates a Google Calendar event with:

**Summary:** `Appointment: [Patient Name]`

**Description:**
```
Mental Health Consultation

Patient: [Name]
Phone: [Phone]
Email: [Email]

Type: [Appointment Type]
Provider: [Provider Name]

Notes: [Any additional notes]

---
Scheduled via DocLittle Mental Health Helpline
```

**Start Time:** Appointment date/time
**End Time:** Start time + duration (default 50 minutes)
**Attendees:** Patient email (if provided)

---

## Troubleshooting

### Error: "Calendar not found"

**Problem:** Service account doesn't have access to calendar

**Solution:**
1. Verify calendar ID is correct
2. Ensure calendar is shared with service account email
3. Check permission level is "Make changes to events"

### Error: "Invalid credentials"

**Problem:** Service account key or OAuth2 credentials are invalid

**Solution:**
1. Verify environment variables are set correctly
2. Check JSON is properly escaped (no line breaks in .env)
3. Regenerate service account key if corrupted
4. For OAuth2, regenerate refresh token

### Error: "Insufficient permissions"

**Problem:** Service account lacks calendar API permissions

**Solution:**
1. Verify Google Calendar API is enabled in Cloud Console
2. Check service account has correct scopes
3. For Google Workspace, ensure admin has granted domain-wide delegation

### Events Creating but Not Visible

**Problem:** Wrong calendar ID or calendar not shared

**Solution:**
1. Check `GOOGLE_CALENDAR_ID` matches the target calendar
2. For service accounts, verify calendar sharing settings
3. For OAuth2, ensure correct Google account is authorized

### "googleapis not found" Error

**Problem:** Package not installed

**Solution:**
```bash
cd middleware-platform
npm install googleapis
```

---

## Security Best Practices

### Protect Service Account Keys

1. **Never commit** service account JSON to version control
2. Add to `.gitignore`:
   ```
   service-account-key.json
   .env
   ```
3. Store in secure environment variable management system
4. Rotate keys periodically (every 90 days recommended)
5. Use separate service accounts for dev/staging/prod

### Limit Permissions

1. Share calendar with minimum required permission level
2. Don't use service accounts with project owner access
3. Create dedicated calendar for appointments (don't use personal)
4. Regularly audit service account access

### Monitor Usage

1. Enable Google Cloud audit logs
2. Set up alerts for unusual API usage
3. Review calendar API quotas and limits
4. Monitor for failed authentication attempts

---

## Calendar Configuration Options

### Business Hours

Modify in `services/booking-service.js`:

```javascript
// Default: 9 AM - 5 PM
const businessHours = {
  start: 9,  // 9 AM
  end: 17    // 5 PM (hour in 24-hour format)
};
```

### Appointment Duration

```javascript
// Default: 50 minutes
const defaultDuration = 50;
```

### Slot Intervals

```javascript
// Default: 1 hour slots (50 min appointment + 10 min break)
const slotInterval = 60; // minutes
```

---

## Advanced Features

### Multiple Calendars

To use different calendars for different appointment types:

```javascript
// In booking-service.js
const calendarIds = {
  'Mental Health Consultation': process.env.GOOGLE_CALENDAR_MH,
  'Crisis Intervention': process.env.GOOGLE_CALENDAR_CRISIS,
  'Follow-up': process.env.GOOGLE_CALENDAR_FOLLOWUP
};

// Select calendar based on appointment type
const calendarId = calendarIds[appointmentData.appointment_type] || process.env.GOOGLE_CALENDAR_ID;
```

### Custom Event Colors

```javascript
// In createCalendarEvent()
const event = {
  // ... other properties
  colorId: '11' // Red for high-priority
};
```

[Google Calendar Color IDs](https://developers.google.com/calendar/api/v3/reference/colors)

### Recurring Appointments

```javascript
// For weekly recurring appointments
const event = {
  // ... other properties
  recurrence: [
    'RRULE:FREQ=WEEKLY;COUNT=10' // Weekly for 10 weeks
  ]
};
```

---

## Testing

### Manual Testing Checklist

- [ ] Service account key loaded correctly
- [ ] Calendar API enabled in Cloud Console
- [ ] Calendar shared with service account
- [ ] Environment variables set
- [ ] `googleapis` package installed
- [ ] Server shows "Google Cal: ✅ Configured"
- [ ] Test appointment creates successfully
- [ ] Event appears in Google Calendar
- [ ] Event details are correct (time, description, etc.)
- [ ] Cancelling appointment removes event

### Automated Testing

```javascript
// test/booking-service.test.js
const BookingService = require('../services/booking-service');

describe('Google Calendar Integration', () => {
  test('should create calendar event', async () => {
    const appointment = await BookingService.scheduleAppointment({
      patient_name: 'Test Patient',
      date: 'November 15, 2025',
      time: '2:30 PM'
    });

    expect(appointment.calendar_event_id).toBeDefined();
    expect(appointment.calendar_link).toContain('calendar.google.com');
  });
});
```

---

## API Rate Limits

**Google Calendar API Quotas:**
- 1,000,000 queries per day
- 60 queries per minute per user

For high-volume usage, implement rate limiting and caching.

---

## Fallback Behavior

If Google Calendar integration fails, the booking system will:

1. Log the error to console
2. Continue creating appointment in database
3. Return success to caller
4. Set `calendar_event_id` and `calendar_link` to null

**This ensures appointments are never lost due to calendar sync issues.**

---

## Related Documentation

- [Booking System Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md)
- [Retell AI Function Configuration](./RETELL_FUNCTIONS_CONFIG.md)
- [API Endpoint Reference](./API_ENDPOINTS.md)
- [Google Calendar API Documentation](https://developers.google.com/calendar/api/guides/overview)

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

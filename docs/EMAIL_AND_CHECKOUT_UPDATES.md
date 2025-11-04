# Email Confirmation, Reminders, and Checkout Updates

## Overview

This document describes the implementation of:
1. Email confirmation when appointments are booked
2. Email reminders 1 hour before appointments
3. Email verification code system for checkout (replacing phone-based verification)

## Changes Made

### 1. Email Service (`services/email-service.js`)

**New Service:**
- Uses `nodemailer` for SMTP email sending
- Falls back to console logging if SMTP not configured
- Supports appointment confirmations, reminders, and checkout verification codes

**Environment Variables:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@doclittle.health
```

**Installation:**
```bash
npm install nodemailer
```

### 2. Appointment Email Confirmations

**When Sent:**
- Automatically sent when an appointment is scheduled
- Also sent when an appointment is confirmed

**Email Includes:**
- Appointment date, time, and type
- Provider information
- Calendar link (if available)
- Confirmation number
- Instructions for rescheduling/canceling

**Implementation:**
- `BookingService.scheduleAppointment()` now calls `EmailService.sendAppointmentConfirmation()`
- `BookingService.confirmAppointment()` also sends confirmation email

### 3. Appointment Reminders

**Reminder Scheduler (`services/reminder-scheduler.js`):**
- Runs every 5 minutes
- Checks for appointments 1 hour before start time
- Sends email reminder with cancel/reschedule links
- Marks reminder as sent in database

**Reminder Email Includes:**
- Appointment details
- Secure links to reschedule or cancel
- Instructions for finding available slots

**Auto-Start:**
- Reminder scheduler starts automatically when server starts
- Can be manually triggered: `ReminderScheduler.manualCheck()`

### 4. Checkout Email Verification

**New Flow:**
1. User initiates checkout via voice agent
2. System generates 6-digit verification code
3. Code sent to customer's email (not SMS)
4. User enters code on payment page to verify identity
5. After verification, payment page loads

**Changes:**
- `PaymentOrchestrator._handleLinkPayment()` now:
  - Generates 6-digit verification code
  - Sends code via email instead of SMS link
  - Stores code in `payment_tokens` table with expiration (10 minutes)

**Database Schema Update:**
```sql
ALTER TABLE payment_tokens ADD COLUMN verification_code TEXT;
ALTER TABLE payment_tokens ADD COLUMN verification_code_expires DATETIME;
```

**Retell AI Function Update Required:**
Update the `create_checkout` function in Retell AI to:
1. Change `customer_phone` from required to optional
2. Make `customer_email` required
3. Update the description to mention email verification

**New JSON Schema:**
```json
{
  "type": "object",
  "properties": {
    "customer_email": {
      "type": "string",
      "description": "The customer's email address from the call (required)"
    },
    "customer_phone": {
      "type": "string",
      "description": "The customer's phone number from the call (optional)"
    },
    "merchant_id": {
      "type": "string",
      "enum": ["d10794ff-ca11-4e6f-93e9-560162b4f884"]
    },
    "customer_name": {
      "type": "string",
      "description": "The customer's full name for the order"
    },
    "quantity": {
      "type": "number"
    },
    "product_id": {
      "type": "string",
      "description": "The product ID from the search results (example: VIT-D3-5000)"
    }
  },
  "required": [
    "merchant_id",
    "product_id",
    "customer_name",
    "customer_email"
  ]
}
```

### 5. Google Calendar Sync

**Availability Checking:**
- The booking service already integrates with Google Calendar
- `BookingService.getAvailableSlots()` checks Google Calendar events
- Availability is synced automatically when appointments are created/updated

**Environment Variables:**
```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
# OR
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=America/New_York
```

**How It Works:**
- When checking slot availability, system queries Google Calendar
- Existing events block time slots
- Buffer times are respected
- Reschedules update Google Calendar events automatically

## Testing

### Test Script: `tests/test-full-journey.js`

**Usage:**
```bash
node tests/test-full-journey.js
```

**What It Does:**
1. Clears database (appointments, FHIR patients, checkouts)
2. Creates two test patients:
   - Mary April (8262307479, tylert16@ymail.com) - Appointment today at 1 PM
   - Oscar Matthew (7822307478, doctorjay254@gmail.com) - Appointment tomorrow at 9 AM
3. Creates appointments via API
4. Verifies billing aggregation
5. Verifies appointments are created correctly

**Expected Results:**
- Both patients receive confirmation emails
- Billing shows $39.99 per appointment
- Reminders will be sent 1 hour before each appointment
- Calendar events created (if Google Calendar configured)

## Next Steps

### For Production:

1. **Configure SMTP:**
   - Set up SMTP credentials in `.env`
   - Test email sending
   - Configure SPF/DKIM records for deliverability

2. **Update Retell AI Function:**
   - Update `create_checkout` function schema
   - Change required fields
   - Update function description

3. **Add Payment Page Verification:**
   - Update `/payment/:token` endpoint to require code verification
   - Add code input form before showing payment form
   - Verify code matches stored code and hasn't expired

4. **Google Calendar:**
   - Set up service account or OAuth2
   - Configure calendar ID
   - Test availability sync

5. **Reminder Links:**
   - Implement cancel/reschedule endpoints with token verification
   - Add availability checking for reschedule flow

## Files Modified

1. `services/email-service.js` - New
2. `services/reminder-scheduler.js` - New
3. `services/booking-service.js` - Added email confirmation
4. `services/payment-orchestrator.js` - Changed to email verification
5. `database.js` - Updated payment_tokens schema
6. `server.js` - Added reminder scheduler startup
7. `tests/test-full-journey.js` - New test script

## Environment Variables Summary

```env
# Email (Required)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@doclittle.health

# Google Calendar (Optional but recommended)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=America/New_York

# App Secret (Required for appointment cancel/reschedule links)
APPOINTMENT_SECRET=your-secret-key-here
```

## Notes

- Email service falls back to console logging if SMTP not configured
- Reminders are sent in a 10-minute window (55-65 minutes before appointment)
- Verification codes expire after 10 minutes
- Payment page needs to be updated to require code verification (TODO)


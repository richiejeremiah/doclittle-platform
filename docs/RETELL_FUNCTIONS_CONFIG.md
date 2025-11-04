# Retell AI Function Configuration Guide

**DocLittle Mental Health Helpline - Voice Agent Booking Functions**

---

## Overview

This guide shows you how to configure the Retell AI voice agent to use the booking system functions. By the end, your voice agent will be able to schedule, confirm, cancel appointments, check availability, and search for existing bookings through natural conversation.

---

## Prerequisites

- Active Retell AI account
- Retell AI agent created (Agent ID in environment variables)
- Backend server running with booking endpoints
- Public URL or ngrok tunnel to your server

---

## Quick Start

### Step 1: Access Retell AI Dashboard

1. Go to [Retell AI Dashboard](https://beta.retellai.com/)
2. Log in to your account
3. Navigate to **Agents** → Select your DocLittle agent

### Step 2: Configure Server URL

1. In agent settings, find **Custom LLM** or **Function Calling** section
2. Set **Function Server URL** to your backend:
   ```
   https://your-domain.com
   ```
   Or for local development with ngrok:
   ```
   https://abc123.ngrok.io
   ```

### Step 3: Add Booking Functions

In the agent configuration, add the 5 booking functions detailed below.

---

## Function Definitions

### Function 1: Schedule Appointment

**Function Name:** `schedule_appointment`

**Description:**
```
Schedule a new appointment for a patient. This function books an appointment slot and optionally syncs with Google Calendar. Always confirm the date and time with the patient before scheduling.
```

**Parameters:**

```json
{
  "type": "object",
  "properties": {
    "patient_name": {
      "type": "string",
      "description": "Full name of the patient"
    },
    "patient_phone": {
      "type": "string",
      "description": "Patient's phone number in E.164 format (e.g., +1234567890)"
    },
    "patient_email": {
      "type": "string",
      "description": "Patient's email address (optional)"
    },
    "date": {
      "type": "string",
      "description": "Appointment date in natural language (e.g., 'November 15, 2025', 'tomorrow', 'next Monday')"
    },
    "time": {
      "type": "string",
      "description": "Appointment time (e.g., '2:30 PM', '14:30', '2:30pm')"
    },
    "appointment_type": {
      "type": "string",
      "description": "Type of appointment (default: 'Mental Health Consultation')"
    },
    "notes": {
      "type": "string",
      "description": "Any additional notes or special requests"
    }
  },
  "required": ["patient_name", "date", "time"]
}
```

**Endpoint:** `POST /voice/appointments/schedule`

**Expected Response:**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "patient_name": "John Doe",
    "date": "2025-11-15",
    "time": "2:30 PM",
    "status": "scheduled"
  },
  "message": "Appointment scheduled for John Doe on November 15, 2025 at 2:30 PM"
}
```

**Voice Agent Response Template:**
```
"Great! I've scheduled your appointment for {date} at {time}. Your confirmation number is {appointment_id}. You'll receive a reminder 24 hours before your appointment. Is there anything else I can help you with?"
```

---

### Function 2: Confirm Appointment

**Function Name:** `confirm_appointment`

**Description:**
```
Confirm an existing appointment. Use this when a patient calls to confirm their scheduled appointment or when following up on scheduled appointments.
```

**Parameters:**

```json
{
  "type": "object",
  "properties": {
    "appointment_id": {
      "type": "string",
      "description": "The unique appointment ID (format: APT-timestamp-random)"
    }
  },
  "required": ["appointment_id"]
}
```

**Endpoint:** `POST /voice/appointments/confirm`

**Expected Response:**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "patient_name": "John Doe",
    "date": "2025-11-15",
    "time": "2:30 PM",
    "status": "confirmed"
  },
  "message": "Appointment confirmed"
}
```

**Voice Agent Response Template:**
```
"Perfect! Your appointment for {date} at {time} has been confirmed. We look forward to seeing you then."
```

---

### Function 3: Cancel Appointment

**Function Name:** `cancel_appointment`

**Description:**
```
Cancel an existing appointment. Always ask for the reason for cancellation and offer to reschedule if appropriate. This will remove the appointment from the calendar and update the status.
```

**Parameters:**

```json
{
  "type": "object",
  "properties": {
    "appointment_id": {
      "type": "string",
      "description": "The unique appointment ID to cancel"
    },
    "reason": {
      "type": "string",
      "description": "Reason for cancellation (optional but recommended)"
    }
  },
  "required": ["appointment_id"]
}
```

**Endpoint:** `POST /voice/appointments/cancel`

**Expected Response:**
```json
{
  "success": true,
  "message": "Appointment cancelled successfully"
}
```

**Voice Agent Response Template:**
```
"I've cancelled your appointment scheduled for {date} at {time}. Would you like to reschedule for another time?"
```

---

### Function 4: Check Available Slots

**Function Name:** `get_available_slots`

**Description:**
```
Get available appointment time slots for a specific date. Use this to help patients find convenient times for their appointments. Shows available slots between 9 AM and 5 PM with 50-minute sessions.
```

**Parameters:**

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "Date to check availability in natural language (e.g., 'November 15, 2025', 'tomorrow', 'next Tuesday')"
    },
    "provider": {
      "type": "string",
      "description": "Specific provider name (optional, filters results)"
    }
  },
  "required": ["date"]
}
```

**Endpoint:** `POST /voice/appointments/available-slots`

**Expected Response:**
```json
{
  "success": true,
  "date": "2025-11-15",
  "available_slots": [
    { "time": "9:00 AM", "start_time": "2025-11-15T09:00:00.000Z" },
    { "time": "10:00 AM", "start_time": "2025-11-15T10:00:00.000Z" },
    { "time": "2:00 PM", "start_time": "2025-11-15T14:00:00.000Z" }
  ],
  "booked_slots": 5,
  "total_slots": 8
}
```

**Voice Agent Response Template:**
```
"For {date}, we have {available_slots.length} time slots available: {list times}. Which time works best for you?"
```

---

### Function 5: Search Appointments

**Function Name:** `search_appointments`

**Description:**
```
Search for existing appointments by phone number or email. Use this when a patient calls about an existing appointment but doesn't have their confirmation number.
```

**Parameters:**

```json
{
  "type": "object",
  "properties": {
    "search_term": {
      "type": "string",
      "description": "Phone number or email address to search for"
    }
  },
  "required": ["search_term"]
}
```

**Endpoint:** `POST /voice/appointments/search`

**Expected Response:**
```json
{
  "success": true,
  "appointments": [
    {
      "id": "APT-1730000000000-abc123",
      "patient_name": "John Doe",
      "date": "2025-11-15",
      "time": "2:30 PM",
      "status": "scheduled"
    }
  ],
  "count": 1
}
```

**Voice Agent Response Template:**
```
"I found {count} appointment(s) for you: You have an appointment on {date} at {time}. Your confirmation number is {id}. Would you like to confirm, reschedule, or cancel this appointment?"
```

---

## Complete JSON Configuration

Copy this complete configuration for all 5 functions:

```json
{
  "functions": [
    {
      "name": "schedule_appointment",
      "description": "Schedule a new appointment for a patient. This function books an appointment slot and optionally syncs with Google Calendar. Always confirm the date and time with the patient before scheduling.",
      "url": "https://your-domain.com/voice/appointments/schedule",
      "parameters": {
        "type": "object",
        "properties": {
          "patient_name": {
            "type": "string",
            "description": "Full name of the patient"
          },
          "patient_phone": {
            "type": "string",
            "description": "Patient's phone number in E.164 format (e.g., +1234567890)"
          },
          "patient_email": {
            "type": "string",
            "description": "Patient's email address (optional)"
          },
          "date": {
            "type": "string",
            "description": "Appointment date in natural language (e.g., 'November 15, 2025', 'tomorrow', 'next Monday')"
          },
          "time": {
            "type": "string",
            "description": "Appointment time (e.g., '2:30 PM', '14:30', '2:30pm')"
          },
          "appointment_type": {
            "type": "string",
            "description": "Type of appointment (default: 'Mental Health Consultation')"
          },
          "notes": {
            "type": "string",
            "description": "Any additional notes or special requests"
          }
        },
        "required": ["patient_name", "date", "time"]
      }
    },
    {
      "name": "confirm_appointment",
      "description": "Confirm an existing appointment. Use this when a patient calls to confirm their scheduled appointment or when following up on scheduled appointments.",
      "url": "https://your-domain.com/voice/appointments/confirm",
      "parameters": {
        "type": "object",
        "properties": {
          "appointment_id": {
            "type": "string",
            "description": "The unique appointment ID (format: APT-timestamp-random)"
          }
        },
        "required": ["appointment_id"]
      }
    },
    {
      "name": "cancel_appointment",
      "description": "Cancel an existing appointment. Always ask for the reason for cancellation and offer to reschedule if appropriate. This will remove the appointment from the calendar and update the status.",
      "url": "https://your-domain.com/voice/appointments/cancel",
      "parameters": {
        "type": "object",
        "properties": {
          "appointment_id": {
            "type": "string",
            "description": "The unique appointment ID to cancel"
          },
          "reason": {
            "type": "string",
            "description": "Reason for cancellation (optional but recommended)"
          }
        },
        "required": ["appointment_id"]
      }
    },
    {
      "name": "get_available_slots",
      "description": "Get available appointment time slots for a specific date. Use this to help patients find convenient times for their appointments. Shows available slots between 9 AM and 5 PM with 50-minute sessions.",
      "url": "https://your-domain.com/voice/appointments/available-slots",
      "parameters": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "Date to check availability in natural language (e.g., 'November 15, 2025', 'tomorrow', 'next Tuesday')"
          },
          "provider": {
            "type": "string",
            "description": "Specific provider name (optional, filters results)"
          }
        },
        "required": ["date"]
      }
    },
    {
      "name": "search_appointments",
      "description": "Search for existing appointments by phone number or email. Use this when a patient calls about an existing appointment but doesn't have their confirmation number.",
      "url": "https://your-domain.com/voice/appointments/search",
      "parameters": {
        "type": "object",
        "properties": {
          "search_term": {
            "type": "string",
            "description": "Phone number or email address to search for"
          }
        },
        "required": ["search_term"]
      }
    }
  ]
}
```

---

## Agent Prompt Configuration

Update your Retell AI agent's system prompt to include booking capabilities:

```
You are a compassionate mental health helpline assistant for DocLittle. Your role is to:

1. Provide empathetic support to callers in distress
2. Schedule, confirm, and manage appointments for mental health consultations
3. Answer questions about services and availability
4. Connect callers with appropriate resources

APPOINTMENT BOOKING GUIDELINES:

When scheduling appointments:
- Always check available slots before suggesting times
- Confirm the date, time, and patient name before finalizing
- Collect phone number for confirmation and reminders
- Ask if they have any special needs or requests
- Provide the confirmation number clearly

When a caller wants to check availability:
- Use get_available_slots to show open times
- Offer multiple options if possible
- Be flexible with times to accommodate their schedule

When confirming appointments:
- Search by phone/email if they don't have confirmation number
- Repeat the appointment details clearly
- Ask if they need directions or have questions

When cancelling:
- Always ask for the reason (helps us improve)
- Offer to reschedule if appropriate
- Express understanding and support

TONE AND MANNER:
- Be warm, empathetic, and professional
- Use simple, clear language
- Listen actively to the caller's needs
- Remain calm and supportive, especially in crisis situations
- Respect privacy and confidentiality

AVAILABLE FUNCTIONS:
- schedule_appointment: Book a new appointment
- confirm_appointment: Confirm an existing appointment
- cancel_appointment: Cancel an appointment
- get_available_slots: Check what times are available
- search_appointments: Find appointments by phone or email

Remember: Your primary goal is to support the caller's mental health needs while efficiently managing their appointment requests.
```

---

## Testing Your Configuration

### Step 1: Test with curl

Before testing with voice, verify endpoints work:

```bash
# Test scheduling
curl -X POST https://your-domain.com/voice/appointments/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "patient_name": "Test Patient",
      "patient_phone": "+1234567890",
      "date": "November 15, 2025",
      "time": "2:30 PM"
    }
  }'

# Test availability
curl -X POST https://your-domain.com/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'
```

### Step 2: Test with Retell AI Test Console

1. In Retell dashboard, go to your agent
2. Click **Test Agent** or **Try it out**
3. Try these test conversations:

**Test Scenario 1: Schedule New Appointment**
```
You: "Hi, I'd like to schedule an appointment"
Agent: "Of course! I'd be happy to help you schedule an appointment. What date works best for you?"
You: "How about November 15th?"
Agent: [Calls get_available_slots] "For November 15th, we have slots available at 9:00 AM, 10:00 AM, 2:00 PM, and 3:00 PM. Which time works for you?"
You: "2:00 PM sounds good"
Agent: "Perfect! And may I have your full name please?"
You: "John Doe"
Agent: "Great, and what's the best phone number to reach you?"
You: "+1234567890"
Agent: [Calls schedule_appointment] "Excellent! I've scheduled your appointment for November 15, 2025 at 2:00 PM. Your confirmation number is APT-1730000000000-abc123. Is there anything else I can help you with?"
```

**Test Scenario 2: Check Existing Appointment**
```
You: "I want to check my appointment"
Agent: "I can help you with that. Do you have your confirmation number, or shall I look it up by your phone number or email?"
You: "Look it up by my phone: +1234567890"
Agent: [Calls search_appointments] "I found your appointment. You're scheduled for November 15, 2025 at 2:00 PM. Your confirmation number is APT-1730000000000-abc123. Would you like to confirm, reschedule, or cancel?"
You: "I'll confirm it"
Agent: [Calls confirm_appointment] "Perfect! Your appointment for November 15, 2025 at 2:00 PM has been confirmed. We look forward to seeing you then."
```

**Test Scenario 3: Cancel and Reschedule**
```
You: "I need to cancel my appointment"
Agent: "I understand. Let me look up your appointment. What's your phone number?"
You: "+1234567890"
Agent: [Calls search_appointments] "I see you have an appointment on November 15, 2025 at 2:00 PM. May I ask what the reason for cancellation is?"
You: "Something came up, I need a different time"
Agent: "I completely understand. Let me cancel that for you and we can find a better time. [Calls cancel_appointment] Your appointment has been cancelled. What date would work better for you?"
```

---

## Conversation Flow Examples

### Example 1: Urgent Appointment

```
Caller: "I'm having a really hard time and need to talk to someone soon"

Agent: "I'm so sorry you're going through this. I'm here to help. Let me check our availability for the next few days. When would be best for you - as soon as possible today, or would tomorrow work?"

Caller: "Today if possible"

Agent: [Calls get_available_slots with today's date]
"I have these times available today: 3:00 PM and 4:00 PM. Which works better for you?"

Caller: "3:00 PM"

Agent: "Perfect. May I have your name?"

Caller: "Sarah Johnson"

Agent: "Thank you, Sarah. And the best phone number to reach you?"

Caller: "+1555123456"

Agent: [Calls schedule_appointment]
"Sarah, I've scheduled you for today at 3:00 PM. Your confirmation number is APT-[ID]. You'll receive a reminder shortly. Is there anything specific you'd like the counselor to know beforehand?"

Caller: "No, that's okay"

Agent: "Alright. Remember, if you're in immediate crisis, you can also reach the crisis line at [number]. We're here for you, and we'll see you at 3:00 PM today. Take care."
```

### Example 2: General Inquiry to Booking

```
Caller: "What kind of services do you offer?"

Agent: "DocLittle provides compassionate mental health support including individual counseling, crisis intervention, and ongoing therapy for depression, anxiety, stress management, and more. We have licensed counselors available for 50-minute sessions. Would you like to schedule a consultation?"

Caller: "Yes, I think so. What's your availability like?"

Agent: "I'd be happy to check availability for you. What day were you thinking?"

Caller: "Maybe next Monday?"

Agent: [Calls get_available_slots]
"For Monday, November 18th, I have several times open: 9:00 AM, 10:00 AM, 2:00 PM, 3:00 PM, and 4:00 PM. Do any of those work for you?"

Caller: "2:00 PM would be perfect"

Agent: "Excellent choice. May I have your name?"
...
```

---

## Error Handling

### When Functions Fail

Train the agent to handle errors gracefully:

**No Available Slots:**
```
"I'm sorry, it looks like we're fully booked on that day. Let me check the next available date... [check next day]. We have availability on [date]. Would that work for you?"
```

**Appointment Not Found:**
```
"I'm having trouble finding an appointment with that information. Let me try another way - can you provide your email address or try a different phone number format?"
```

**System Error:**
```
"I apologize, I'm having a technical issue accessing the scheduling system. Let me take your information down and have our team call you back within the hour to complete your booking. What's the best number to reach you?"
```

---

## Webhook Configuration (Optional)

For appointment reminders and follow-ups, configure webhooks:

### End of Call Webhook

Configure in Retell dashboard:
```
Webhook URL: https://your-domain.com/webhook/retell/end-of-call
```

This allows you to:
- Log completed calls
- Track appointment conversion rates
- Send confirmation emails/SMS
- Trigger reminder systems

---

## Analytics and Monitoring

### Key Metrics to Track

1. **Appointment Conversion Rate**
   - Calls that result in scheduled appointments
   - Target: >60%

2. **No-Show Rate**
   - Scheduled appointments where patient doesn't show
   - Target: <20%

3. **Cancellation Rate**
   - Appointments cancelled vs completed
   - Track reasons for improvement

4. **Average Booking Time**
   - How long it takes from call start to scheduled appointment
   - Target: <3 minutes

5. **Function Success Rate**
   - % of function calls that succeed
   - Target: >95%

---

## Best Practices

### Do's

✅ **Always confirm details** before finalizing bookings
✅ **Offer multiple time options** to accommodate schedules
✅ **Collect phone numbers** for reminders and follow-up
✅ **Handle errors gracefully** with fallback options
✅ **Show empathy** especially for distressed callers
✅ **Provide confirmation numbers** clearly and slowly
✅ **Ask about special needs** or accessibility requirements

### Don'ts

❌ **Don't rush** through the booking process
❌ **Don't schedule** without checking availability first
❌ **Don't cancel** without asking for reason
❌ **Don't book** double appointments in same slot
❌ **Don't assume** caller has confirmation number
❌ **Don't use medical jargon** - keep language simple

---

## Troubleshooting

### Functions Not Being Called

**Problem:** Agent isn't using the booking functions

**Solutions:**
1. Check function descriptions are clear and specific
2. Update agent prompt to explicitly mention when to use functions
3. Verify function URL is accessible (test with curl)
4. Check Retell dashboard logs for errors

### Wrong Parameters Being Sent

**Problem:** Function receives incorrect or missing parameters

**Solutions:**
1. Review parameter descriptions - make them very specific
2. Add examples in descriptions
3. Use enums for fixed values
4. Mark truly required fields as required

### Agent Gives Wrong Information

**Problem:** Agent makes up availability or confirmation numbers

**Solutions:**
1. Add to prompt: "NEVER make up confirmation numbers or availability - always use the functions"
2. Use stricter temperature settings
3. Test with edge cases
4. Add explicit examples of correct behavior

---

## Advanced Configuration

### Custom Appointment Types

Add to agent prompt:
```
APPOINTMENT TYPES:
- Mental Health Consultation (50 min) - General therapy session
- Crisis Intervention (30 min) - Immediate support needed
- Follow-up Session (30 min) - Continuing care
- Initial Assessment (60 min) - First-time patients

Always ask what type of appointment they need and schedule accordingly.
```

### Priority Scheduling

For urgent cases:
```
If caller indicates crisis or urgent need:
1. Prioritize same-day or next-day slots
2. Check for any cancellations
3. Mention crisis hotline as immediate option
4. Expedite the booking process
```

### Multi-Language Support

Configure language detection:
```
If caller speaks Spanish:
- Switch to Spanish responses
- Ensure appointment notes include language preference
- Schedule with bilingual provider if available
```

---

## Security Considerations

### PII Protection

- Phone numbers and emails are sensitive data
- Ensure HIPAA compliance for health information
- Log minimal data, anonymize where possible
- Use secure HTTPS endpoints only

### Authentication

Consider adding authentication to voice endpoints:
```javascript
// In server.js
const RETELL_API_KEY = process.env.RETELL_API_KEY;

app.post('/voice/appointments/*', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${RETELL_API_KEY}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});
```

---

## Related Documentation

- [Booking System Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md)
- [Google Calendar Setup Guide](./GOOGLE_CALENDAR_SETUP.md)
- [API Endpoint Reference](./API_ENDPOINTS.md)
- [Retell AI Documentation](https://docs.retellai.com/)

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

# Booking System Architecture

**DocLittle Mental Health Helpline - Appointment Management System**

---

## Overview

The booking system enables the DocLittle voice agent to manage patient appointments through natural conversation. The system integrates with Google Calendar for scheduling and maintains a comprehensive appointment database for tracking and management.

### Key Features

- **Voice-Driven Scheduling**: Schedule appointments through natural conversation with the Retell AI voice agent
- **Appointment Management**: Confirm, cancel, and search for appointments
- **Availability Checking**: Real-time slot availability based on existing bookings
- **Google Calendar Integration**: Optional sync with Google Calendar for cross-platform visibility
- **Dashboard Management**: Admin interface for viewing and managing all appointments

---

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Voice Agent (Retell AI)                 │
│  - Handles patient calls                                    │
│  - Extracts appointment details from conversation           │
│  - Calls backend functions                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ POST /voice/appointments/*
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express.js Server                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Voice Agent Endpoints                             │    │
│  │  - POST /voice/appointments/schedule               │    │
│  │  - POST /voice/appointments/confirm                │    │
│  │  - POST /voice/appointments/cancel                 │    │
│  │  - POST /voice/appointments/available-slots        │    │
│  │  - POST /voice/appointments/search                 │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     │                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Dashboard API Endpoints                           │    │
│  │  - GET /api/admin/appointments                     │    │
│  │  - GET /api/admin/appointments/upcoming            │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     │                                        │
│                     ▼                                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │          BookingService                            │    │
│  │  - scheduleAppointment()                           │    │
│  │  - confirmAppointment()                            │    │
│  │  - cancelAppointment()                             │    │
│  │  - getAvailableSlots()                             │    │
│  │  - searchAppointments()                            │    │
│  └──────────────┬─────────────────┬───────────────────┘    │
│                 │                 │                          │
└─────────────────┼─────────────────┼──────────────────────────┘
                  │                 │
                  ▼                 ▼
    ┌────────────────────┐  ┌─────────────────────┐
    │  SQLite Database   │  │  Google Calendar    │
    │  (appointments)    │  │  (Optional Sync)    │
    └────────────────────┘  └─────────────────────┘
```

---

## Database Schema

### Appointments Table

```sql
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,                    -- UUID format (e.g., "APT-1730000000000-abc123")
  patient_name TEXT NOT NULL,             -- Full name of patient
  patient_phone TEXT,                     -- Phone number
  patient_email TEXT,                     -- Email address
  patient_id TEXT,                        -- Links to FHIR patient resource
  appointment_type TEXT DEFAULT 'Mental Health Consultation',
  date TEXT NOT NULL,                     -- ISO date (e.g., "2025-11-15")
  time TEXT NOT NULL,                     -- Time string (e.g., "2:30 PM")
  start_time DATETIME NOT NULL,           -- ISO datetime for queries
  end_time DATETIME NOT NULL,             -- ISO datetime (start + duration)
  duration_minutes INTEGER DEFAULT 50,    -- Session length
  provider TEXT DEFAULT 'DocLittle Mental Health Team',
  status TEXT DEFAULT 'scheduled',        -- scheduled|confirmed|cancelled|completed
  notes TEXT,                             -- Additional information
  reminder_sent BOOLEAN DEFAULT 0,        -- Reminder notification status
  calendar_event_id TEXT,                 -- Google Calendar event ID
  calendar_link TEXT,                     -- Direct link to calendar event
  cancellation_reason TEXT,               -- Why appointment was cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
);
```

### Indexes

```sql
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_phone ON appointments(patient_phone);
CREATE INDEX idx_appointments_email ON appointments(patient_email);
CREATE INDEX idx_appointments_status ON appointments(status);
```

---

## Service Layer: BookingService

Located in: `middleware-platform/services/booking-service.js`

### Class Methods

#### 1. `getCalendarClient()`

Returns authenticated Google Calendar API client.

**Authentication Methods:**
- **Service Account** (recommended for production)
- **OAuth2** (for user-based access)

**Environment Variables:**
- `GOOGLE_SERVICE_ACCOUNT_KEY` - JSON credentials for service account
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` - OAuth2 credentials
- `GOOGLE_CALENDAR_ID` - Target calendar (defaults to 'primary')

#### 2. `scheduleAppointment(appointmentData)`

Creates a new appointment.

**Parameters:**
```javascript
{
  patient_name: string,      // Required
  patient_phone: string,     // Optional but recommended
  patient_email: string,     // Optional
  patient_id: string,        // Optional FHIR patient ID
  date: string,              // Required (ISO date or parseable)
  time: string,              // Required (e.g., "2:30 PM")
  duration_minutes: number,  // Optional (default: 50)
  appointment_type: string,  // Optional
  provider: string,          // Optional
  notes: string             // Optional
}
```

**Returns:**
```javascript
{
  success: true,
  appointment: {
    id: "APT-1730000000000-abc123",
    patient_name: "John Doe",
    date: "2025-11-15",
    time: "2:30 PM",
    start_time: "2025-11-15T14:30:00.000Z",
    end_time: "2025-11-15T15:20:00.000Z",
    status: "scheduled",
    calendar_link: "https://calendar.google.com/...",
    ...
  },
  message: "Appointment scheduled successfully"
}
```

**Workflow:**
1. Validates required fields
2. Parses date/time into ISO datetime
3. Generates unique appointment ID
4. Creates Google Calendar event (if configured)
5. Saves to database
6. Returns confirmation with all details

#### 3. `confirmAppointment(appointmentId)`

Updates appointment status to 'confirmed'.

**Parameters:**
```javascript
{
  appointmentId: string  // Required
}
```

#### 4. `cancelAppointment(appointmentId, reason)`

Cancels an appointment and removes from Google Calendar.

**Parameters:**
```javascript
{
  appointmentId: string,  // Required
  reason: string         // Optional cancellation reason
}
```

**Workflow:**
1. Retrieves appointment from database
2. Deletes event from Google Calendar (if calendar_event_id exists)
3. Updates status to 'cancelled' in database
4. Stores cancellation reason

#### 5. `getAvailableSlots(date, provider)`

Returns available appointment slots for a given date.

**Business Hours:** 9:00 AM - 5:00 PM
**Slot Duration:** 50 minutes
**Break Between Slots:** 10 minutes

**Parameters:**
```javascript
{
  date: string,      // Required (ISO date)
  provider: string   // Optional (filter by provider)
}
```

**Returns:**
```javascript
{
  success: true,
  date: "2025-11-15",
  available_slots: [
    { time: "9:00 AM", start_time: "2025-11-15T09:00:00.000Z" },
    { time: "10:00 AM", start_time: "2025-11-15T10:00:00.000Z" },
    { time: "11:00 AM", start_time: "2025-11-15T11:00:00.000Z" },
    ...
  ],
  booked_slots: 3,
  total_slots: 8
}
```

#### 6. `searchAppointments(searchTerm)`

Searches appointments by phone number or email.

**Parameters:**
```javascript
{
  searchTerm: string  // Phone or email
}
```

---

## API Endpoints

### Voice Agent Endpoints

All voice agent endpoints expect Retell AI function call format:

```javascript
{
  args: {
    // function-specific parameters
  }
}
```

#### POST /voice/appointments/schedule

Schedule a new appointment via voice agent.

**Request Body:**
```javascript
{
  args: {
    patient_name: "John Doe",
    patient_phone: "+1234567890",
    patient_email: "john@example.com",
    date: "November 15, 2025",
    time: "2:30 PM",
    notes: "Follow-up consultation"
  }
}
```

**Response:**
```javascript
{
  success: true,
  appointment: { ... },
  message: "Appointment scheduled for John Doe on November 15, 2025 at 2:30 PM"
}
```

#### POST /voice/appointments/confirm

Confirm an existing appointment.

**Request Body:**
```javascript
{
  args: {
    appointment_id: "APT-1730000000000-abc123"
  }
}
```

#### POST /voice/appointments/cancel

Cancel an appointment.

**Request Body:**
```javascript
{
  args: {
    appointment_id: "APT-1730000000000-abc123",
    reason: "Patient requested reschedule"
  }
}
```

#### POST /voice/appointments/available-slots

Get available time slots for a date.

**Request Body:**
```javascript
{
  args: {
    date: "November 15, 2025",
    provider: "Dr. Smith"  // Optional
  }
}
```

**Response:**
```javascript
{
  success: true,
  date: "2025-11-15",
  available_slots: [
    { time: "9:00 AM", start_time: "2025-11-15T09:00:00.000Z" },
    { time: "10:00 AM", start_time: "2025-11-15T10:00:00.000Z" }
  ],
  booked_slots: 3,
  total_slots: 8
}
```

#### POST /voice/appointments/search

Search for appointments by phone or email.

**Request Body:**
```javascript
{
  args: {
    search_term: "+1234567890"
  }
}
```

### Dashboard API Endpoints

#### GET /api/admin/appointments

Get all appointments with optional filters.

**Query Parameters:**
- `status` - Filter by status (scheduled, confirmed, cancelled, completed)
- `date` - Filter by specific date
- `patient_id` - Filter by patient

**Response:**
```javascript
{
  success: true,
  appointments: [ ... ],
  count: 15
}
```

#### GET /api/admin/appointments/upcoming

Get upcoming appointments (next 10 by default).

**Response:**
```javascript
{
  success: true,
  appointments: [ ... ],
  count: 10
}
```

---

## Error Handling

All endpoints return consistent error format:

```javascript
{
  success: false,
  error: "Error message describing what went wrong"
}
```

**Common Error Scenarios:**
- Missing required fields (patient_name, date, time)
- Invalid date/time format
- Appointment not found
- Google Calendar API errors (logged, but doesn't fail request)
- Database errors

---

## Integration Points

### FHIR Integration

The booking system integrates with FHIR R4 patient data:
- `patient_id` field links to `fhir_patients.resource_id`
- Allows appointment tracking per patient record
- Enables FHIR Appointment resource creation (future enhancement)

### Google Calendar Integration

**Optional but Recommended**

Benefits:
- Cross-platform visibility (web, mobile, desktop)
- Automatic notifications and reminders
- Shared calendars for team coordination
- Standard iCal format compatibility

See [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md) for configuration guide.

### Retell AI Voice Agent

The voice agent uses function calling to interact with the booking system.

See [RETELL_FUNCTIONS_CONFIG.md](./RETELL_FUNCTIONS_CONFIG.md) for setup guide.

---

## Business Logic

### Appointment Slot Generation

**Business Hours:** 9:00 AM - 5:00 PM (configurable)
**Slot Duration:** 50 minutes
**Break Between Slots:** 10 minutes

**Example Schedule:**
```
9:00 AM - 9:50 AM   (50 min session)
10:00 AM - 10:50 AM (50 min session)
11:00 AM - 11:50 AM (50 min session)
12:00 PM - 12:50 PM (50 min session)
1:00 PM - 1:50 PM   (50 min session)
2:00 PM - 2:50 PM   (50 min session)
3:00 PM - 3:50 PM   (50 min session)
4:00 PM - 4:50 PM   (50 min session)
```

Total: 8 slots per day

### Appointment Status Workflow

```
scheduled → confirmed → completed
    ↓
cancelled
```

- **scheduled**: Initial status when appointment is created
- **confirmed**: Patient/staff has confirmed attendance
- **cancelled**: Appointment was cancelled (reason stored)
- **completed**: Session occurred (set manually or automatically after end_time)

---

## Future Enhancements

1. **Automated Reminders**: SMS/Email reminders 24 hours before appointment
2. **Rescheduling**: Allow patients to reschedule via voice or dashboard
3. **Provider Management**: Multiple providers with individual schedules
4. **Waitlist**: Queue for cancelled slots
5. **Recurring Appointments**: Weekly/monthly recurring sessions
6. **FHIR Appointment Resources**: Full FHIR R4 Appointment resource support
7. **Telehealth Integration**: Video call links for virtual appointments
8. **No-Show Tracking**: Flag patients who miss appointments
9. **Custom Business Hours**: Per-provider and per-day schedules
10. **Timezone Support**: Multi-timezone scheduling

---

## Testing

### Manual Testing with curl

```bash
# Schedule appointment
curl -X POST http://localhost:3001/voice/appointments/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "patient_name": "Jane Doe",
      "patient_phone": "+1234567890",
      "date": "November 15, 2025",
      "time": "2:30 PM"
    }
  }'

# Check available slots
curl -X POST http://localhost:3001/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'

# Search appointments
curl -X POST http://localhost:3001/voice/appointments/search \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "search_term": "+1234567890"
    }
  }'
```

---

## Troubleshooting

### Google Calendar Events Not Creating

1. Check environment variables are set correctly
2. Verify service account has calendar access
3. Check server logs for Google API errors
4. Ensure `googleapis` npm package is installed

**Note:** Appointments will still be created in database even if Google Calendar sync fails.

### Appointment Not Found

- Verify appointment ID format (APT-timestamp-random)
- Check appointment wasn't already cancelled
- Confirm appointment exists in database

### Available Slots Showing Zero

- Check date format is valid
- Verify business hours configuration
- Ensure database contains appointment records

---

## Related Documentation

- [Google Calendar Setup Guide](./GOOGLE_CALENDAR_SETUP.md)
- [Retell AI Function Configuration](./RETELL_FUNCTIONS_CONFIG.md)
- [API Endpoint Reference](./API_ENDPOINTS.md)
- [FHIR Integration Architecture](./FHIR_INTEGRATION_ARCHITECTURE.md)

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

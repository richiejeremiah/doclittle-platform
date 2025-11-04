# API Endpoints Reference

**DocLittle Mental Health Helpline - Complete API Documentation**

---

## Overview

This document provides detailed reference for all API endpoints in the DocLittle platform, including voice agent endpoints, dashboard APIs, and booking system endpoints.

**Base URL:** `http://localhost:3001` (development) or `https://your-domain.com` (production)

---

## Table of Contents

- [Voice Agent Endpoints](#voice-agent-endpoints)
- [Appointment Booking Endpoints](#appointment-booking-endpoints)
- [Dashboard API Endpoints](#dashboard-api-endpoints)
- [Authentication Endpoints](#authentication-endpoints)
- [Webhook Endpoints](#webhook-endpoints)
- [Health Check](#health-check)
- [Error Response Format](#error-response-format)

---

## Voice Agent Endpoints

All voice agent endpoints expect Retell AI function call format with parameters in `args` object.

### POST /voice/incoming

Handle incoming voice calls with SIP integration.

**Request Body:**
```json
{
  "call_id": "abc123",
  "from_number": "+1234567890",
  "to_number": "+1987654321"
}
```

**Response:**
```json
{
  "success": true,
  "agent_id": "your-retell-agent-id",
  "sip_endpoint": "sip:abc123@5t4n6j0wnrl.sip.livekit.cloud"
}
```

---

### POST /voice/products/search

Search for products/services via voice agent.

**Request Body:**
```json
{
  "args": {
    "query": "anxiety therapy",
    "category": "mental-health"
  }
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": "prod_123",
      "name": "Anxiety Therapy Session",
      "description": "50-minute individual therapy session",
      "price": 150.00,
      "category": "mental-health"
    }
  ]
}
```

---

### POST /voice/checkout/create

Create checkout session for voice commerce.

**Request Body:**
```json
{
  "args": {
    "product_id": "prod_123",
    "quantity": 1,
    "customer_phone": "+1234567890",
    "customer_email": "john@example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "checkout_id": "checkout_abc123",
  "payment_link": "https://your-domain.com/payment/token123",
  "amount": 150.00
}
```

---

## Appointment Booking Endpoints

### POST /voice/appointments/schedule

Schedule a new appointment via voice agent.

**Authentication:** None (public endpoint for voice agent)

**Request Body:**
```json
{
  "args": {
    "patient_name": "John Doe",
    "patient_phone": "+1234567890",
    "patient_email": "john@example.com",
    "date": "November 15, 2025",
    "time": "2:30 PM",
    "appointment_type": "Mental Health Consultation",
    "duration_minutes": 50,
    "provider": "DocLittle Mental Health Team",
    "notes": "First-time patient, anxiety concerns"
  }
}
```

**Required Fields:**
- `patient_name` (string)
- `date` (string - natural language or ISO date)
- `time` (string - any common time format)

**Optional Fields:**
- `patient_phone` (string)
- `patient_email` (string)
- `patient_id` (string - FHIR patient resource ID)
- `appointment_type` (string - default: "Mental Health Consultation")
- `duration_minutes` (number - default: 50)
- `provider` (string - default: "DocLittle Mental Health Team")
- `notes` (string)

**Success Response (200):**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "patient_name": "John Doe",
    "patient_phone": "+1234567890",
    "patient_email": "john@example.com",
    "patient_id": null,
    "appointment_type": "Mental Health Consultation",
    "date": "2025-11-15",
    "time": "2:30 PM",
    "start_time": "2025-11-15T14:30:00.000Z",
    "end_time": "2025-11-15T15:20:00.000Z",
    "duration_minutes": 50,
    "provider": "DocLittle Mental Health Team",
    "status": "scheduled",
    "notes": "First-time patient, anxiety concerns",
    "reminder_sent": false,
    "calendar_event_id": "evt_google123",
    "calendar_link": "https://calendar.google.com/event?eid=...",
    "cancellation_reason": null,
    "created_at": "2025-11-01T12:00:00.000Z",
    "updated_at": "2025-11-01T12:00:00.000Z"
  },
  "message": "Appointment scheduled for John Doe on November 15, 2025 at 2:30 PM"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Missing required fields: patient_name, date, time"
}
```

**Example curl:**
```bash
curl -X POST http://localhost:3001/voice/appointments/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "patient_name": "John Doe",
      "patient_phone": "+1234567890",
      "date": "November 15, 2025",
      "time": "2:30 PM"
    }
  }'
```

---

### POST /voice/appointments/confirm

Confirm an existing appointment.

**Request Body:**
```json
{
  "args": {
    "appointment_id": "APT-1730000000000-abc123"
  }
}
```

**Required Fields:**
- `appointment_id` (string)

**Success Response (200):**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "patient_name": "John Doe",
    "date": "2025-11-15",
    "time": "2:30 PM",
    "status": "confirmed",
    "updated_at": "2025-11-01T12:05:00.000Z"
  },
  "message": "Appointment confirmed successfully"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Appointment not found"
}
```

**Example curl:**
```bash
curl -X POST http://localhost:3001/voice/appointments/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "appointment_id": "APT-1730000000000-abc123"
    }
  }'
```

---

### POST /voice/appointments/cancel

Cancel an existing appointment.

**Request Body:**
```json
{
  "args": {
    "appointment_id": "APT-1730000000000-abc123",
    "reason": "Patient requested reschedule"
  }
}
```

**Required Fields:**
- `appointment_id` (string)

**Optional Fields:**
- `reason` (string - cancellation reason)

**Success Response (200):**
```json
{
  "success": true,
  "appointment": {
    "id": "APT-1730000000000-abc123",
    "status": "cancelled",
    "cancellation_reason": "Patient requested reschedule",
    "updated_at": "2025-11-01T12:10:00.000Z"
  },
  "message": "Appointment cancelled successfully"
}
```

**Side Effects:**
- Removes event from Google Calendar (if calendar_event_id exists)
- Updates appointment status to 'cancelled' in database
- Stores cancellation reason

**Example curl:**
```bash
curl -X POST http://localhost:3001/voice/appointments/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "appointment_id": "APT-1730000000000-abc123",
      "reason": "Patient requested reschedule"
    }
  }'
```

---

### POST /voice/appointments/available-slots

Get available appointment time slots for a specific date.

**Request Body:**
```json
{
  "args": {
    "date": "November 15, 2025",
    "provider": "Dr. Smith"
  }
}
```

**Required Fields:**
- `date` (string - natural language or ISO date)

**Optional Fields:**
- `provider` (string - filter by provider name)

**Success Response (200):**
```json
{
  "success": true,
  "date": "2025-11-15",
  "available_slots": [
    {
      "time": "9:00 AM",
      "start_time": "2025-11-15T09:00:00.000Z"
    },
    {
      "time": "10:00 AM",
      "start_time": "2025-11-15T10:00:00.000Z"
    },
    {
      "time": "11:00 AM",
      "start_time": "2025-11-15T11:00:00.000Z"
    },
    {
      "time": "2:00 PM",
      "start_time": "2025-11-15T14:00:00.000Z"
    },
    {
      "time": "3:00 PM",
      "start_time": "2025-11-15T15:00:00.000Z"
    }
  ],
  "booked_slots": 3,
  "total_slots": 8
}
```

**Business Hours:** 9:00 AM - 5:00 PM
**Slot Duration:** 50 minutes
**Break Between Slots:** 10 minutes

**Example curl:**
```bash
curl -X POST http://localhost:3001/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'
```

---

### POST /voice/appointments/search

Search for appointments by phone number or email.

**Request Body:**
```json
{
  "args": {
    "search_term": "+1234567890"
  }
}
```

**Required Fields:**
- `search_term` (string - phone number or email)

**Success Response (200):**
```json
{
  "success": true,
  "appointments": [
    {
      "id": "APT-1730000000000-abc123",
      "patient_name": "John Doe",
      "patient_phone": "+1234567890",
      "date": "2025-11-15",
      "time": "2:30 PM",
      "status": "scheduled",
      "appointment_type": "Mental Health Consultation",
      "provider": "DocLittle Mental Health Team"
    },
    {
      "id": "APT-1730500000000-def456",
      "patient_name": "John Doe",
      "patient_phone": "+1234567890",
      "date": "2025-11-22",
      "time": "3:00 PM",
      "status": "confirmed",
      "appointment_type": "Follow-up Session",
      "provider": "DocLittle Mental Health Team"
    }
  ],
  "count": 2
}
```

**Empty Result (200):**
```json
{
  "success": true,
  "appointments": [],
  "count": 0
}
```

**Example curl:**
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

## Dashboard API Endpoints

### GET /api/admin/appointments

Get all appointments with optional filters.

**Authentication:** Required (admin session)

**Query Parameters:**
- `status` (string) - Filter by status: scheduled|confirmed|cancelled|completed
- `date` (string) - Filter by specific date (ISO format: YYYY-MM-DD)
- `patient_id` (string) - Filter by FHIR patient resource ID

**Example Requests:**
```bash
# Get all appointments
GET /api/admin/appointments

# Get only scheduled appointments
GET /api/admin/appointments?status=scheduled

# Get appointments for specific date
GET /api/admin/appointments?date=2025-11-15

# Get appointments for specific patient
GET /api/admin/appointments?patient_id=patient-123
```

**Success Response (200):**
```json
{
  "success": true,
  "appointments": [
    {
      "id": "APT-1730000000000-abc123",
      "patient_name": "John Doe",
      "patient_phone": "+1234567890",
      "patient_email": "john@example.com",
      "date": "2025-11-15",
      "time": "2:30 PM",
      "status": "scheduled",
      "appointment_type": "Mental Health Consultation",
      "provider": "DocLittle Mental Health Team",
      "duration_minutes": 50,
      "created_at": "2025-11-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Example curl:**
```bash
curl -X GET "http://localhost:3001/api/admin/appointments?status=scheduled" \
  -H "Cookie: session=your-session-cookie"
```

---

### GET /api/admin/appointments/upcoming

Get upcoming appointments (next 10 by default).

**Authentication:** Required (admin session)

**Query Parameters:**
- `limit` (number) - Number of appointments to return (default: 10)

**Success Response (200):**
```json
{
  "success": true,
  "appointments": [
    {
      "id": "APT-1730000000000-abc123",
      "patient_name": "John Doe",
      "date": "2025-11-15",
      "time": "2:30 PM",
      "status": "confirmed",
      "start_time": "2025-11-15T14:30:00.000Z"
    }
  ],
  "count": 1
}
```

**Example curl:**
```bash
curl -X GET "http://localhost:3001/api/admin/appointments/upcoming?limit=5" \
  -H "Cookie: session=your-session-cookie"
```

---

### GET /api/admin/stats

Get dashboard statistics including calls, revenue, and priority cases.

**Authentication:** Required (admin session)

**Success Response (200):**
```json
{
  "success": true,
  "stats": {
    "today": {
      "revenue": 1250.50,
      "orders": 15,
      "calls": 42,
      "conversionRate": "35.7",
      "revenueChange": "+12.3"
    },
    "total": {
      "revenue": 45320.00,
      "orders": 523,
      "calls": 1847,
      "avgFraudScore": 0
    },
    "priority": {
      "cases": 8
    }
  }
}
```

**Call Cost Calculation:**
- Average call duration: 3 minutes
- Cost per minute: $0.12 (Retell AI pricing)
- Today's call cost = calls × 3 × $0.12

**Priority Cases:**
- Patients with fraud_score > 70
- Patients with status = 'flagged'

**Example curl:**
```bash
curl -X GET http://localhost:3001/api/admin/stats \
  -H "Cookie: session=your-session-cookie"
```

---

### GET /api/admin/transactions

Get all transactions (checkout history).

**Authentication:** Required (admin session)

**Success Response (200):**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn_123",
      "customer_phone": "+1234567890",
      "amount": 150.00,
      "status": "completed",
      "fraud_score": 15,
      "created_at": "2025-11-01T10:30:00.000Z"
    }
  ]
}
```

---

### GET /api/admin/customers

Get all customers.

**Authentication:** Required (admin session)

**Success Response (200):**
```json
{
  "success": true,
  "customers": [
    {
      "phone": "+1234567890",
      "name": "John Doe",
      "email": "john@example.com",
      "total_orders": 3,
      "total_spent": 450.00,
      "created_at": "2025-10-15T08:00:00.000Z"
    }
  ]
}
```

---

### GET /api/admin/customers/:phone

Get specific customer details by phone number.

**Authentication:** Required (admin session)

**Path Parameters:**
- `phone` (string) - Customer phone number (URL encoded)

**Success Response (200):**
```json
{
  "success": true,
  "customer": {
    "phone": "+1234567890",
    "name": "John Doe",
    "email": "john@example.com",
    "total_orders": 3,
    "total_spent": 450.00,
    "orders": [
      {
        "id": "order_123",
        "amount": 150.00,
        "status": "completed",
        "created_at": "2025-11-01T10:30:00.000Z"
      }
    ],
    "appointments": [
      {
        "id": "APT-1730000000000-abc123",
        "date": "2025-11-15",
        "time": "2:30 PM",
        "status": "scheduled"
      }
    ]
  }
}
```

**Example curl:**
```bash
curl -X GET "http://localhost:3001/api/admin/customers/%2B1234567890" \
  -H "Cookie: session=your-session-cookie"
```

---

### GET /api/admin/agent/stats

Get voice agent statistics.

**Authentication:** Required (admin session)

**Success Response (200):**
```json
{
  "success": true,
  "stats": {
    "total_calls": 1847,
    "total_duration_minutes": 5541,
    "avg_call_duration": 3.0,
    "conversion_rate": 35.7,
    "appointments_scheduled": 523
  }
}
```

---

## Authentication Endpoints

### POST /api/auth/login

Authenticate admin user.

**Request Body:**
```json
{
  "email": "admin@doclittle.com",
  "password": "your-secure-password"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "admin@doclittle.com",
    "role": "admin"
  },
  "token": "session-token-abc123"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

## Webhook Endpoints

### POST /webhook/retell/events

Receive real-time events from Retell AI during calls.

**Request Body:**
```json
{
  "event": "call_started",
  "call_id": "abc123",
  "agent_id": "your-agent-id",
  "timestamp": "2025-11-01T12:00:00.000Z"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### POST /webhook/retell/end-of-call

Receive call summary when call ends.

**Request Body:**
```json
{
  "call_id": "abc123",
  "agent_id": "your-agent-id",
  "call_duration": 180,
  "transcript": "Full call transcript...",
  "call_analysis": {
    "sentiment": "positive",
    "appointment_scheduled": true
  },
  "ended_at": "2025-11-01T12:03:00.000Z"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### POST /webhook/stripe

Receive Stripe payment events.

**Request Body:**
```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_123",
      "amount": 15000,
      "status": "succeeded"
    }
  }
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

## Health Check

### GET /health

Check if server is running.

**Success Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-11-01T12:00:00.000Z",
  "uptime": 3600,
  "services": {
    "database": "connected",
    "google_calendar": "configured",
    "stripe": "configured",
    "retell": "configured"
  }
}
```

---

## Error Response Format

All endpoints use consistent error response format:

```json
{
  "success": false,
  "error": "Description of what went wrong",
  "code": "ERROR_CODE",
  "details": {
    "field": "additional context"
  }
}
```

### Common HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Request succeeded |
| 400 | Bad Request | Invalid parameters or missing required fields |
| 401 | Unauthorized | Authentication required or failed |
| 404 | Not Found | Resource (appointment, customer, etc.) not found |
| 500 | Internal Server Error | Server-side error (database, external API, etc.) |

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `MISSING_REQUIRED_FIELDS` | Required parameters not provided | Check API documentation for required fields |
| `INVALID_DATE_FORMAT` | Date string couldn't be parsed | Use ISO format (YYYY-MM-DD) or clear natural language |
| `APPOINTMENT_NOT_FOUND` | Appointment ID doesn't exist | Verify appointment ID is correct |
| `NO_AVAILABLE_SLOTS` | All slots are booked for requested date | Try different date |
| `CALENDAR_SYNC_FAILED` | Google Calendar API error | Check calendar configuration, appointment still created |
| `DATABASE_ERROR` | Database operation failed | Contact support |
| `AUTHENTICATION_FAILED` | Invalid credentials | Check email/password or session token |

---

## Rate Limiting

Currently no rate limiting is implemented. For production deployment, consider:

- Voice agent endpoints: 100 requests/minute per IP
- Dashboard API: 1000 requests/minute per session
- Webhook endpoints: No limit (trusted sources)

---

## CORS Configuration

CORS is enabled for:
- Dashboard domain: `https://dashboard.doclittle.com`
- Voice agent callbacks: All Retell AI origins

For local development, all origins are allowed.

---

## Request/Response Headers

### Standard Headers

**Request:**
```
Content-Type: application/json
Authorization: Bearer <token> (for authenticated endpoints)
```

**Response:**
```
Content-Type: application/json
X-Request-ID: unique-request-id
X-Response-Time: 45ms
```

---

## Testing

### Using curl

```bash
# Set base URL
BASE_URL="http://localhost:3001"

# Schedule appointment
curl -X POST $BASE_URL/voice/appointments/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "patient_name": "Test Patient",
      "patient_phone": "+1234567890",
      "date": "November 15, 2025",
      "time": "2:30 PM"
    }
  }'

# Check available slots
curl -X POST $BASE_URL/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'

# Search appointments
curl -X POST $BASE_URL/voice/appointments/search \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "search_term": "+1234567890"
    }
  }'
```

### Using Postman

Import this collection:

```json
{
  "info": {
    "name": "DocLittle API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Schedule Appointment",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"args\": {\n    \"patient_name\": \"Test Patient\",\n    \"patient_phone\": \"+1234567890\",\n    \"date\": \"November 15, 2025\",\n    \"time\": \"2:30 PM\"\n  }\n}"
        },
        "url": "{{base_url}}/voice/appointments/schedule"
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3001"
    }
  ]
}
```

---

## Related Documentation

- [Booking System Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md)
- [Google Calendar Setup Guide](./GOOGLE_CALENDAR_SETUP.md)
- [Retell AI Function Configuration](./RETELL_FUNCTIONS_CONFIG.md)
- [FHIR Integration Architecture](./FHIR_INTEGRATION_ARCHITECTURE.md)

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0

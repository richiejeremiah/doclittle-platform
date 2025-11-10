# API Documentation

## OpenAPI Specification

**Full API specification**: See `openapi.yaml` in this directory for complete OpenAPI 3.0 specification.

You can view the interactive API documentation using:
- [Swagger UI](https://editor.swagger.io/) - Upload `openapi.yaml`
- [Redoc](https://redocly.com/) - Upload `openapi.yaml`
- Or use any OpenAPI-compatible tool

## Base URL

**Production**: `https://web-production-a783d.up.railway.app`  
**Local**: `http://localhost:4000`

---

## Authentication

Most endpoints require API key authentication (optional for public endpoints):

```bash
# Header
X-API-Key: your_api_key_here

# OR Authorization header
Authorization: Bearer your_api_key_here

# OR Query parameter
?api_key=your_api_key_here
```

---

## Rate Limits

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 attempts per 15 minutes per IP
- **Payment**: 10 requests per hour per IP
- **Voice**: 20 requests per minute per IP

---

## Voice Agent Endpoints

### Appointment Booking

#### Schedule Appointment
```http
POST /voice/appointments/schedule
Content-Type: application/json

{
  "patient_name": "John Doe",
  "patient_phone": "+1234567890",
  "patient_email": "john@example.com",
  "date": "2024-12-15",
  "time": "14:00",
  "appointment_type": "Mental Health Consultation"
}
```

**Response**:
```json
{
  "success": true,
  "appointment": {
    "id": "appt-xxx",
    "patient_name": "John Doe",
    "date": "2024-12-15",
    "time": "14:00",
    "status": "scheduled"
  }
}
```

#### Get Available Slots
```http
POST /voice/appointments/available-slots
Content-Type: application/json

{
  "date": "2024-12-15"
}
```

#### Confirm Appointment
```http
POST /voice/appointments/confirm
Content-Type: application/json

{
  "appointment_id": "appt-xxx"
}
```

#### Cancel Appointment
```http
POST /voice/appointments/cancel
Content-Type: application/json

{
  "appointment_id": "appt-xxx",
  "reason": "Patient requested"
}
```

#### Reschedule Appointment
```http
POST /voice/appointments/reschedule
Content-Type: application/json

{
  "appointment_id": "appt-xxx",
  "new_date": "2024-12-16",
  "new_time": "15:00"
}
```

---

### Insurance Endpoints

#### Collect Insurance Information
```http
POST /voice/insurance/collect
Content-Type: application/json

{
  "patient_name": "John Doe",
  "member_id": "CIGNA901234",
  "payer_name": "Cigna"
}
```

#### Check Eligibility
```http
POST /voice/insurance/check-eligibility
Content-Type: application/json

{
  "patient_id": "patient-xxx",
  "service_code": "90837",
  "date_of_service": "2024-12-15"
}
```

#### Submit Claim
```http
POST /voice/insurance/submit-claim
Content-Type: application/json

{
  "appointment_id": "appt-xxx",
  "patient_id": "patient-xxx",
  "service_code": "90837",
  "diagnosis_code": "F41.1"
}
```

---

### Payment Endpoints

#### Create Checkout
```http
POST /voice/appointments/checkout
Content-Type: application/json

{
  "appointment_id": "appt-xxx",
  "patient_phone": "+1234567890",
  "patient_email": "john@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "checkout_id": "checkout-xxx",
  "amount": 39.99,
  "payment_token": "token-xxx",
  "requires_verification": true,
  "email_sent": true
}
```

#### Verify Email Code
```http
POST /voice/checkout/verify
Content-Type: application/json

{
  "payment_token": "token-xxx",
  "verification_code": "123456"
}
```

**Response**:
```json
{
  "success": true,
  "payment_link": "https://.../payment/token-xxx",
  "payment_link_sent": true
}
```

---

## Admin Endpoints

### Appointments

#### Get All Appointments
```http
GET /api/admin/appointments
```

#### Get Upcoming Appointments
```http
GET /api/admin/appointments/upcoming
```

---

### Insurance & Billing

#### Get Insurance Claims
```http
GET /api/admin/insurance/claims?status=approved
```

#### Get Payers
```http
GET /api/admin/insurance/payers?search=Cigna
```

#### Sync Payers from Stedi
```http
POST /api/admin/insurance/sync-payers
```

#### Get Patient Insurance
```http
GET /api/admin/patients/:patientId/insurance
```

#### Get Eligibility Checks
```http
GET /api/admin/patients/:patientId/eligibility
```

---

## Patient Portal Endpoints

### Send Verification Code
```http
POST /api/patient/verify/send
Content-Type: application/json

{
  "phone": "+1234567890"
}
```

### Confirm Verification Code
```http
POST /api/patient/verify/confirm
Content-Type: application/json

{
  "phone": "+1234567890",
  "code": "123456"
}
```

### Get Patient Appointments
```http
GET /api/patient/appointments?session_id=xxx
```

### Reschedule Appointment
```http
PUT /api/patient/appointments/:id/reschedule
Content-Type: application/json

{
  "new_date": "2024-12-16",
  "new_time": "15:00"
}
```

### Cancel Appointment
```http
DELETE /api/patient/appointments/:id
```

---

## Circle Payment Endpoints

### Create Wallet
```http
POST /api/circle/wallets
Content-Type: application/json

{
  "entityType": "patient",
  "entityId": "patient-xxx",
  "description": "Patient wallet"
}
```

### Get Wallet Balance
```http
GET /api/circle/accounts/patient/:patientId
```

### Deposit to Wallet
```http
POST /api/patient/wallet/deposit
Content-Type: application/json

{
  "patientId": "patient-xxx",
  "amount": 100.00
}
```

### Submit Claim Payment
```http
POST /api/claims/:claimId/submit-payment
```

### Approve Claim Payment
```http
POST /api/claims/:claimId/approve-payment
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**HTTP Status Codes**:
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid API key)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## Webhooks

### Stripe Webhook
```http
POST /webhook/stripe
X-Stripe-Signature: signature
```

### Circle Webhook
```http
POST /webhook/circle
X-Circle-Signature: signature
```

---

## Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

---

For more details, see the full API documentation in the codebase or contact support.


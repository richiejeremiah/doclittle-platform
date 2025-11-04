# DocLittle Mental Health Helpline - Documentation

**Complete Technical Documentation**

---

## Welcome

This documentation covers the complete DocLittle Mental Health Helpline platform, including FHIR integration, voice agent capabilities, appointment booking system, and dashboard management.

---

## Quick Start

**New to the booking system?** Start here:

📘 **[Booking System Quick Setup Guide](./BOOKING_SYSTEM_SETUP.md)** - Get up and running in 10 minutes

---

## Documentation Index

### Booking System (NEW)

The appointment scheduling system that integrates with the voice agent and Google Calendar.

| Document | Description | Audience |
|----------|-------------|----------|
| **[Booking System Quick Setup](./BOOKING_SYSTEM_SETUP.md)** | Fast 10-minute setup guide | Developers, DevOps |
| **[Booking System Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md)** | Complete system design and technical overview | Developers, Architects |
| **[Google Calendar Setup](./GOOGLE_CALENDAR_SETUP.md)** | Step-by-step calendar API configuration | Developers, DevOps |
| **[Retell AI Functions Config](./RETELL_FUNCTIONS_CONFIG.md)** | Voice agent function setup and testing | Developers, Voice Engineers |
| **[API Endpoints Reference](./API_ENDPOINTS.md)** | Complete API documentation with examples | Developers, Integrators |

### Calendar UI (NEW)

| Document | Description | Audience |
|----------|-------------|----------|
| **[Calendar UI](./CALENDAR_UI.md)** | Frontend calendar, filters, PHI masking | Developers, Admins |
| **[Data Security & FHIR](./DATA_SECURITY.md)** | Data handling, PHI minimization, FHIR alignment | Security, Developers |

### FHIR Integration

Patient data management using FHIR R4 standard.

| Document | Description | Audience |
|----------|-------------|----------|
| **[FHIR Integration Architecture](./FHIR_INTEGRATION_ARCHITECTURE.md)** | Healthcare data integration with FHIR R4 | Healthcare Developers, Architects |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interfaces                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Voice Calls     │  │  Admin Dashboard │  │  Webhooks     │ │
│  │  (Retell AI)     │  │  (Web Interface) │  │  (External)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
└───────────┼────────────────────┼────────────────────┼──────────┘
            │                    │                    │
            │                    │                    │
┌───────────┼────────────────────┼────────────────────┼──────────┐
│           │         Middleware Platform (Express.js)           │
│           ▼                    ▼                    ▼           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Voice Endpoints │  │ Dashboard APIs  │  │ Webhook APIs   │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬───────┘ │
│           │                    │                     │          │
│           └────────────────────┼─────────────────────┘          │
│                                ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Service Layer                         │  │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ BookingService│  │ FHIRService  │  │ PaymentOrch  │ │  │
│  │  └───────┬───────┘  └──────┬───────┘  └──────┬───────┘ │  │
│  └──────────┼──────────────────┼──────────────────┼─────────┘  │
│             │                  │                  │             │
└─────────────┼──────────────────┼──────────────────┼────────────┘
              │                  │                  │
              ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data & External Services                   │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ SQLite DB     │  │ Google Cal   │  │ External APIs      │   │
│  │ - Appointments│  │ - Events     │  │ - Stripe           │   │
│  │ - Patients    │  │ - Sync       │  │ - Twilio           │   │
│  │ - Transactions│  │              │  │ - Retell AI        │   │
│  └───────────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Appointment Booking System

**What it does:**
- Voice-driven appointment scheduling through natural conversation
- Real-time availability checking
- Google Calendar integration for cross-platform sync
- Appointment confirmation and cancellation
- Search appointments by phone or email

**Key Components:**
- BookingService (service layer)
- 5 voice agent endpoints
- 2 dashboard endpoints
- Appointments database table
- Google Calendar API integration

**Documentation:**
- [Quick Setup Guide](./BOOKING_SYSTEM_SETUP.md)
- [Architecture Overview](./BOOKING_SYSTEM_ARCHITECTURE.md)
- [API Reference](./API_ENDPOINTS.md)

---

### 2. Voice Agent (Retell AI)

**What it does:**
- Handles patient calls with empathetic AI agent
- Schedules appointments through conversation
- Collects patient information
- Provides mental health support and resources
- Routes to crisis intervention when needed

**Key Components:**
- Retell AI agent integration
- Custom function calling
- SIP endpoint configuration
- End-of-call webhooks

**Documentation:**
- [Retell Functions Config](./RETELL_FUNCTIONS_CONFIG.md)
- [API Endpoints](./API_ENDPOINTS.md)

---

### 3. FHIR R4 Integration

**What it does:**
- Manages patient records using healthcare standard (FHIR R4)
- Stores comprehensive patient data
- Links appointments to patient resources
- Enables interoperability with other healthcare systems

**Key Components:**
- FHIR patient resources
- FHIR observation resources
- FHIR encounter tracking
- Healthcare data model

**Documentation:**
- [FHIR Integration Architecture](./FHIR_INTEGRATION_ARCHITECTURE.md)

---

### 4. Admin Dashboard

**What it does:**
- Visualizes key metrics (calls, revenue, priority cases)
- Shows referral list for high-risk patients
- Manages appointments
- Views customer data and transactions
- Monitors agent performance

**Key Components:**
- Dashboard statistics API
- Appointments management
- Customer profiles
- Transaction history
- Priority case tracking

**Documentation:**
- [API Endpoints](./API_ENDPOINTS.md)

---

### 5. Google Calendar Integration

**What it does:**
- Syncs appointments to Google Calendar
- Creates calendar events automatically
- Enables team calendar sharing
- Provides standard iCal format

**Key Components:**
- Service account authentication
- OAuth2 authentication (alternative)
- Calendar event creation
- Event deletion on cancellation

**Documentation:**
- [Google Calendar Setup](./GOOGLE_CALENDAR_SETUP.md)

---

## Technology Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite with better-sqlite3
- **Architecture:** Service-oriented with modular services

### Integrations
- **Voice Agent:** Retell AI with custom functions
- **Calendar:** Google Calendar API
- **Payments:** Stripe
- **SMS/Voice:** Twilio
- **Healthcare Standard:** FHIR R4

### Frontend
- **Dashboard:** Vanilla JavaScript, HTML5, CSS3
- **Styling:** Custom CSS with medical teal theme
- **Authentication:** Google OAuth

---

## Environment Variables

### Required (Core Platform)

```bash
PORT=3001
RETELL_API_KEY=your-retell-api-key
RETELL_AGENT_ID=your-agent-id
STRIPE_SECRET_KEY=your-stripe-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Optional (Booking System)

```bash
# Google Calendar - Service Account (recommended)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
GOOGLE_CALENDAR_ID=calendar-id@group.calendar.google.com

# Google Calendar - OAuth2 (alternative)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Timezone
GOOGLE_CALENDAR_TIMEZONE=America/New_York
```

---

## Project Structure

```
agentic-commerce-platform/
├── middleware-platform/           # Backend server
│   ├── server.js                 # Main Express server
│   ├── database.js               # Database layer
│   ├── services/
│   │   ├── booking-service.js    # Appointment management
│   │   ├── payment-orchestrator.js
│   │   └── sms-service.js
│   └── .env                      # Environment variables
│
├── unified-dashboard/            # Frontend dashboard
│   ├── index.html               # Login page
│   └── business/
│       ├── dashboard.html       # Main dashboard
│       ├── patients.html        # Patient management
│       ├── orders.html          # Order history
│       ├── agent.html           # Voice agent stats
│       └── settings.html        # Settings
│
└── docs/                        # Documentation (you are here)
    ├── README.md                # This file
    ├── BOOKING_SYSTEM_SETUP.md
    ├── BOOKING_SYSTEM_ARCHITECTURE.md
    ├── GOOGLE_CALENDAR_SETUP.md
    ├── RETELL_FUNCTIONS_CONFIG.md
    ├── API_ENDPOINTS.md
    └── FHIR_INTEGRATION_ARCHITECTURE.md
```

---

## Getting Started

### For Developers

1. **[Quick Setup](./BOOKING_SYSTEM_SETUP.md)** - Set up booking system in 10 minutes
2. **[Architecture](./BOOKING_SYSTEM_ARCHITECTURE.md)** - Understand the system design
3. **[API Reference](./API_ENDPOINTS.md)** - Explore available endpoints

### For DevOps Engineers

1. **[Environment Setup](./BOOKING_SYSTEM_SETUP.md#step-3-configure-environment-variables)** - Configure environment variables
2. **[Google Calendar](./GOOGLE_CALENDAR_SETUP.md)** - Set up calendar integration
3. **[Production Checklist](./BOOKING_SYSTEM_SETUP.md#production-checklist)** - Pre-launch verification

### For Voice Engineers

1. **[Retell Configuration](./RETELL_FUNCTIONS_CONFIG.md)** - Configure voice agent functions
2. **[Testing Guide](./RETELL_FUNCTIONS_CONFIG.md#testing-your-configuration)** - Test voice flows
3. **[Conversation Examples](./RETELL_FUNCTIONS_CONFIG.md#conversation-flow-examples)** - Sample dialogues

### For Healthcare Integrators

1. **[FHIR Integration](./FHIR_INTEGRATION_ARCHITECTURE.md)** - Healthcare data integration
2. **[API Endpoints](./API_ENDPOINTS.md)** - Patient data APIs

---

## Common Tasks

### Schedule an Appointment via API

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

### Check Available Slots

```bash
curl -X POST http://localhost:3001/voice/appointments/available-slots \
  -H "Content-Type: application/json" \
  -d '{
    "args": {
      "date": "November 15, 2025"
    }
  }'
```

### View All Appointments

```bash
curl -X GET http://localhost:3001/api/admin/appointments \
  -H "Cookie: session=your-session"
```

---

## API Quick Reference

### Voice Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/voice/appointments/schedule` | Schedule new appointment |
| POST | `/voice/appointments/confirm` | Confirm appointment |
| POST | `/voice/appointments/cancel` | Cancel appointment |
| POST | `/voice/appointments/available-slots` | Check availability |
| POST | `/voice/appointments/search` | Search appointments |

### Dashboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/appointments` | Get all appointments |
| GET | `/api/admin/appointments/upcoming` | Get upcoming appointments |
| GET | `/api/admin/stats` | Get dashboard statistics |
| GET | `/api/admin/customers` | Get all customers |
| GET | `/api/admin/transactions` | Get transaction history |

**Full API Documentation:** [API_ENDPOINTS.md](./API_ENDPOINTS.md)

---

## Troubleshooting

### Quick Fixes

| Issue | Solution |
|-------|----------|
| Module 'googleapis' not found | `npm install googleapis` |
| Calendar events not creating | Check service account credentials and calendar sharing |
| Retell functions not working | Verify function URLs use your public domain/ngrok |
| Database errors | Check database.js is loading correctly |
| Invalid date format | Use natural language ("November 15, 2025") or ISO format |

**Detailed Troubleshooting:** Each documentation file includes a troubleshooting section.

---

## Development Workflow

### Local Development

1. Start the backend server:
   ```bash
   cd middleware-platform
   npm start
   ```

2. Open dashboard:
   ```
   http://localhost:3000/business/dashboard.html
   ```

3. Use ngrok for Retell testing:
   ```bash
   ngrok http 3001
   ```

### Testing Changes

1. Test endpoints with curl
2. Test voice flows in Retell dashboard
3. Verify calendar sync in Google Calendar
4. Check dashboard displays correctly

### Deployment

1. Set production environment variables
2. Configure production database
3. Set up Google Calendar service account
4. Update Retell function URLs
5. Deploy to production server
6. Verify all integrations

---

## Performance Considerations

### Database
- SQLite is suitable for small to medium deployments
- Consider PostgreSQL for high-traffic production
- Regular backups recommended

### API Rate Limits
- Google Calendar: 1M queries/day, 60/min per user
- Retell AI: Check your plan limits
- Implement rate limiting for production

### Scalability
- Current architecture supports single server
- For multiple servers, use shared database
- Consider Redis for session management

---

## Security Best Practices

### API Security
- ✅ Use HTTPS in production
- ✅ Validate all input parameters
- ✅ Sanitize database queries (using prepared statements)
- ⚠️ Add authentication to voice endpoints for production

### Data Privacy
- ✅ HIPAA compliance for health data
- ✅ Minimal logging of PII
- ✅ Secure storage of credentials
- ✅ Regular security audits

### Google Calendar
- ✅ Never commit service account keys
- ✅ Rotate keys every 90 days
- ✅ Use minimum required permissions
- ✅ Monitor API usage

---

## Support & Resources

### Internal Documentation
- All docs are in `/docs` folder
- Each doc includes troubleshooting section
- Code examples provided throughout

### External Resources
- [Retell AI Documentation](https://docs.retellai.com/)
- [Google Calendar API](https://developers.google.com/calendar)
- [FHIR R4 Specification](https://www.hl7.org/fhir/)
- [Express.js Guide](https://expressjs.com/)

---

## Contributing

When adding new features:

1. Update relevant documentation in `/docs`
2. Add endpoint to [API_ENDPOINTS.md](./API_ENDPOINTS.md)
3. Update [BOOKING_SYSTEM_ARCHITECTURE.md](./BOOKING_SYSTEM_ARCHITECTURE.md) if architecture changes
4. Add examples and testing instructions
5. Update this README if major features added

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-01 | Initial booking system implementation |
| | | - Added 5 voice agent endpoints |
| | | - Added 2 dashboard endpoints |
| | | - Google Calendar integration |
| | | - Complete documentation suite |

---

## License

Proprietary - DocLittle Mental Health Helpline Platform

---

## Contact

For questions or issues:
- Review documentation in `/docs` folder
- Check troubleshooting sections
- Review code comments in source files

---

**Last Updated:** November 1, 2025
**Documentation Version:** 1.0.0

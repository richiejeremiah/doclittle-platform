# DocLittle - AI Voice Receptionist Platform

**Version**: 3.0.0  
**Status**: Production Ready  
**Last Updated**: November 2024

---

## 📋 Overview

DocLittle is a comprehensive AI-powered voice receptionist platform for healthcare providers. The system handles appointment booking, patient management, payment processing, insurance verification, and appointment reminders through an intelligent voice agent integrated with Retell AI.

### Key Features

- ✅ **Voice Agent Integration**: Natural language appointment booking via Retell AI
- ✅ **Appointment Management**: Scheduling, confirmation, cancellation, rescheduling
- ✅ **Payment Processing**: Stripe integration with email verification flow
- ✅ **Insurance Integration**: Stedi API for eligibility checks and claim submission
- ✅ **Patient Records**: FHIR R4 compliant patient data management
- ✅ **Calendar Sync**: Google Calendar integration
- ✅ **Medical Coding**: PDF-based medical coding with ICD-10 and CPT code extraction
- ✅ **Circle Payments**: USDC payment processing for insurance claims
- ✅ **EHR Integration**: Epic and 1upHealth integration for clinical data
- ✅ **Admin Dashboard**: Real-time monitoring and management
- ✅ **Patient Portal**: Self-service appointment management

---

## 🏗️ Architecture

### Technology Stack

**Backend**:
- Node.js (v20+), Express.js
- SQLite (better-sqlite3) with automatic migrations
- Retell AI (voice agent)
- Stripe (payments)
- Circle (USDC payments)
- Stedi API (insurance X12 EDI)
- Google Calendar API
- Groq (medical coding AI)
- Epic/1upHealth (EHR integration)

**Frontend**:
- Vanilla HTML/CSS/JavaScript
- Netlify (deployment)
- Railway (backend deployment)

**Standards**:
- FHIR R4 (healthcare data)
- X12 EDI (insurance transactions)
- HIPAA-compliant data handling

### Project Structure

```
agentic-commerce-platform/
├── middleware-platform/     # Backend API
│   ├── server.js            # Main Express server
│   ├── database.js          # Database schema & migrations
│   ├── services/            # Business logic
│   ├── routes/              # API routes
│   ├── adapters/            # External API adapters
│   └── scripts/             # Utility scripts
├── unified-dashboard/       # Frontend dashboard
│   ├── business/            # Provider dashboard pages
│   ├── patient/             # Patient portal pages
│   └── assets/              # CSS, JS, images
└── README.md                # This file
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js v20+
- npm v8+
- SQLite (included with better-sqlite3)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd agentic-commerce-platform
```

2. **Install backend dependencies**
```bash
cd middleware-platform
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. **Start the backend server**
```bash
npm start
# Server runs on http://localhost:4000
```

5. **Start the frontend (optional, for local development)**
```bash
cd unified-dashboard
python3 -m http.server 8000
# Frontend runs on http://localhost:8000
```

---

## 🔧 Environment Variables

### Required Variables

```bash
# Server
PORT=4000
NODE_ENV=production

# Retell AI
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=your_agent_id

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Stedi Insurance
STEDI_API_KEY=your_stedi_api_key
STEDI_API_BASE=https://api.stedi.com

# Circle Payments (optional)
CIRCLE_API_KEY=your_circle_api_key
CIRCLE_ENTITY_SECRET=your_entity_secret
```

### Optional Variables

```bash
# Google Calendar
GOOGLE_CALENDAR_ID=your_calendar_id
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token

# Groq (Medical Coding)
GROQ_API_KEY=your_groq_api_key

# Epic EHR
EPIC_CLIENT_ID=your_epic_client_id
EPIC_REDIRECT_URI=your_redirect_uri

# Base URL
BASE_URL=https://your-domain.com
```

---

## 📡 API Endpoints

### Voice Agent Endpoints

**Appointment Booking**:
- `POST /voice/appointments/schedule` - Schedule appointment
- `POST /voice/appointments/confirm` - Confirm appointment
- `POST /voice/appointments/cancel` - Cancel appointment
- `POST /voice/appointments/reschedule` - Reschedule appointment
- `POST /voice/appointments/available-slots` - Get available time slots
- `POST /voice/appointments/search` - Search appointments

**Insurance**:
- `POST /voice/insurance/collect` - Collect insurance information
- `POST /voice/insurance/check-eligibility` - Check insurance eligibility
- `POST /voice/insurance/submit-claim` - Submit insurance claim

**Payment**:
- `POST /voice/appointments/checkout` - Create appointment checkout
- `POST /voice/checkout/verify` - Verify email code
- `POST /process-payment` - Process Stripe payment

### Admin Endpoints

**Appointments**:
- `GET /api/admin/appointments` - Get all appointments
- `GET /api/admin/appointments/upcoming` - Get upcoming appointments

**Insurance & Billing**:
- `GET /api/admin/insurance/claims` - Get insurance claims
- `GET /api/admin/insurance/payers` - Get payers (cached)
- `POST /api/admin/insurance/sync-payers` - Sync payer list from Stedi
- `GET /api/admin/patients/:id/insurance` - Get patient insurance
- `GET /api/admin/patients/:id/eligibility` - Get eligibility checks

**Medical Coding**:
- `POST /api/claims/create-from-pdf` - Create claim from PDF coding
- `GET /api/claims/:id` - Get claim details

**Circle Payments**:
- `POST /api/claims/:claimId/submit-payment` - Submit claim for payment
- `POST /api/claims/:claimId/approve-payment` - Approve and pay claim

### Provider Endpoints

- `GET /api/provider/today` - Get today's schedule
- `GET /api/provider/next-patient` - Get next patient up
- `GET /api/provider/live-stats` - Get real-time statistics

### Patient Portal Endpoints

- `POST /api/patient/verify/send` - Send verification code
- `POST /api/patient/verify/confirm` - Verify code and create session
- `GET /api/patient/appointments` - Get patient's appointments
- `PUT /api/patient/appointments/:id/reschedule` - Reschedule appointment
- `DELETE /api/patient/appointments/:id` - Cancel appointment

---

## 💾 Database

### Database Migrations

The system automatically migrates the database schema on startup. The `database.js` file includes migration logic that:
- Adds missing columns to existing tables
- Creates new tables if they don't exist
- Maintains data integrity

### Key Tables

**Core Tables**:
- `appointments` - Appointment records
- `fhir_patients` - FHIR R4 patient records
- `fhir_encounters` - Healthcare encounters
- `insurance_claims` - Insurance claims with payment tracking
- `eligibility_checks` - Insurance eligibility results
- `patient_insurance` - Patient insurance information
- `circle_transfers` - Circle payment transfers
- `voice_checkouts` - Payment checkout records

**Insurance Tables**:
- `insurance_payers` - Cached payer list (cost optimization)
- `patient_insurance` - Patient insurance records
- `eligibility_checks` - Eligibility verification results
- `insurance_claims` - Submitted claims with payment status

**EHR Tables**:
- `ehr_connections` - EHR OAuth connections
- `ehr_encounters` - Synced EHR encounters
- `ehr_conditions` - ICD-10 diagnosis codes
- `ehr_procedures` - CPT procedure codes

---

## 🔄 Workflow

### Complete Call Flow

1. **Patient Calls** → Retell AI voice agent answers
2. **Information Collection** → Name, phone, email, insurance
3. **Appointment Booking** → Agent schedules appointment
4. **Insurance Verification** → Checks eligibility via Stedi
5. **Payment Processing** → Creates checkout, verifies email, processes payment
6. **Confirmation** → Sends confirmation email with calendar link
7. **Post-Appointment** → EHR sync pulls clinical data (ICD-10, CPT codes)
8. **Claim Submission** → Auto-submits insurance claim with codes
9. **Payment Processing** → Circle payments for approved claims

### Medical Coding Flow

1. **PDF Upload** → Provider uploads medical document
2. **Text Extraction** → System extracts text from PDF
3. **AI Coding** → Groq AI extracts ICD-10 and CPT codes
4. **Code Validation** → Validates codes against knowledge base
5. **Claim Creation** → Creates insurance claim with codes
6. **Patient Selection** → Links claim to patient
7. **Submission** → Submits claim to insurance via Stedi

---

## 🧪 Testing

### Run Tests

```bash
cd middleware-platform
node tests/test-comprehensive-system.js
```

### Test Coverage

- ✅ Appointment booking (schedule, search, confirm, reschedule, cancel)
- ✅ Complex scheduling scenarios
- ✅ Insurance collection and eligibility checks
- ✅ Payment checkout creation
- ✅ Admin endpoints
- ✅ Database migrations

---

## 🚢 Deployment

### Backend (Railway)

1. Connect GitHub repository to Railway
2. Set root directory to `middleware-platform`
3. Configure environment variables in Railway dashboard
4. Deploy automatically on push to main branch

**Railway Configuration** (`railway.json`):
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Frontend (Netlify)

1. Connect GitHub repository to Netlify
2. Set build directory to `unified-dashboard`
3. Configure environment variables
4. Deploy automatically on push to main branch

**Netlify Configuration** (`netlify.toml`):
```toml
[build]
  publish = "unified-dashboard"
  command = "echo 'No build needed'"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Domain Configuration

- Backend: `https://web-production-a783d.up.railway.app`
- Frontend: Configured to use Railway backend automatically
- Custom domain: Update `BASE_URL` environment variable

---

## 🔒 Security & Compliance

### HIPAA Compliance

- FHIR R4 compliant patient records
- PHI masking in UI
- Secure API endpoints (HTTPS)
- Audit logging for all data access
- Encrypted database connections (production)

### Data Security

- Database encryption at rest
- Secure API authentication
- Input validation and sanitization
- SQL injection prevention
- CORS configuration

---

## 🐛 Troubleshooting

### Common Issues

**Database Migration Errors**:
- Solution: Database migrations run automatically on startup
- If issues persist, check `database.js` migration logic

**Missing API Keys**:
- Solution: Ensure all required environment variables are set
- Check `.env` file or Railway/Netlify environment variables

**Insurance Claims Error**:
- Solution: Database migration automatically adds missing columns
- Restart server to apply migrations

**Payment Processing Errors**:
- Solution: Verify Stripe API keys are correct
- Check Circle API configuration for USDC payments


---

## 📚 Key Services

### Booking Service
- Handles appointment scheduling, availability checks, conflict resolution
- Location: `middleware-platform/services/booking-service.js`

### Insurance Service
- Stedi API integration for eligibility checks and claim submission
- Location: `middleware-platform/services/insurance-service.js`

### Medical Coding Service
- Groq AI integration for ICD-10 and CPT code extraction
- Location: `middleware-platform/services/medical-coding-service.js`

### Circle Service
- USDC payment processing for insurance claims
- Location: `middleware-platform/services/circle-service.js`

### EHR Sync Service
- Epic and 1upHealth integration for clinical data
- Location: `middleware-platform/services/ehr-sync-service.js`

---

## 💰 Circle Wallet Setup

### Wallet Configuration

The system uses Circle for USDC payment processing. To set up wallets:

1. **Create System Wallet**:
```bash
cd middleware-platform
node scripts/setup-circle-system-wallet.js
```

2. **Configure Environment Variables**:
```env
CIRCLE_WALLET_SET_ID=your_wallet_set_id
CIRCLE_SYSTEM_WALLET_ID=your_system_wallet_id
CIRCLE_ENTITY_SECRET=your_entity_secret
```

3. **Fund System Wallet**:
   - Go to [Circle Console](https://console.circle.com)
   - Navigate to your wallet set
   - Use Circle's testnet mint/faucet feature to add test USDC
   - Or use Polygon Amoy testnet faucet

### Important Notes

- **Wallets must be in the same wallet set** to transfer between them
- Test USDC is required in the system wallet before transfers will work
- For production, use Circle's mainnet environment

### Troubleshooting

**"System funding wallet not found"**:
- Run `node scripts/setup-circle-system-wallet.js` to create it
- Make sure `CIRCLE_SYSTEM_WALLET_ID` is set in `.env`

**"Insufficient balance" or transfer fails**:
- Check system wallet balance in Circle Console
- Fund the system wallet with more test USDC

**"Circle SDK not available"**:
- Make sure `CIRCLE_ENTITY_SECRET` is set in `.env`
- Run `node scripts/setup-circle-entity-secret.js` if needed

---

## 🎙️ Voice Agent Claim Retrieval

### Overview

The voice agent can retrieve claim information using the insurance member ID. The `/api/patient/benefits` endpoint supports member ID lookup.

### Endpoint Usage

**Get Claims by Member ID**:
```bash
curl "http://localhost:4000/api/patient/benefits?memberId=CIGNA901234&patientName=Emily%20Davis"
```

**Response includes**:
- Patient information
- Insurance information with `member_id`
- Claims array with:
  - `id`, `status`, `total_amount`
  - `service_code`, `diagnosis_code`
  - `pricing`: Pricing breakdown (if available)
  - `eob`: EOB calculation (if calculated)
  - `diagnosisCodes`: Array of diagnosis codes with descriptions

### Voice Agent Flow

1. Agent asks: "Can I get your insurance number to look up your billing information?"
2. User provides insurance number (e.g., "901234")
3. Agent calls `/voice/insurance/collect` with `member_id`
4. Agent calls `/api/patient/benefits` with `memberId` and `patientName`
5. Agent receives claims with detailed breakdown
6. Agent explains claim details using CPT and diagnosis code descriptions

---

## 🔗 Resources

- **Retell AI**: https://docs.retellai.com
- **Stedi API**: https://www.stedi.com/docs
- **FHIR R4**: https://www.hl7.org/fhir/
- **Stripe API**: https://stripe.com/docs/api
- **Circle API**: https://developers.circle.com
- **Epic FHIR**: https://fhir.epic.com

---

## 📝 License

MIT License

---

## 🤝 Support

For issues and questions:
1. Check the troubleshooting section
2. Review API endpoint documentation
3. Check server logs for error details
4. Verify environment variables are configured correctly

---

**Last Updated**: November 2024  
**Version**: 3.0.0


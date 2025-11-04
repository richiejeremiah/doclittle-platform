# Data Security & FHIR Alignment

## Overview
This document captures how patient data is handled securely across the appointment booking and calendar UI, with alignment to FHIR principles.

## Storage Model
- Appointments stored in `appointments` table (`middleware-platform/database.js`)
- Key fields:
  - `patient_id` → links to `fhir_patients.resource_id`
  - `start_time`, `end_time` → ISO datetimes for safe querying
  - `appointment_type`, `status` → workflow states
  - `notes` → may include JSON metadata (buffers, timezone) but NOT clinical PHI

## FHIR Alignment
- Patients: `fhir_patients` (R4 Patient resource JSON stored in `resource_data`)
- Encounters: `fhir_encounters` (call/visit context)
- Appointments (roadmap): map to FHIR Appointment resource for interoperability
- UI displays only FHIR identifiers (e.g., `patient_id`) and not clinical content

## PHI Minimization in UI
- Calendar shows:
  - Patient initials only
  - Masked phone (`(***) ***-1234`)
  - Email obscured to `j***@domain`
  - Confirmation number (non-PHI)
- Modal includes FHIR `patient_id` for cross-reference

## API Surface Hardening
- Admin endpoints (`/api/admin/appointments`) are for authenticated users only
- Do not expose raw FHIR resource JSON in calendar API responses
- Consider adding role checks if not already present

## Calendar Integration
- Google Calendar event body excludes sensitive PHI
  - No DOB, address, or clinical notes
  - Minimal context only (type, provider, internal ID)
- Event updates/deletes handled with try/catch and logs, no PHI in logs

## Transport & Secrets
- Use HTTPS in production
- Secrets via environment variables (`.env`): Stripe, Twilio, Retell, Google
- Do not commit secrets; rotate regularly

## Audit & Logging
- Avoid logging request bodies that may contain PHI
- Use structured logs; filter headers/body for admin endpoints
- `fhir_audit_log` can capture administrative actions (roadmap)

## Next Steps
- Add FHIR Appointment resources for each booking
- Role-based access for calendar and patients views
- Tokenize patient identifiers in URLs (avoid guessable IDs)
- Add server-side pagination and date-range filters to `/api/admin/appointments`



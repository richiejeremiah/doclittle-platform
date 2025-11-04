# Calendar UI for Appointments

## Overview
A new Calendar tab provides full oversight of all bookings created by the AI Voice Agent and dashboard. It shows scheduled, confirmed, and cancelled appointments with color coding and secure PHI handling.

## Location
- Page: `unified-dashboard/business/calendar.html`
- Navigation: Added link in `unified-dashboard/business/dashboard.html` sidebar

## Data Source
- Endpoint: `GET /api/admin/appointments`
- Optional query params: `status`, `date`, `provider`

## UI Behavior
- Calendar view using FullCalendar (CDN)
- Filters: date, status, provider
- Status colors:
  - Scheduled: teal (`#06b6d4`)
  - Confirmed: green (`#10b981`)
  - Cancelled: red (`#ef4444`)
- Event click opens a details modal with:
  - Confirmation number
  - Status, type, provider
  - Patient initials (PHI masked)
  - Masked phone (***-***-1234)
  - FHIR patient ID (if present)
  - Google Calendar link (when available)

## PHI Handling
- Patient names shown as initials only
- Phone masked to last 4 digits
- Email obscured to first letter + domain (e.g., j***@example.com)
- FHIR resource IDs displayed for linkage, not raw clinical data

## FHIR Alignment
- Database column `patient_id` links appointments to `fhir_patients.resource_id`
- The UI displays the patient FHIR ID when available
- Future: drill-down to FHIR Appointment/Encounter resources

## Extensibility
- Add per-provider calendars by passing `provider` filter
- Add reschedule and cancellation actions inline (uses existing endpoints)
- Support weekly/day/list views (already enabled in header toolbar)

## Testing
1. Create a few appointments via API or Voice Agent
2. Open `unified-dashboard/business/calendar.html`
3. Use filters to inspect subsets
4. Click events to verify details modal content



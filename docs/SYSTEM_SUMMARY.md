# DocLittle AI Voice Receptionist - Complete System Summary

**Platform**: DocLittle - AI Voice Receptionist  
**Version**: 3.0.0  
**Last Updated**: November 6, 2024  
**Status**: Production Ready

---

## 📋 Table of Contents

1. [Voice Agent Workflow](#1-voice-agent-workflow)
2. [Patient Data Recording (New & Existing)](#2-patient-data-recording-new--existing)
3. [Insurance & Billing Layer (Stedi)](#3-insurance--billing-layer-stedi)
4. [Appointment Booking System](#4-appointment-booking-system)
5. [EHR Integration (Epic & 1upHealth)](#5-ehr-integration-epic--1uphealth)
6. [Complete Inbound Call Flow](#6-complete-inbound-call-flow)

---

## 1. Voice Agent Workflow

### 1.1 Overview

DocLittle uses **Retell AI** as the voice agent platform. The agent handles natural language conversations, collects patient information, books appointments, and processes payments - all through voice interaction.

### 1.2 Architecture

```
Patient Calls → Retell AI Voice Agent → DocLittle API → Database
                                      ↓
                              Function Calls (Retell)
                                      ↓
                    Appointment Booking / Insurance / Payment
```

### 1.3 Retell AI Integration

**Voice Agent Configuration**:
- **Platform**: Retell AI
- **Voice**: Natural, conversational AI
- **Function Calling**: Custom functions for booking, insurance, payment

**Key Retell Functions**:

1. **`get_available_slots`** - Check appointment availability
2. **`schedule_appointment`** - Book appointment
3. **`search_appointments`** - Find existing appointments
4. **`confirm_appointment`** - Confirm booking
5. **`cancel_appointment`** - Cancel booking
6. **`collect_insurance`** - Collect insurance information
7. **`check_eligibility`** - Verify insurance coverage
8. **`create_checkout`** - Create payment checkout

### 1.4 Voice Agent Endpoints

**Incoming Call Handler**:
```javascript
// server.js
app.post('/voice/incoming', async (req, res) => {
  const { call_id, from_number, to_number } = req.body;
  
  // Create FHIR patient record if new
  // Link call to patient
  // Return agent configuration
  
  res.json({
    response: {
      // Agent instructions
      // Function definitions
    }
  });
});
```

**Function Call Handlers**:
```javascript
// Each Retell function maps to an API endpoint
POST /voice/appointments/available-slots
POST /voice/appointments/schedule
POST /voice/appointments/confirm
POST /voice/appointments/cancel
POST /voice/insurance/collect
POST /voice/insurance/check-eligibility
POST /voice/appointments/checkout
```

### 1.5 Voice Agent Flow

1. **Call Initiated** → Retell receives call
2. **Agent Greeting** → "Hi, thanks for calling DocLittle..."
3. **Collect Information** → Name, phone, email, insurance
4. **Function Calls** → Agent calls backend functions
5. **Process Response** → System processes and responds
6. **Agent Speaks** → Agent communicates results to patient
7. **Call Completion** → Appointment booked, payment processed

---

## 2. Patient Data Recording (New & Existing)

### 2.1 FHIR Patient Records

DocLittle uses **FHIR R4** standard for all patient data, ensuring healthcare compliance and interoperability.

### 2.2 Patient Creation/Update Logic

**Service**: `services/fhir-service.js`

```javascript
static async getOrCreatePatient(patientData) {
  // Check if patient exists by phone
  if (patientData.phone) {
    const existingPatient = db.getFHIRPatientByPhone(patientData.phone);
    if (existingPatient) {
      console.log(`[FHIR] Found existing patient: ${existingPatient.resource_id}`);
      return existingPatient.resource_data;
    }
  }

  // Create new patient
  const patientResource = FHIRResources.createPatient({
    id: `patient-${uuidv4()}`,
    firstName: patientData.firstName,
    lastName: patientData.lastName,
    phone: patientData.phone,
    email: patientData.email,
    gender: patientData.gender,
    birthDate: patientData.birthDate,
    address: patientData.address,
    consentVoiceRecording: true,
    preferredLanguage: patientData.language || 'en-US',
    timezone: patientData.timezone
  });

  // Store in database
  db.createFHIRPatient(patientResource);
  return patientResource;
}
```

### 2.3 Database Schema

**Table**: `fhir_patients`

```sql
CREATE TABLE IF NOT EXISTS fhir_patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT UNIQUE NOT NULL,
  version_id INTEGER DEFAULT 1,
  resource_data TEXT NOT NULL,  -- Full FHIR JSON
  phone TEXT,
  email TEXT,
  name TEXT,
  is_deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2.4 Patient Matching Strategy

**Primary Matching**: Phone Number
- Phone is the unique identifier
- Format: `+1234567890` (E.164 format)
- Normalized before storage

**Secondary Matching**: Email
- Used if phone not available
- Case-insensitive matching

**Patient Lookup**:
```javascript
// database.js
getFHIRPatientByPhone(phone) {
  const normalized = normalizePhoneNumber(phone);
  return db.prepare(`
    SELECT * FROM fhir_patients 
    WHERE phone = ? AND is_deleted = 0
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(normalized);
}
```

### 2.5 Automatic Patient Creation

**When Patient is Created**:
1. **Voice Agent Call** → Patient provides phone number
2. **System Checks** → `getFHIRPatientByPhone()`
3. **If Not Found** → Create new FHIR Patient resource
4. **If Found** → Update existing record (if needed)
5. **Store** → Save to `fhir_patients` table

**Patient Update Flow**:
```javascript
// When new information is provided
if (existingPatient) {
  // Update existing patient with new data
  const updatedResource = FHIRResources.updatePatient(
    existingPatient.resource_data,
    newPatientData
  );
  db.updateFHIRPatient(existingPatient.resource_id, updatedResource);
}
```

### 2.6 Related Records

**Encounters** (Appointments):
- Linked to patient via `patient_id`
- Stored in `fhir_encounters` table
- Each appointment = one encounter

**Communications**:
- Appointment confirmations
- Reminders
- Stored in `fhir_communications` table

**Observations**:
- Clinical notes from voice calls
- Stored in `fhir_observations` table

---

## 3. Insurance & Billing Layer (Stedi)

### 3.1 Overview

DocLittle integrates with **Stedi API** for insurance eligibility checks, claim submission, and billing management using X12 EDI standards.

### 3.2 Insurance Collection Flow

**Voice Agent Function**: `collect_insurance`

```javascript
// Retell function: collect_insurance
{
  "type": "object",
  "properties": {
    "payer_name": {
      "type": "string",
      "description": "Insurance company name (e.g., Blue Cross Blue Shield)"
    },
    "member_id": {
      "type": "string",
      "description": "Patient's insurance member ID"
    },
    "patient_phone": {
      "type": "string",
      "description": "Patient phone number"
    }
  },
  "required": ["payer_name", "member_id"]
}
```

**API Endpoint**: `POST /voice/insurance/collect`

```javascript
// server.js
app.post('/voice/insurance/collect', async (req, res) => {
  const { payer_name, member_id, patient_phone } = req.body.args;
  
  // 1. Search for payer in cache/Stedi
  const payer = await PayerCacheService.searchPayer(payer_name);
  
  // 2. Store patient insurance
  db.upsertPatientInsurance({
    patient_id: patientId,
    payer_id: payer.payer_id,
    payer_name: payer.payer_name,
    member_id: member_id
  });
  
  res.json({
    success: true,
    payer_name: payer.payer_name,
    payer_id: payer.payer_id,
    message: "Insurance information collected"
  });
});
```

### 3.3 Eligibility Check (270/271)

**X12 Transaction**: 270 (Eligibility Inquiry) / 271 (Eligibility Response)

**Service**: `services/insurance-service.js`

```javascript
async checkEligibility(patientId, appointmentType, appointmentDate) {
  // 1. Get patient insurance
  const insurance = db.getPatientInsurance(patientId);
  
  // 2. Get payer information
  const payer = db.getPayerByPayerId(insurance.payer_id);
  
  // 3. Map appointment type to CPT code
  const cptCode = this.mapAppointmentTypeToCPT(appointmentType);
  
  // 4. Call Stedi API for eligibility check
  const eligibilityResponse = await this._callStediEligibility({
    payer_id: payer.payer_id,
    member_id: insurance.member_id,
    service_code: cptCode,
    date_of_service: appointmentDate
  });
  
  // 5. Parse and store eligibility data
  const eligibilityData = {
    patient_id: patientId,
    payer_id: payer.payer_id,
    member_id: insurance.member_id,
    eligible: eligibilityResponse.eligible,
    copay: eligibilityResponse.copay,
    allowed_amount: eligibilityResponse.allowedAmount,
    insurance_pays: eligibilityResponse.insurancePays,
    deductible_total: eligibilityResponse.deductibleTotal,
    deductible_remaining: eligibilityResponse.deductibleRemaining,
    coinsurance_percent: eligibilityResponse.coinsurancePercent,
    plan_summary: eligibilityResponse.planSummary
  };
  
  // 6. Store in database
  db.createEligibilityCheck(eligibilityData);
  
  return eligibilityData;
}
```

**Eligibility Data Retrieved**:

1. **Active Coverage** - Yes/No
2. **Copay Amount** - Patient's copay for visit type
3. **Allowed Amount** - Total amount insurance allows
4. **Insurance Pays** - Amount insurance covers
5. **Deductible Total** - Annual deductible
6. **Deductible Remaining** - How much left to meet
7. **Coinsurance Percent** - Percentage insurance covers after deductible
8. **Plan Summary** - General plan coverage details

**Database Storage**:

```sql
CREATE TABLE IF NOT EXISTS eligibility_checks (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  eligible BOOLEAN,
  copay REAL,
  allowed_amount REAL,
  insurance_pays REAL,
  deductible_total REAL,
  deductible_remaining REAL,
  coinsurance_percent REAL,
  plan_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES fhir_patients(resource_id)
);
```

### 3.4 Patient Balance Calculation

**Service**: `services/insurance-service.js`

```javascript
calculatePatientBalance(appointmentAmount, eligibilityData) {
  const { copay, deductible_remaining, coinsurance_percent, allowed_amount } = eligibilityData;
  
  let patientBalance = 0;
  
  // 1. If deductible not met, patient pays full amount (up to deductible)
  if (deductible_remaining > 0) {
    const deductiblePortion = Math.min(appointmentAmount, deductible_remaining);
    patientBalance += deductiblePortion;
    appointmentAmount -= deductiblePortion;
  }
  
  // 2. After deductible, apply copay
  if (appointmentAmount > 0 && copay > 0) {
    patientBalance += copay;
    appointmentAmount -= copay;
  }
  
  // 3. Apply coinsurance (patient pays remaining percentage)
  if (appointmentAmount > 0 && coinsurance_percent < 100) {
    const patientCoinsurance = appointmentAmount * (1 - coinsurance_percent / 100);
    patientBalance += patientCoinsurance;
  }
  
  return {
    total_appointment_cost: appointmentAmount + patientBalance,
    patient_copay: copay,
    patient_deductible: Math.min(deductible_remaining, appointmentAmount),
    patient_coinsurance: patientBalance - copay - Math.min(deductible_remaining, appointmentAmount),
    patient_total: patientBalance,
    insurance_pays: (appointmentAmount + patientBalance) - patientBalance
  };
}
```

### 3.5 Claim Submission (837)

**X12 Transaction**: 837 (Healthcare Claim)

**Service**: `services/insurance-service.js`

```javascript
async submitClaim(appointmentId, eligibilityData) {
  // 1. Get appointment details
  const appointment = db.getAppointment(appointmentId);
  
  // 2. Get patient and insurance info
  const patient = db.getFHIRPatient(appointment.patient_id);
  const insurance = db.getPatientInsurance(appointment.patient_id);
  
  // 3. Map to CPT and ICD-10 codes
  const cptCode = this.mapAppointmentTypeToCPT(appointment.appointment_type);
  const icd10Code = appointment.primary_icd10 || 'F41.1'; // Default if not from EHR
  
  // 4. Build X12 837 claim via Stedi
  const claimData = {
    payer_id: insurance.payer_id,
    member_id: insurance.member_id,
    patient_demographics: {
      name: appointment.patient_name,
      dob: patient.resource_data.birthDate,
      gender: patient.resource_data.gender
    },
    service: {
      cpt_code: cptCode,
      icd10_code: icd10Code,
      date_of_service: appointment.date,
      amount: appointmentAmount
    },
    provider: {
      npi: providerNPI,
      name: appointment.provider
    }
  };
  
  // 5. Submit to Stedi
  const claimResponse = await this._callStediSubmitClaim(claimData);
  
  // 6. Store claim
  db.createInsuranceClaim({
    appointment_id: appointmentId,
    patient_id: appointment.patient_id,
    payer_id: insurance.payer_id,
    claim_id: claimResponse.claim_id,
    status: 'submitted',
    amount: appointmentAmount,
    patient_responsibility: eligibilityData.patient_total,
    insurance_pays: eligibilityData.insurance_pays
  });
  
  return claimResponse;
}
```

### 3.6 Payer Caching (Cost Optimization)

**Service**: `services/payer-cache-service.js`

**Problem**: Stedi API calls are expensive. We cache payer data to minimize calls.

**Solution**:
```javascript
async searchPayer(payerName) {
  // 1. Check database cache first
  const cached = db.searchPayersByName(payerName);
  if (cached.length > 0) {
    return cached[0]; // Return cached result
  }
  
  // 2. If not cached, call Stedi API
  const stediPayers = await this._callStediSearchPayers(payerName);
  
  // 3. Cache results
  for (const payer of stediPayers) {
    db.upsertPayer(payer);
  }
  
  return stediPayers[0];
}
```

**Cache TTL**: 30 days (configurable)

---

## 4. Appointment Booking System

### 4.1 Booking Flow

**Voice Agent Function**: `schedule_appointment`

```javascript
// Retell function: schedule_appointment
{
  "type": "object",
  "properties": {
    "patient_name": { "type": "string" },
    "patient_phone": { "type": "string" },
    "patient_email": { "type": "string" },
    "date": { "type": "string", "format": "date" },
    "time": { "type": "string", "format": "time" },
    "appointment_type": { "type": "string" },
    "timezone": { "type": "string" },
    "notes": { "type": "string" }
  },
  "required": ["patient_name", "patient_phone", "date", "time"]
}
```

**Service**: `services/booking-service.js`

```javascript
async scheduleAppointment(bookingData) {
  // 1. Get or create patient
  const patient = await FHIRService.getOrCreatePatient({
    name: bookingData.patient_name,
    phone: bookingData.patient_phone,
    email: bookingData.patient_email
  });
  
  // 2. Check slot availability
  const availability = this._checkSlotAvailability(
    bookingData.date,
    bookingData.time,
    bookingData.appointment_type,
    bookingData.timezone
  );
  
  if (!availability.available) {
    throw new Error(`Slot not available: ${availability.reason}`);
  }
  
  // 3. Create appointment
  const appointment = {
    id: `appt-${uuidv4()}`,
    patient_name: bookingData.patient_name,
    patient_phone: bookingData.patient_phone,
    patient_email: bookingData.patient_email,
    patient_id: patient.id,
    appointment_type: bookingData.appointment_type || 'Mental Health Consultation',
    date: bookingData.date,
    time: bookingData.time,
    start_time: `${bookingData.date} ${bookingData.time}`,
    end_time: calculateEndTime(bookingData.date, bookingData.time, duration),
    duration_minutes: getDurationForType(bookingData.appointment_type),
    status: 'scheduled',
    notes: bookingData.notes
  };
  
  // 4. Store appointment
  db.createAppointment(appointment);
  
  // 5. Create Google Calendar event
  const calendarEvent = await GoogleCalendarService.createEvent(appointment);
  db.updateAppointment(appointment.id, {
    calendar_event_id: calendarEvent.id,
    calendar_link: calendarEvent.htmlLink
  });
  
  // 6. Send confirmation email
  await EmailService.sendAppointmentConfirmation(appointment);
  
  // 7. Create FHIR Encounter
  const encounter = FHIRResources.createEncounter({
    patient_id: patient.id,
    appointment_id: appointment.id,
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    status: 'planned'
  });
  db.createFHIREncounter(encounter);
  
  return appointment;
}
```

### 4.2 Complex Scheduling Logic

**Features**:
- **Appointment Types**: Different durations (30min, 50min, 60min)
- **Buffer Times**: Before and after appointments
- **Business Hours**: 9 AM - 5 PM
- **Timezone Support**: Handles different timezones

**Availability Check**:
```javascript
_checkSlotAvailability(date, time, appointmentType, timezone) {
  const typeConfig = APPOINTMENT_TYPES[appointmentType] || DEFAULT_TYPE;
  
  // 1. Calculate actual slot times (with buffer)
  const slotStart = new Date(`${date}T${time}`);
  const bufferBefore = typeConfig.buffer_before_minutes || 0;
  const bufferAfter = typeConfig.buffer_after_minutes || 0;
  
  const actualStart = new Date(slotStart.getTime() - bufferBefore * 60 * 1000);
  const actualEnd = new Date(slotStart.getTime() + typeConfig.duration_minutes * 60 * 1000 + bufferAfter * 60 * 1000);
  
  // 2. Check business hours
  if (slotStart.getHours() < BUSINESS_HOURS.start || 
      slotStart.getHours() >= BUSINESS_HOURS.end) {
    return { available: false, reason: 'Outside business hours' };
  }
  
  // 3. Check for conflicts with existing appointments
  const conflicts = db.prepare(`
    SELECT * FROM appointments 
    WHERE date = ? 
      AND status IN ('scheduled', 'confirmed')
      AND (
        (start_time <= ? AND end_time > ?) OR
        (start_time < ? AND end_time >= ?)
      )
  `).all(date, actualStart, actualStart, actualEnd, actualEnd);
  
  if (conflicts.length > 0) {
    return { available: false, reason: 'Time slot conflicts with existing appointment' };
  }
  
  return { available: true };
}
```

### 4.3 Appointment Status Flow

```
scheduled → confirmed → completed
    ↓
cancelled
```

**Status Updates**:
- **Scheduled**: Initial booking
- **Confirmed**: Payment received or manually confirmed
- **Completed**: Appointment finished
- **Cancelled**: Patient or provider cancelled

### 4.4 Reminder System

**Service**: `services/reminder-scheduler.js`

```javascript
async checkAndSendReminders() {
  // Find appointments 24 hours from now
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const appointments = db.prepare(`
    SELECT * FROM appointments 
    WHERE date = ? 
      AND status IN ('scheduled', 'confirmed')
      AND reminder_sent = 0
  `).all(tomorrowStr);
  
  for (const appt of appointments) {
    // Send reminder email
    await EmailService.sendAppointmentReminder(appt);
    
    // Mark as sent
    db.updateAppointment(appt.id, { reminder_sent: 1 });
  }
}
```

**Scheduler**: Runs every hour, checks for appointments 24 hours ahead.

---

## 5. EHR Integration (Epic & 1upHealth)

### 5.1 Overview

DocLittle can pull clinical data (ICD-10 codes, CPT codes, vitals) from EHR systems for accurate insurance billing.

### 5.2 Two Integration Options

#### Option 1: 1upHealth Aggregator (50+ EHRs)

**Service**: `services/ehr-aggregator-service.js`

**Why 1upHealth?**
- Single API for 50+ EHRs (Epic, Cerner, Athena, etc.)
- Free developer tier
- Automatic OAuth handling
- No per-EHR integration needed

**OAuth Flow**:
```javascript
// Generate OAuth URL
generateAuthUrl(ehrName, providerId) {
  const state = uuidv4();
  const authUrl = `${this.baseUrl}/connect/system/clinical?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&state=${state}`;
  
  // Store state for verification
  db.prepare(`
    INSERT INTO ehr_connections 
    (id, provider_id, ehr_name, state_token, auth_url, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), providerId, ehrName, state, authUrl);
  
  return { auth_url: authUrl, state: state };
}
```

**Fetching Clinical Data**:
```javascript
async fetchEncounters(connectionId, date) {
  const token = await this.getValidToken(connectionId);
  const response = await axios.get(
    `${this.baseUrl}/fhir/dstu2/Encounter?date=${date}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return response.data.entry || [];
}

async fetchConditions(connectionId, encounterId) {
  const token = await this.getValidToken(connectionId);
  const response = await axios.get(
    `${this.baseUrl}/fhir/dstu2/Condition?encounter=${encounterId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return response.data.entry || [];
}
```

#### Option 2: Epic Direct Integration

**Service**: `services/epic-adapter.js`

**Why Direct Epic?**
- Immediate testing (no waiting for 1upHealth)
- Direct control over Epic API
- Production ready

**Epic OAuth**:
```javascript
generateAuthUrl(providerId, patientId = null) {
  const state = uuidv4();
  const authUrl = `${this.getBaseUrl()}/oauth2/authorize`;
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
    state: state,
    scope: 'patient/Encounter.read patient/Condition.read patient/Procedure.read patient/Observation.read patient/Coverage.read offline_access',
    aud: this.getBaseUrl()
  });
  
  return { auth_url: `${authUrl}?${params.toString()}`, state: state };
}
```

**Epic FHIR API**:
```javascript
async fetchEncounters(connectionId, patientId, date) {
  const token = await this.getValidToken(connectionId);
  const fhirBaseUrl = this.getFhirBaseUrl(); // /api/FHIR/R4
  
  let url = `${fhirBaseUrl}/Encounter`;
  if (patientId) url += `?patient=${patientId}`;
  if (date) url += `${patientId ? '&' : '?'}date=${date}`;
  
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return response.data.entry || [];
}
```

### 5.3 EHR Sync Service

**Service**: `services/ehr-sync-service.js`

**Automatic Sync**:
- Polls connected EHRs every **2 minutes**
- Fetches completed encounters
- Matches to DocLittle appointments
- Extracts ICD-10 and CPT codes
- Stores in database

**Sync Flow**:
```javascript
async syncConnection(connectionId, date) {
  // 1. Fetch encounters from EHR
  const encounters = await ehrAggregator.fetchEncounters(connectionId, date);
  
  // 2. For each encounter
  for (const entry of encounters) {
    const encounter = entry.resource;
    
    // 3. Match to appointment
    const appointment = matchEncounterToAppointment(encounter, patientPhone, date);
    
    // 4. Fetch clinical data
    const conditions = await ehrAggregator.fetchConditions(connectionId, encounter.id);
    const procedures = await ehrAggregator.fetchProcedures(connectionId, encounter.id);
    const observations = await ehrAggregator.fetchObservations(connectionId, encounter.id);
    
    // 5. Extract codes
    const icdCodes = ehrAggregator.extractICDCodes(conditions);
    const cptCodes = ehrAggregator.extractCPTCodes(procedures);
    
    // 6. Store in database
    storeEHREncounter(encounter, appointment?.id);
    storeEHRConditions(icdCodes);
    storeEHRProcedures(cptCodes);
    
    // 7. Update appointment with codes
    if (appointment && icdCodes.length > 0) {
      db.updateAppointment(appointment.id, {
        primary_icd10: icdCodes[0].code,
        ehr_synced: true
      });
    }
  }
}
```

### 5.4 Code Extraction

**ICD-10 Extraction**:
```javascript
extractICDCodes(conditions) {
  const codes = [];
  conditions.forEach(entry => {
    const condition = entry.resource;
    if (condition.code?.coding) {
      condition.code.coding.forEach(coding => {
        if (coding.system === 'http://hl7.org/fhir/sid/icd-10-cm' ||
            coding.code?.match(/^[A-Z][0-9]{2}/)) {
          codes.push({
            code: coding.code,
            display: coding.display,
            primary: condition.severity?.text === 'primary'
          });
        }
      });
    }
  });
  return codes;
}
```

**CPT Extraction**:
```javascript
extractCPTCodes(procedures) {
  const codes = [];
  procedures.forEach(entry => {
    const procedure = entry.resource;
    if (procedure.code?.coding) {
      procedure.code.coding.forEach(coding => {
        if (coding.system === 'http://www.ama-assn.org/go/cpt' ||
            coding.code?.match(/^[0-9]{5}/)) {
          codes.push({
            code: coding.code,
            display: coding.display,
            modifier: procedure.modifier?.map(m => m.coding?.[0]?.code).join(',')
          });
        }
      });
    }
  });
  return codes;
}
```

### 5.5 Database Storage

**EHR Tables**:
```sql
-- EHR connections (OAuth tokens)
CREATE TABLE ehr_connections (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  ehr_name TEXT NOT NULL,  -- 'epic' or '1uphealth'
  access_token TEXT,
  refresh_token TEXT,
  expires_at DATETIME,
  connected_at DATETIME
);

-- EHR encounters
CREATE TABLE ehr_encounters (
  id TEXT PRIMARY KEY,
  fhir_encounter_id TEXT UNIQUE,
  patient_id TEXT NOT NULL,
  appointment_id TEXT,  -- Links to DocLittle appointment
  start_time DATETIME,
  end_time DATETIME,
  status TEXT,
  raw_json TEXT
);

-- ICD-10 codes
CREATE TABLE ehr_conditions (
  id TEXT PRIMARY KEY,
  ehr_encounter_id TEXT NOT NULL,
  icd10_code TEXT NOT NULL,
  description TEXT,
  is_primary BOOLEAN
);

-- CPT codes
CREATE TABLE ehr_procedures (
  id TEXT PRIMARY KEY,
  ehr_encounter_id TEXT NOT NULL,
  cpt_code TEXT NOT NULL,
  modifier TEXT,
  description TEXT
);
```

---

## 6. Complete Inbound Call Flow

### 6.1 End-to-End Call Journey

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Call Initiated                                      │
└─────────────────────────────────────────────────────────────┘
Patient calls → Retell AI receives call
                ↓
            POST /voice/incoming
                ↓
        Create/Get FHIR Patient
                ↓
        Return agent config

┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Agent Greeting & Information Collection             │
└─────────────────────────────────────────────────────────────┘
Agent: "Hi, thanks for calling DocLittle..."
    ↓
Collects:
  - Patient name
  - Phone number (already have from call)
  - Email address
  - Insurance information (optional)
    ↓
Function: collect_insurance (if patient has insurance)
    ↓
Stores insurance in patient_insurance table

┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Appointment Booking                                 │
└─────────────────────────────────────────────────────────────┘
Agent: "What day works for you?"
    ↓
Function: get_available_slots(date)
    ↓
Agent: "We have slots at 9 AM, 2 PM, 4 PM..."
    ↓
Patient: "2 PM works"
    ↓
Function: schedule_appointment(...)
    ↓
System:
  1. Checks slot availability
  2. Creates appointment record
  3. Creates Google Calendar event
  4. Creates FHIR Encounter
  5. Sends confirmation email
    ↓
Agent: "Great! You're scheduled for [date] at [time]..."

┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Insurance Eligibility Check (if insurance provided)│
└─────────────────────────────────────────────────────────────┘
Function: check_eligibility(patient_id, appointment_type)
    ↓
System:
  1. Gets patient insurance
  2. Calls Stedi API (270/271)
  3. Calculates:
     - Copay
     - Deductible remaining
     - Coinsurance
     - Patient balance
  4. Stores eligibility data
    ↓
Agent: "Your insurance covers this. Your copay is $20..."

┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Payment Processing                                  │
└─────────────────────────────────────────────────────────────┘
Agent: "How would you like to pay?"
    ↓
Function: create_checkout(...)
    ↓
System:
  1. Creates payment token
  2. Generates verification code
  3. Sends email with verification code
    ↓
Patient receives email → Enters code
    ↓
POST /voice/checkout/verify
    ↓
System:
  1. Validates code
  2. Sends payment link email
    ↓
Patient clicks link → Pays via Stripe
    ↓
Webhook: Payment successful
    ↓
System:
  1. Updates appointment status to 'confirmed'
  2. Creates transaction record
  3. Sends confirmation

┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Call Completion                                     │
└─────────────────────────────────────────────────────────────┘
Agent: "Is there anything else I can help with?"
    ↓
Call ends
    ↓
POST /webhook/retell/end-of-call
    ↓
System:
  1. Updates call statistics
  2. Logs call summary
  3. Triggers reminder scheduler (if needed)

┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Post-Call (After Appointment)                      │
└─────────────────────────────────────────────────────────────┘
Appointment happens
    ↓
Provider marks as 'completed' in EHR
    ↓
EHR Sync Service (every 2 minutes):
  1. Detects completed encounter in Epic/1upHealth
  2. Matches to DocLittle appointment
  3. Pulls ICD-10 and CPT codes
  4. Stores in database
    ↓
System:
  1. Updates appointment.primary_icd10
  2. Updates appointment.primary_cpt
  3. Marks appointment.ehr_synced = true
    ↓
Auto-Submit Insurance Claim:
  1. Builds X12 837 claim with codes
  2. Submits via Stedi API
  3. Stores claim record
    ↓
Insurance processes claim (1-2 days)
    ↓
Provider receives payment
```

### 6.2 Key API Endpoints

**Voice Agent Endpoints**:
```
POST /voice/incoming                    # Call initiated
POST /voice/appointments/available-slots # Check availability
POST /voice/appointments/schedule        # Book appointment
POST /voice/appointments/confirm         # Confirm booking
POST /voice/appointments/cancel          # Cancel booking
POST /voice/insurance/collect            # Collect insurance
POST /voice/insurance/check-eligibility  # Check coverage
POST /voice/appointments/checkout        # Create payment
POST /voice/checkout/verify              # Verify payment code
```

**EHR Endpoints**:
```
GET  /api/ehr/epic/connect              # Epic OAuth
GET  /api/ehr/epic/callback              # Epic OAuth callback
POST /api/ehr/epic/sync                  # Sync Epic data
GET  /api/ehr/connect                    # 1upHealth OAuth
GET  /api/ehr/oauth/callback             # 1upHealth callback
POST /api/ehr/sync/encounters            # Sync encounters
```

**Admin Endpoints**:
```
GET /api/admin/appointments              # List appointments
GET /api/admin/patients/:id/insurance    # Patient insurance
GET /api/admin/patients/:id/eligibility  # Eligibility data
GET /api/admin/appointments/:id/ehr-summary # EHR data
GET /api/admin/billing                   # Billing overview
```

### 6.3 Data Flow Diagram

```
Voice Call
    ↓
Retell AI Agent
    ↓
Function Calls → DocLittle API
    ↓
    ├─→ FHIR Service → fhir_patients
    ├─→ Booking Service → appointments
    ├─→ Insurance Service → eligibility_checks, insurance_claims
    ├─→ Payment Service → voice_checkouts, transactions
    └─→ EHR Sync Service → ehr_encounters, ehr_conditions, ehr_procedures
    ↓
Database (SQLite)
    ↓
Google Calendar (appointments)
Stripe (payments)
Stedi (insurance)
Epic/1upHealth (EHR data)
```

---

## 7. Additional Features

### 7.1 Reminder System

- **24-hour reminders** sent via email
- **1-hour before** reminder with cancellation option
- Automatic scheduling via `ReminderScheduler`

### 7.2 Provider Dashboard

- **Today's Schedule**: Real-time appointment list
- **Next Patient**: Upcoming appointment details
- **Live Stats**: Completion rates, cancellations
- **EHR Data**: Clinical codes from EHR

### 7.3 Patient Self-Service Portal

- **Phone Verification**: SMS-based login
- **View Appointments**: Upcoming and past
- **Reschedule/Cancel**: Self-service options
- **Profile View**: Personal information (read-only)

### 7.4 Analytics & Reporting

- **No-show tracking**
- **Revenue trends**
- **Booking sources**
- **Peak hours analysis**

---

## 8. Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3)
- **Voice**: Retell AI
- **Payment**: Stripe
- **Insurance**: Stedi API (X12 EDI)
- **EHR**: Epic FHIR API, 1upHealth Aggregator
- **Calendar**: Google Calendar API
- **Email**: Nodemailer
- **SMS**: Twilio (optional)
- **Data Standard**: FHIR R4

---

## 9. Security & Compliance

- **FHIR R4** compliant patient records
- **PHI masking** in UI
- **Secure API** endpoints (HTTPS)
- **Audit logging** for all data access
- **HIPAA considerations** (encryption, access controls)

---

**Last Updated**: November 6, 2024  
**Document Version**: 1.0


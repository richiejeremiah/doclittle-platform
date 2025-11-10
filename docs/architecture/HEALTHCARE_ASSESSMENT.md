# Healthcare Use Case Assessment

## Overview
Deep assessment of Voice Agent, FHIR, Payment, EPIC, Stedi, Circle, and Stripe integrations for healthcare appointment booking and billing.

---

## 1. Voice Agent (Retell) Assessment

### ✅ **What's Working**

1. **Appointment Endpoints Exist**:
   - `POST /voice/appointments/schedule` ✅
   - `POST /voice/appointments/confirm` ✅
   - `POST /voice/appointments/cancel` ✅
   - `POST /voice/appointments/reschedule` ✅
   - `POST /voice/appointments/available-slots` ✅
   - `POST /voice/appointments/search` ✅

2. **Checkout/Payment Endpoints**:
   - `POST /voice/appointments/checkout` ✅
   - `POST /voice/checkout/verify` ✅

3. **Insurance Endpoints**:
   - `POST /voice/insurance/collect` ✅
   - `POST /voice/insurance/check-eligibility` ✅
   - `POST /voice/insurance/submit-claim` ✅

### ❌ **Critical Issues**

#### **Issue 1: Missing Retell LLM WebSocket Handler**
- **Problem**: Retell requires an LLM WebSocket endpoint (`/webhook/retell/llm`) to handle function calls
- **Current State**: Only event webhooks exist (`/webhook/retell/events`, `/webhook/retell/end-of-call`)
- **Impact**: Voice agent CANNOT call functions (schedule_appointment, collect_insurance, etc.)
- **Location**: `configure-retell.js` references `llm_websocket_url` but handler doesn't exist
- **Fix Needed**: Implement WebSocket handler in `webhooks/retell-websocket.js` or create new handler

#### **Issue 2: Retell Functions Not Exposed**
- **Problem**: The voice agent prompt (`tiba-voice-agent-prompt.md`) defines functions, but they're not exposed to Retell
- **Functions Needed**:
  - `collect_insurance` → `POST /voice/insurance/collect`
  - `schedule_appointment` → `POST /voice/appointments/schedule`
  - `get_available_slots` → `POST /voice/appointments/available-slots`
  - `search_appointments` → `POST /voice/appointments/search`
  - `confirm_appointment` → `POST /voice/appointments/confirm`
  - `cancel_appointment` → `POST /voice/appointments/cancel`
  - `reschedule_appointment` → `POST /voice/appointments/reschedule`
  - `create_appointment_checkout` → `POST /voice/appointments/checkout`
  - `verify_checkout_code` → `POST /voice/checkout/verify`
  - `get_patient_claims` → `GET /api/patient/benefits` or similar
- **Fix Needed**: Expose functions via Retell's function calling API

#### **Issue 3: Retell Agent Configuration Mismatch**
- **Problem**: `configure-retell.js` has generic "voice shopping" prompt, not healthcare-specific
- **Current Prompt**: "Help customers find products they're looking for..."
- **Expected Prompt**: Should use `tiba-voice-agent-prompt.md` content
- **Fix Needed**: Update Retell agent configuration with healthcare-specific prompt

### 🔧 **Recommended Fixes**

1. **Implement Retell LLM WebSocket Handler**:
   ```javascript
   // webhooks/retell-llm-websocket.js
   // Handle WebSocket connections from Retell
   // Parse function calls and route to appropriate endpoints
   // Return function results to Retell
   ```

2. **Expose Functions to Retell**:
   ```javascript
   // In Retell agent configuration, add:
   general_tools: [
     {
       type: 'function',
       name: 'collect_insurance',
       description: 'Collect and verify insurance information',
       parameters: { ... }
     },
     {
       type: 'function',
       name: 'schedule_appointment',
       description: 'Schedule a new appointment',
       parameters: { ... }
     },
     // ... etc
   ]
   ```

3. **Update Retell Agent Prompt**:
   - Use content from `tiba-voice-agent-prompt.md`
   - Configure as "Selma" healthcare assistant
   - Set proper system persona and rules

---

## 2. FHIR Integration Assessment

### ✅ **What's Working**

1. **FHIR Service Layer** (`services/fhir-service.js`):
   - `getOrCreatePatient()` ✅
   - `createEncounter()` ✅
   - `createCommunication()` ✅
   - `createObservation()` ✅
   - `getPatientEverything()` ✅

2. **FHIR API Endpoints** (`routes/fhir.js`):
   - `GET /fhir/Patient` ✅
   - `POST /fhir/Patient` ✅
   - `GET /fhir/Patient/:id` ✅
   - `GET /fhir/Patient/:id/$everything` ✅
   - `GET /fhir/Encounter` ✅
   - `POST /fhir/Encounter` ✅
   - `GET /fhir/metadata` ✅

3. **FHIR Integration in Booking**:
   - `BookingService.scheduleAppointment()` creates FHIR Patient and Encounter ✅
   - Voice calls create FHIR Encounter via `FHIRAdapter.retellCallToFHIR()` ✅

### ⚠️ **Issues**

1. **FHIR Patient Linking**:
   - Appointments link to FHIR patients via `patient_id` ✅
   - But patient lookup by phone/email could be improved
   - **Recommendation**: Add patient search by phone/email in voice agent flow

2. **FHIR Resource Updates**:
   - Encounters are created but not always updated (e.g., when appointment status changes)
   - **Recommendation**: Update Encounter status when appointment is confirmed/cancelled

---

## 3. Patient Wallet Assessment

### ✅ **What's Working**

1. **Circle USDC Wallet**:
   - `POST /api/circle/wallets` - Create wallet ✅
   - `GET /api/circle/accounts/:entityType/:entityId` - Get balance ✅
   - `POST /api/patient/wallet/deposit` - Deposit money ✅
   - `POST /api/patient/wallet/pay-claim` - Pay claim from wallet ✅
   - `GET /api/patient/wallet/transactions` - Get transaction history ✅

2. **Circle Service** (`services/circle-service.js`):
   - Wallet creation ✅
   - Balance checking ✅
   - USDC transfers ✅
   - Webhook verification ✅

### ❌ **Critical Issues**

#### **Issue 1: Patient Wallet Not Linked to FHIR Patient**
- **Problem**: Wallets are created with `entityId` but not linked to FHIR Patient resource
- **Impact**: Cannot easily find patient wallet from FHIR Patient ID
- **Fix Needed**: Link wallet `entityId` to FHIR Patient `resource_id`

#### **Issue 2: No Stripe Integration for Patient Wallet**
- **Problem**: Patient wallet only supports Circle USDC, not Stripe
- **Impact**: Patients cannot fund wallet with credit card
- **Fix Needed**: Add Stripe payment method to fund patient wallet

#### **Issue 3: Wallet Not Used in Appointment Payment Flow**
- **Problem**: Appointment checkout uses email verification → Stripe link, not wallet
- **Impact**: Patient wallet balance is not used for appointments
- **Fix Needed**: Add wallet payment option to appointment checkout

### 🔧 **Recommended Fixes**

1. **Link Wallet to FHIR Patient**:
   ```javascript
   // When creating wallet, store FHIR patient_id
   wallet = {
     entityType: 'patient',
     entityId: fhirPatientId, // Use FHIR patient resource_id
     description: `Patient wallet for ${patientName}`
   }
   ```

2. **Add Stripe Wallet Funding**:
   ```javascript
   // POST /api/patient/wallet/fund
   // Accept Stripe payment
   // Transfer to Circle wallet
   ```

3. **Add Wallet Payment Option**:
   ```javascript
   // In appointment checkout, check wallet balance
   // If sufficient, offer wallet payment
   // Otherwise, use Stripe
   ```

---

## 4. EPIC API Integration Assessment

### ❌ **Critical Issues**

#### **Issue 1: EPIC Integration Not Fully Implemented**
- **Problem**: EPIC adapter exists (`services/epic-adapter.js`) but endpoints are minimal
- **Current State**: 
  - `GET /api/ehr/epic/connect` exists
  - `GET /api/ehr/epic/callback` exists
  - `POST /api/ehr/epic/sync` exists
- **Missing**: Actual EPIC API calls to fetch patient data, encounters, etc.
- **Fix Needed**: Implement EPIC FHIR API integration

#### **Issue 2: No EPIC Patient Data Sync**
- **Problem**: EPIC patient data is not synced to local FHIR database
- **Impact**: Cannot access EPIC patient records in voice agent
- **Fix Needed**: Sync EPIC patients to local FHIR database

#### **Issue 3: No EPIC Encounter Sync**
- **Problem**: EPIC encounters are not synced to local database
- **Impact**: Cannot view EPIC encounters in dashboard
- **Fix Needed**: Sync EPIC encounters to local database

### 🔧 **Recommended Fixes**

1. **Implement EPIC FHIR API Client**:
   ```javascript
   // services/epic-adapter.js
   // - Authenticate with EPIC OAuth2
   // - Fetch patient data from EPIC FHIR API
   // - Sync to local FHIR database
   ```

2. **Add EPIC Patient Sync**:
   ```javascript
   // POST /api/ehr/epic/sync/patients
   // Fetch patients from EPIC
   // Create/update local FHIR Patient resources
   ```

3. **Add EPIC Encounter Sync**:
   ```javascript
   // POST /api/ehr/epic/sync/encounters
   // Fetch encounters from EPIC
   // Create/update local FHIR Encounter resources
   ```

---

## 5. Stedi API Integration Assessment

### ❌ **Critical Issues**

#### **Issue 1: Stedi API Not Fully Integrated**
- **Problem**: Stedi service exists (`services/insurance-service.js`) but uses mock data
- **Current State**: 
  - `POST /voice/insurance/collect` - Stores insurance info ✅
  - `POST /voice/insurance/check-eligibility` - Uses mock data ❌
  - `POST /voice/insurance/submit-claim` - Uses mock data ❌
- **Missing**: Actual Stedi API calls for eligibility and claims
- **Fix Needed**: Implement Stedi API integration (requires Stedi API access)

#### **Issue 2: No Real Insurance Verification**
- **Problem**: Insurance eligibility checks return mock data
- **Impact**: Cannot verify real insurance coverage
- **Fix Needed**: Integrate with Stedi Eligibility API

#### **Issue 3: No Real Claim Submission**
- **Problem**: Claim submission uses mock data
- **Impact**: Cannot submit real claims to insurance
- **Fix Needed**: Integrate with Stedi Claims API

### 🔧 **Recommended Fixes**

1. **Implement Stedi Eligibility API**:
   ```javascript
   // services/insurance-service.js
   // - Call Stedi Eligibility API
   // - Parse X12 EDI response
   // - Store eligibility results
   ```

2. **Implement Stedi Claims API**:
   ```javascript
   // services/insurance-service.js
   // - Generate X12 EDI 837 claim
   // - Submit to Stedi Claims API
   // - Track claim status
   ```

3. **Add Stedi Payer Cache**:
   ```javascript
   // Already exists: services/payer-cache-service.js
   // - Cache payer information from Stedi
   // - Reduce API calls
   ```

---

## 6. Stripe Integration Assessment

### ✅ **What's Working**

1. **Stripe Payment Processing**:
   - `POST /api/payment/process` - Process payment ✅
   - `GET /payment/:token` - Payment page ✅
   - `POST /webhook/stripe` - Webhook handler ✅

2. **Stripe Service** (`services/payment-service.js`):
   - Payment token generation ✅
   - Checkout retrieval ✅
   - Payment processing ✅

### ⚠️ **Issues**

1. **Stripe Not Used in Patient Wallet**:
   - Patient wallet only uses Circle USDC
   - **Recommendation**: Add Stripe funding option

2. **Stripe Not Used in Direct Payment**:
   - Appointment checkout uses email verification → link
   - **Recommendation**: Add direct Stripe payment option (Payment Intent)

---

## 7. Appointment Booking Workflow Assessment

### ✅ **What's Working**

1. **Booking Service** (`services/booking-service.js`):
   - `scheduleAppointment()` ✅
   - `confirmAppointment()` ✅
   - `cancelAppointment()` ✅
   - `rescheduleAppointment()` ✅
   - `getAvailableSlots()` ✅
   - Google Calendar integration ✅
   - FHIR Patient creation ✅

2. **Appointment Endpoints**:
   - All voice endpoints exist ✅
   - All return proper responses ✅

### ⚠️ **Issues**

1. **Insurance Calculation in Appointment**:
   - Appointment checkout calculates patient responsibility ✅
   - But insurance eligibility is not always checked before booking
   - **Recommendation**: Always check insurance eligibility before booking

2. **Appointment Reminders**:
   - Reminder scheduler exists ✅
   - But may not be sending reminders
   - **Recommendation**: Test reminder functionality

---

## 8. Testing Recommendations

### **Test 1: Voice Agent Function Calls**
```bash
# Test that Retell can call functions
# 1. Call voice agent
# 2. Ask to schedule appointment
# 3. Verify function is called
# 4. Verify appointment is created
```

### **Test 2: Patient Wallet Integration**
```bash
# Test patient wallet with FHIR patient
# 1. Create FHIR patient
# 2. Create patient wallet (linked to FHIR patient)
# 3. Deposit money to wallet
# 4. Pay appointment from wallet
# 5. Verify wallet balance updated
```

### **Test 3: EPIC Integration**
```bash
# Test EPIC patient sync
# 1. Connect to EPIC
# 2. Sync patients from EPIC
# 3. Verify patients in local FHIR database
# 4. Verify appointments linked to EPIC patients
```

### **Test 4: Stedi Integration**
```bash
# Test Stedi insurance verification
# 1. Collect insurance information
# 2. Check eligibility via Stedi API
# 3. Verify eligibility results
# 4. Submit claim via Stedi API
# 5. Verify claim status
```

---

## 9. Priority Fixes

### **High Priority** (Blocking Voice Agent)
1. ✅ **Implement Retell LLM WebSocket Handler** - Voice agent cannot call functions without this
2. ✅ **Expose Functions to Retell** - Voice agent needs functions to be exposed
3. ✅ **Update Retell Agent Configuration** - Use healthcare-specific prompt

### **Medium Priority** (Enhancing Functionality)
4. ✅ **Link Patient Wallet to FHIR Patient** - Need to link wallets to patients
5. ✅ **Add Stripe Wallet Funding** - Patients need to fund wallets with credit cards
6. ✅ **Add Wallet Payment Option** - Use wallet balance for appointments

### **Low Priority** (Future Enhancements)
7. ✅ **Implement EPIC API Integration** - Requires EPIC API access
8. ✅ **Implement Stedi API Integration** - Requires Stedi API access (user mentioned needs payment)
9. ✅ **Add Direct Stripe Payment** - Enhance payment options

---

## 10. What I'm Struggling With / Need Help

### **1. Retell LLM WebSocket Handler**
- **Issue**: Need to implement WebSocket handler for Retell function calls
- **Question**: Do you have Retell API documentation for LLM WebSocket protocol?
- **Help Needed**: Retell WebSocket message format and function calling protocol

### **2. Retell Function Exposure**
- **Issue**: Need to expose functions to Retell agent
- **Question**: How are functions exposed in Retell? Via agent configuration or WebSocket?
- **Help Needed**: Retell function calling API documentation

### **3. EPIC API Access**
- **Issue**: EPIC integration requires EPIC API access
- **Question**: Do you have EPIC API credentials? Epic FHIR endpoint?
- **Help Needed**: EPIC API credentials and endpoint information

### **4. Stedi API Access**
- **Issue**: Stedi integration requires Stedi API access (you mentioned needs payment)
- **Question**: When will Stedi API access be available?
- **Help Needed**: Stedi API credentials when available

### **5. Patient Wallet Testing**
- **Issue**: Need to test patient wallet with real Circle API
- **Question**: Do you have Circle API credentials configured?
- **Help Needed**: Circle API test credentials or sandbox access

---

## 11. Next Steps

1. **Implement Retell LLM WebSocket Handler** (High Priority)
2. **Expose Functions to Retell** (High Priority)
3. **Update Retell Agent Configuration** (High Priority)
4. **Test Voice Agent Function Calls** (High Priority)
5. **Link Patient Wallet to FHIR Patient** (Medium Priority)
6. **Add Stripe Wallet Funding** (Medium Priority)
7. **Test Patient Wallet Integration** (Medium Priority)
8. **Implement EPIC API Integration** (Low Priority - when API access available)
9. **Implement Stedi API Integration** (Low Priority - when API access available)

---

## Summary

### **What's Good** ✅
- Appointment booking endpoints exist and work
- FHIR integration is solid
- Patient wallet infrastructure exists
- Payment processing works
- Insurance endpoints exist

### **What's Missing** ❌
- Retell LLM WebSocket handler (CRITICAL - blocks voice agent)
- Retell function exposure (CRITICAL - blocks voice agent)
- Patient wallet linked to FHIR patients
- Stripe wallet funding
- EPIC API integration (needs API access)
- Stedi API integration (needs API access)

### **What Needs Testing** 🧪
- Voice agent function calls
- Patient wallet integration
- EPIC patient sync
- Stedi insurance verification
- Appointment booking with insurance

---

**Status**: Ready for testing after implementing Retell LLM WebSocket handler and function exposure.


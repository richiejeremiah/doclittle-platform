# DocLittle Architecture Review: Medical Coding Integration

**Date**: November 6, 2024  
**Status**: Medical Coding System Built, Integration Pending

---

## 📊 Executive Summary

**Current State**: 
- ✅ Medical coding pipeline (70/20/10 tiered system) is **fully built and tested**
- ✅ Knowledge base (CPT codes, ICD-10 references, simple rules) is **loaded**
- ✅ EHR sync service pulls clinical data from Epic/1upHealth
- ⚠️ **GAP**: Medical coding is **NOT automatically triggered** when EHR data arrives
- ⚠️ **GAP**: Coded results are **NOT stored** in appointments table
- ⚠️ **GAP**: Coded results are **NOT used** for claim generation

**What Works**:
- Voice agent → Appointment booking → Payment → Confirmation ✅
- EHR sync pulls ICD-10/CPT from Epic ✅
- Medical coding can process clinical notes ✅

**What's Missing**:
- EHR sync → Medical coding trigger ❌
- Medical coding → Appointment update ❌
- Medical coding → Claim generation ❌

---

## 🔄 Complete System Flow (Current State)

### Phase 1: Voice Call → Appointment Booking ✅

```
1. Patient Calls
   ↓
2. Retell AI Voice Agent
   ↓
3. Collect Patient Info (name, phone, email, insurance)
   ↓
4. Create/Update FHIR Patient Record
   ↓
5. Check Available Slots
   ↓
6. Schedule Appointment
   ↓
7. Create FHIR Encounter (voice call)
   ↓
8. Check Insurance Eligibility (Stedi 270/271)
   ↓
9. Create Checkout (email verification)
   ↓
10. Verify Email Code
   ↓
11. Send Payment Link
   ↓
12. Payment Success → Appointment Confirmed
   ↓
13. Send Confirmation Email
   ↓
14. Schedule Reminder (1 hour before)
```

**Status**: ✅ **FULLY WORKING**

---

### Phase 2: EHR Sync → Clinical Data Pull ✅

```
1. EHR Sync Service (runs every 2 minutes)
   ↓
2. Poll Epic/1upHealth for finished encounters
   ↓
3. Match encounter to DocLittle appointment
   ↓
4. Pull Conditions (ICD-10 codes)
   ↓
5. Pull Procedures (CPT codes)
   ↓
6. Pull Observations (vitals, notes)
   ↓
7. Store in ehr_encounters, ehr_conditions, ehr_procedures
   ↓
8. Update appointment.primary_icd10, appointment.primary_cpt
   ↓
9. Set appointment.ehr_synced = 1
```

**Status**: ✅ **FULLY WORKING** (but codes come from EHR, not AI coding)

**Location**: `services/ehr-sync-service.js` → `syncEncounterData()`

---

### Phase 3: Medical Coding Pipeline ✅ (Standalone)

```
1. Clinical Note Available
   ↓
2. Coding Orchestrator Classifies:
   - SIMPLE (70%) → Deterministic rules
   - MODERATE (20%) → RAG-like keyword matching
   - COMPLEX (10%) → Groq LLM API
   ↓
3. Returns ICD-10 + CPT codes with rationale
   ↓
4. Results stored in... ❌ NOWHERE (test only)
```

**Status**: ✅ **BUILT & TESTED** (but not integrated into workflow)

**Location**: 
- `services/coding-orchestrator.js`
- `services/medical-coding-service.js`
- `services/knowledge-service.js`

---

## 🚨 Critical Integration Gaps

### Gap 1: EHR Sync → Medical Coding Trigger ❌

**Current Behavior**:
- EHR sync pulls ICD-10/CPT codes directly from EHR
- Medical coding pipeline exists but is never called

**What Should Happen**:
```javascript
// In ehr-sync-service.js → syncEncounterData()
async syncEncounterData(connectionId, encounter, appointmentId, patientId) {
  // ... existing code to pull conditions/procedures ...
  
  // NEW: If EHR doesn't have codes, or if we want AI validation
  if (icdCodes.length === 0 || cptCodes.length === 0) {
    // Get clinical note from encounter or observations
    const clinicalNote = this.extractClinicalNote(encounter);
    
    // Trigger medical coding
    const codingResult = await codingOrchestrator.runCodingPipeline({
      clinicalNote: clinicalNote,
      appointmentType: appointment.appointment_type,
      durationMinutes: appointment.duration_minutes,
      patientContext: { /* patient history */ }
    });
    
    // Store AI-suggested codes
    // ... update database ...
  }
}
```

**Missing**: 
- Clinical note extraction from EHR encounter
- Call to `coding-orchestrator.runCodingPipeline()`
- Storage of AI coding results

---

### Gap 2: Medical Coding Results → Database Storage ❌

**Current State**:
- Medical coding returns ICD-10/CPT codes
- Results are only used in test scripts
- No database table for AI coding results

**What Should Happen**:
```sql
-- New table needed:
CREATE TABLE ai_coding_results (
  id TEXT PRIMARY KEY,
  appointment_id TEXT,
  ehr_encounter_id TEXT,
  band TEXT, -- 'SIMPLE', 'MODERATE', 'COMPLEX'
  icd10_codes TEXT, -- JSON array
  cpt_codes TEXT, -- JSON array
  rationale TEXT,
  confidence REAL,
  model_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (ehr_encounter_id) REFERENCES ehr_encounters(id)
);
```

**Missing**:
- `ai_coding_results` table
- Database methods to store coding results
- Link coding results to appointments

---

### Gap 3: Medical Coding → Appointment Update ❌

**Current State**:
- `appointments` table has `primary_icd10` and `primary_cpt` columns
- These are only updated from EHR sync (direct EHR codes)
- AI coding results are never written to appointments

**What Should Happen**:
```javascript
// After medical coding completes
if (codingResult.icd10.length > 0) {
  const primaryICD = codingResult.icd10[0].code;
  db.prepare(`
    UPDATE appointments 
    SET primary_icd10 = ?, ai_coded = 1
    WHERE id = ?
  `).run(primaryICD, appointmentId);
}

if (codingResult.cpt.length > 0) {
  const primaryCPT = codingResult.cpt[0].code;
  db.prepare(`
    UPDATE appointments 
    SET primary_cpt = ?, ai_coded = 1
    WHERE id = ?
  `).run(primaryCPT, appointmentId);
}
```

**Missing**:
- `ai_coded` column in appointments table
- Logic to update appointments with AI coding results
- Decision logic: EHR codes vs AI codes (priority/validation)

---

### Gap 4: Medical Coding → Claim Generation ❌

**Current State**:
- Stedi claim submission exists (X12 837)
- Claims use codes from EHR or manual entry
- AI coding results are never used for claims

**What Should Happen**:
```javascript
// In insurance-service.js → generateClaim()
async generateClaim(appointmentId) {
  const appointment = db.getAppointment(appointmentId);
  
  // Priority: EHR codes > AI codes > Manual
  const icd10 = appointment.primary_icd10 || 
                aiCodingResult.primary_icd10 || 
                manualCode;
  const cpt = appointment.primary_cpt || 
              aiCodingResult.primary_cpt || 
              manualCode;
  
  // Build X12 837 claim with codes
  // Submit to Stedi
}
```

**Missing**:
- Integration of AI coding results into claim builder
- Priority logic for code selection
- Validation of AI codes before claim submission

---

## 📁 Current File Structure

### Medical Coding Services ✅

```
services/
├── coding-orchestrator.js      ✅ Classifies & orchestrates coding
├── medical-coding-service.js   ✅ Groq LLM integration
└── knowledge-service.js        ✅ CPT/ICD-10 knowledge base

Knowledge/
├── CPT/
│   └── 2025_DHS_Code_List_Addendum_11_26_2024.txt  ✅ 235 codes loaded
├── rules/
│   └── simple-coding-rules.json                     ✅ Deterministic rules
└── icd10_reference.json                             ✅ Mental health codes
```

### EHR Integration Services ✅

```
services/
├── ehr-aggregator-service.js   ✅ 1upHealth integration
├── ehr-sync-service.js         ✅ Background sync (every 2 min)
└── epic-adapter.js             ✅ Direct Epic FHIR integration
```

### Database Schema ✅

```sql
-- EHR tables
ehr_encounters      ✅ Stores pulled encounters
ehr_conditions      ✅ Stores ICD-10 codes from EHR
ehr_procedures      ✅ Stores CPT codes from EHR
ehr_observations    ✅ Stores vitals/notes

-- Appointment table
appointments
  ├── primary_icd10  ✅ Column exists
  ├── primary_cpt    ✅ Column exists
  └── ehr_synced     ✅ Column exists

-- Missing
ai_coding_results   ❌ Table doesn't exist
```

---

## 🔗 Integration Points Needed

### 1. EHR Sync → Medical Coding Hook

**File**: `services/ehr-sync-service.js`  
**Function**: `syncEncounterData()`  
**Line**: ~180-302

**Change Needed**:
```javascript
const codingOrchestrator = require('./coding-orchestrator');

async syncEncounterData(...) {
  // ... existing code ...
  
  // NEW: Extract clinical note
  const clinicalNote = this.extractClinicalNote(encounter, observationEntries);
  
  // NEW: If EHR codes missing or want AI validation
  if (icdCodes.length === 0 || cptCodes.length === 0 || process.env.USE_AI_CODING === 'true') {
    const codingResult = await codingOrchestrator.runCodingPipeline({
      clinicalNote: clinicalNote,
      appointmentType: appointment?.appointment_type || 'Unknown',
      durationMinutes: appointment?.duration_minutes || 60,
      patientContext: {
        patientId: patientId,
        appointmentId: appointmentId
      }
    });
    
    // Store AI coding results
    await this.storeAICodingResults(appointmentId, ehrEncounterId, codingResult);
  }
}
```

---

### 2. Database Schema Update

**File**: `database.js`  
**Location**: After EHR tables (~line 355)

**Change Needed**:
```sql
-- Add AI coding results table
CREATE TABLE IF NOT EXISTS ai_coding_results (
  id TEXT PRIMARY KEY,
  appointment_id TEXT,
  ehr_encounter_id TEXT,
  band TEXT NOT NULL, -- 'SIMPLE', 'MODERATE', 'COMPLEX'
  icd10_codes TEXT NOT NULL, -- JSON array
  cpt_codes TEXT NOT NULL, -- JSON array
  rationale TEXT,
  confidence REAL,
  model_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (ehr_encounter_id) REFERENCES ehr_encounters(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_coding_appointment_id ON ai_coding_results(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ai_coding_encounter_id ON ai_coding_results(ehr_encounter_id);

-- Add ai_coded column to appointments
ALTER TABLE appointments ADD COLUMN ai_coded BOOLEAN DEFAULT 0;
```

---

### 3. Database Methods

**File**: `database.js`  
**Location**: After EHR methods

**Change Needed**:
```javascript
// Add to database.js exports
createAICodingResult: (result) => {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO ai_coding_results 
    (id, appointment_id, ehr_encounter_id, band, icd10_codes, cpt_codes, 
     rationale, confidence, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    result.appointment_id,
    result.ehr_encounter_id,
    result.band,
    JSON.stringify(result.icd10),
    JSON.stringify(result.cpt),
    result.rationale,
    result.confidence || null,
    result.model_used || null
  );
  return id;
},

getAICodingResultByAppointment: (appointmentId) => {
  return db.prepare(`
    SELECT * FROM ai_coding_results 
    WHERE appointment_id = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(appointmentId);
},
```

---

### 4. Appointment Update Logic

**File**: `services/ehr-sync-service.js`  
**Function**: `storeAICodingResults()` (new)

**Change Needed**:
```javascript
async storeAICodingResults(appointmentId, ehrEncounterId, codingResult) {
  // Store in ai_coding_results table
  db.createAICodingResult({
    appointment_id: appointmentId,
    ehr_encounter_id: ehrEncounterId,
    band: codingResult.band,
    icd10: codingResult.icd10,
    cpt: codingResult.cpt,
    rationale: codingResult.rationale,
    confidence: codingResult.confidence,
    model_used: codingResult.details?.model
  });
  
  // Update appointment if no EHR codes exist
  const appointment = db.getAppointment(appointmentId);
  if (!appointment.primary_icd10 && codingResult.icd10.length > 0) {
    db.prepare(`
      UPDATE appointments 
      SET primary_icd10 = ?, ai_coded = 1
      WHERE id = ?
    `).run(codingResult.icd10[0].code, appointmentId);
  }
  
  if (!appointment.primary_cpt && codingResult.cpt.length > 0) {
    db.prepare(`
      UPDATE appointments 
      SET primary_cpt = ?, ai_coded = 1
      WHERE id = ?
    `).run(codingResult.cpt[0].code, appointmentId);
  }
}
```

---

## 🎯 Priority Actions

### Immediate (Required for Integration)

1. **Create `ai_coding_results` table** in `database.js`
2. **Add `ai_coded` column** to `appointments` table
3. **Add database methods** for storing/retrieving AI coding results
4. **Extract clinical note** from EHR encounter/observations
5. **Hook medical coding** into `ehr-sync-service.js`
6. **Store AI coding results** after pipeline completes
7. **Update appointments** with AI codes when EHR codes missing

### Short-term (Enhancement)

8. **Add API endpoint** to manually trigger coding for an appointment
9. **Add UI display** of AI coding results in provider dashboard
10. **Add validation** comparing EHR codes vs AI codes
11. **Add confidence thresholds** for auto-accepting AI codes

### Long-term (Optimization)

12. **Integrate AI coding** into claim generation priority logic
13. **Add human-in-the-loop** review workflow for COMPLEX cases
14. **Track coding accuracy** metrics (EHR vs AI agreement)
15. **Expand knowledge base** with full ICD-10 and CPT manuals

---

## 📊 Current Test Coverage

### ✅ What's Tested

- Medical coding pipeline (70/20/10 buckets) → `tests/test-medical-coding-buckets.js`
- Groq API connection → `tests/test-groq-connection.js`
- EHR sync service → `tests/test-ehr-integration.js`
- Epic FHIR integration → `tests/test-epic-integration.js`
- End-to-end flow (voice → booking → payment) → `tests/test-e2e-complete-flow.js`

### ❌ What's NOT Tested

- EHR sync → Medical coding trigger
- AI coding results → Database storage
- AI coding results → Appointment update
- AI coding results → Claim generation

---

## 🔍 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    VOICE AGENT FLOW                          │
│  Patient Call → Retell → Booking → Payment → Confirmation   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Appointment     │
                    │  (scheduled)    │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    EHR SYNC FLOW                             │
│  Poll EHR → Pull Encounter → Extract Codes → Store         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  EHR Codes      │
                    │  (ICD-10/CPT)  │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  ❌ GAP HERE    │
                    │  No AI Coding   │
                    │  Trigger        │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              MEDICAL CODING PIPELINE (Standalone)            │
│  Clinical Note → Classify → Code → Return Results            │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  ❌ GAP HERE    │
                    │  Results Not   │
                    │  Stored        │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    CLAIM GENERATION                          │
│  Appointment → Codes → X12 837 → Stedi → Submit            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Summary

**You have built a sophisticated medical coding system** that can:
- Classify encounters into Simple/Moderate/Complex
- Apply deterministic rules for 70% of cases
- Use RAG-like matching for 20% of cases
- Call Groq LLM for 10% of complex cases
- Return ICD-10 and CPT codes with rationale

**However, this system is currently isolated** and not integrated into the main workflow. The EHR sync service pulls codes directly from EHRs, and the medical coding pipeline is only used in test scripts.

**To complete the integration**, you need to:
1. Hook medical coding into EHR sync when codes are missing
2. Store AI coding results in the database
3. Update appointments with AI codes
4. Use AI codes in claim generation

**Estimated effort**: 2-3 hours of focused development to close all gaps.

---

**Next Steps**: 
1. Review this architecture document
2. Decide on integration approach (EHR codes priority vs AI codes priority)
3. Implement the 4 critical gaps identified above
4. Test end-to-end: EHR sync → AI coding → Appointment update → Claim generation


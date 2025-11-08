# Epic FHIR Data Extraction - Status Report

**Date**: November 6, 2024  
**Status**: ✅ **Enhanced for Clinical Note Extraction**

---

## 📊 Summary

**Question**: Can we extract clinical data from Epic FHIR for medical coding?

**Answer**: ✅ **YES** - We can extract data from Epic, but clinical notes require multiple FHIR resources.

---

## 🔍 What Data We Can Extract from Epic

### ✅ Currently Supported Resources

1. **Encounters** (`/Encounter`)
   - Status, dates, patient, provider
   - Reason codes (may contain visit reason)
   - Text field (may contain notes)

2. **Conditions** (`/Condition`)
   - ICD-10 diagnosis codes ✅
   - Condition descriptions
   - Severity and status

3. **Procedures** (`/Procedure`)
   - CPT procedure codes ✅
   - Procedure descriptions
   - Modifiers

4. **Observations** (`/Observation`)
   - Vitals (BP, temperature, etc.)
   - Clinical notes (in `note` field)
   - Value strings (may contain notes)
   - Interpretations

### 🆕 Newly Added Resources

5. **DocumentReference** (`/DocumentReference`)
   - Clinical documents
   - Visit notes
   - Discharge summaries
   - **Requires OAuth scope**: `patient/DocumentReference.read`

6. **DiagnosticReport** (`/DiagnosticReport`)
   - Lab results with conclusions
   - Clinical reports
   - **Requires OAuth scope**: `patient/DiagnosticReport.read`

---

## 🧬 Clinical Note Extraction Strategy

### Multi-Source Extraction

We extract clinical notes from **multiple FHIR resources** in priority order:

```
1. Encounter.text.div          → Visit summary
2. Encounter.reasonCode        → Visit reason
3. Observation.note            → Provider notes
4. Observation.valueString     → Long text observations
5. Observation.interpretation  → Clinical interpretations
6. DocumentReference.description → Document descriptions
7. DiagnosticReport.conclusion → Report conclusions
```

### Implementation

**File**: `services/epic-adapter.js`

**Method**: `extractClinicalNote(encounter, observations, documentReferences, diagnosticReports)`

```javascript
// Usage example
const clinicalNote = EpicAdapter.extractClinicalNote(
  encounter,
  observations,
  documentReferences,
  diagnosticReports
);
```

---

## 🔧 Enhanced Epic Adapter Methods

### New Methods Added

1. **`fetchDocumentReferences(connectionId, patientId, encounterId)`**
   - Fetches clinical documents from Epic
   - Returns array of DocumentReference resources

2. **`fetchDiagnosticReports(connectionId, patientId, encounterId)`**
   - Fetches diagnostic reports from Epic
   - Returns array of DiagnosticReport resources

3. **`extractClinicalNote(encounter, observations, documentReferences, diagnosticReports)`**
   - Extracts clinical notes from all available sources
   - Combines multiple sources into single note
   - Returns clean text (HTML tags removed)

### Updated OAuth Scopes

**Before**:
```
patient/Encounter.read patient/Condition.read patient/Procedure.read 
patient/Observation.read patient/Coverage.read offline_access
```

**After**:
```
patient/Encounter.read patient/Condition.read patient/Procedure.read 
patient/Observation.read patient/Coverage.read 
patient/DocumentReference.read patient/DiagnosticReport.read offline_access
```

---

## 🧪 Testing

### Test Script Created

**File**: `tests/test-epic-data-extraction.js`

**What it tests**:
1. ✅ Epic connection status
2. ✅ Fetch encounters
3. ✅ Fetch observations
4. ✅ Extract clinical notes
5. ✅ Fetch DocumentReference (if available)
6. ✅ Fetch DiagnosticReport (if available)

### How to Run

```bash
# Prerequisites
1. Set EPIC_CLIENT_ID in .env
2. Complete Epic OAuth flow (visit /api/ehr/epic/connect)
3. Run test:

cd middleware-platform
node tests/test-epic-data-extraction.js
```

---

## ⚠️ Limitations & Considerations

### 1. Epic Sandbox Data

- **Issue**: Epic sandbox may not have clinical notes in test data
- **Solution**: Test with real Epic instance or seeded test data

### 2. OAuth Scopes

- **Issue**: DocumentReference and DiagnosticReport require additional scopes
- **Solution**: ✅ Already added to OAuth request
- **Note**: Epic may restrict these scopes based on app type

### 3. Document Content

- **Issue**: DocumentReference.content.attachment may require separate fetch
- **Solution**: Current implementation extracts description and title
- **Future**: Add binary document fetch if needed

### 4. Encounter-Specific Notes

- **Issue**: Not all encounters have clinical notes
- **Solution**: Fallback to reason codes and observations
- **Future**: May need to fetch notes from linked resources

---

## 📋 Integration with EHR Sync Service

### Current Flow

```
EHR Sync → Fetch Encounter → Fetch Conditions/Procedures → Store Codes
```

### Enhanced Flow (With Clinical Notes)

```
EHR Sync → Fetch Encounter 
       → Fetch Conditions/Procedures 
       → Fetch Observations
       → Fetch DocumentReferences (optional)
       → Fetch DiagnosticReports (optional)
       → Extract Clinical Notes
       → Store Codes + Notes
       → Trigger Medical Coding (if codes missing)
```

---

## 🎯 Next Steps

### Immediate

1. ✅ **Enhanced Epic adapter** with clinical note extraction
2. ✅ **Added OAuth scopes** for DocumentReference/DiagnosticReport
3. ✅ **Created test script** for data extraction
4. ⏳ **Test with real Epic connection** (requires OAuth flow)

### Short-term

5. **Integrate into EHR sync service**
   - Update `ehr-sync-service.js` to fetch clinical notes
   - Store clinical notes in database
   - Trigger medical coding when codes are missing

6. **Add clinical note storage**
   - Add `clinical_note` column to `ehr_encounters` table
   - Store extracted notes for medical coding

7. **Test end-to-end**
   - Epic sync → Clinical note extraction → Medical coding

### Long-term

8. **Optimize note extraction**
   - Cache frequently accessed documents
   - Prioritize most relevant note sources
   - Handle large documents efficiently

9. **Add note quality checks**
   - Validate note length
   - Check for relevant clinical content
   - Filter out administrative notes

---

## 📊 Data Extraction Capabilities Matrix

| Resource | Status | Contains Codes | Contains Notes | Used For |
|----------|--------|---------------|----------------|----------|
| Encounter | ✅ | ❌ | ✅ | Visit context, reason |
| Condition | ✅ | ✅ ICD-10 | ❌ | Diagnosis codes |
| Procedure | ✅ | ✅ CPT | ❌ | Procedure codes |
| Observation | ✅ | ❌ | ✅ | Clinical notes, vitals |
| DocumentReference | ✅ | ❌ | ✅ | Clinical documents |
| DiagnosticReport | ✅ | ❌ | ✅ | Lab reports, conclusions |

---

## ✅ Conclusion

**Yes, we can extract clinical data from Epic FHIR**, including:

1. ✅ **ICD-10 codes** from Conditions
2. ✅ **CPT codes** from Procedures
3. ✅ **Clinical notes** from multiple sources (Observations, DocumentReference, DiagnosticReport)
4. ✅ **Visit context** from Encounters

**Next**: Integrate clinical note extraction into EHR sync service and trigger medical coding when codes are missing.

---

## 🔗 Related Files

- `services/epic-adapter.js` - Epic FHIR adapter with clinical note extraction
- `services/ehr-sync-service.js` - EHR sync service (needs integration)
- `services/coding-orchestrator.js` - Medical coding pipeline
- `tests/test-epic-data-extraction.js` - Test script for data extraction

---

**Status**: ✅ **Ready for Integration**


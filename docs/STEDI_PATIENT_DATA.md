# Stedi API - Patient Data Available

## Overview
**Stedi API does NOT store patient EHR/medical data.** It's a **transactional API** that facilitates X12 EDI communication with insurance payers (Blue Cross, Aetna, etc.). 

Stedi acts as a **middleware layer** that:
1. Translates your JSON requests into X12 EDI format (270, 271, 837, 276, 277)
2. Routes transactions to insurance payers
3. Translates payer responses back to JSON

---

## What Patient Data You CAN Pull from Stedi

### 1. **Insurance Eligibility & Benefits (270/271 Transaction)**

When you check eligibility, Stedi returns data from the insurance payer about the patient's **coverage and benefits**:

#### **Basic Eligibility Info:**
- ✅ **Active Coverage Status** - Is patient covered? (Yes/No)
- ✅ **Payer Name** - Insurance company name (e.g., "Blue Cross Blue Shield")
- ✅ **Member ID** - Patient's insurance member number
- ✅ **Group Number** - Insurance group/policy number
- ✅ **Coverage Dates** - Active coverage start/end dates

#### **Financial Benefits:**
- ✅ **Copay Amount** - Fixed amount patient pays per visit
- ✅ **Allowed Amount** - Maximum amount insurance will pay for service
- ✅ **Insurance Pays** - How much insurance will cover
- ✅ **Deductible Total** - Total annual deductible amount
- ✅ **Deductible Remaining** - How much deductible is left to meet
- ✅ **Coinsurance Percent** - Patient's % share after deductible (e.g., 20%)
- ✅ **Out-of-Pocket Maximum** - Maximum patient pays in a year

#### **Coverage Details:**
- ✅ **Plan Type** - HMO, PPO, EPO, etc.
- ✅ **Service Coverage** - What services are covered (mental health, primary care, etc.)
- ✅ **Network Status** - In-network vs. out-of-network coverage
- ✅ **Pre-authorization Required** - Does service need prior approval?

#### **Service-Specific Benefits:**
- ✅ **CPT Code Coverage** - Is specific procedure code (e.g., 90834) covered?
- ✅ **Service Limitations** - Visit limits, frequency restrictions
- ✅ **Exclusions** - What's NOT covered

---

### 2. **Claim Status Information (276/277 Transaction)**

When you submit a claim and check its status:

- ✅ **Claim Status** - Submitted, Approved, Denied, Paid, Pending
- ✅ **Payment Amount** - How much insurance paid
- ✅ **Payment Date** - When payment was issued
- ✅ **Denial Reason** - If denied, why?
- ✅ **Adjudication Date** - When claim was processed

---

## What Patient Data You CANNOT Pull from Stedi

❌ **Clinical/Medical Data:**
- No diagnoses (ICD-10 codes)
- No procedures performed (CPT codes)
- No lab results
- No medication history
- No visit notes/clinical documentation
- No vitals (blood pressure, weight, etc.)
- No allergies
- No medical history

❌ **Patient Demographics (Stored by Stedi):**
- Stedi doesn't store patient names, DOB, addresses
- You send this data TO Stedi, but Stedi doesn't maintain a patient database
- Patient data comes from YOUR system (DocLittle) or EHR

❌ **Appointment/Visit Data:**
- No appointment schedules
- No visit history
- No provider notes

---

## How Stedi Works in Your System

### **Current Flow:**

```
1. Patient calls → Voice agent collects:
   - Name, DOB, Member ID, Payer Name

2. System sends to Stedi (270 Request):
   {
     "patientName": "John Doe",
     "dateOfBirth": "1990-01-15",
     "memberId": "BCBS123456",
     "payerId": "BCBS",
     "serviceCode": "90834",
     "dateOfService": "2025-11-10"
   }

3. Stedi translates to X12 EDI → Sends to Insurance Payer

4. Insurance Payer responds with 271 (eligibility response)

5. Stedi translates back to JSON → Returns to DocLittle:
   {
     "eligible": true,
     "copay": 25.00,
     "allowedAmount": 150.00,
     "insurancePays": 125.00,
     "deductibleTotal": 2000.00,
     "deductibleRemaining": 500.00,
     "coinsurancePercent": 20,
     "planSummary": "PPO Plan - Mental Health Coverage"
   }
```

---

## Database Storage (What We Store)

When eligibility is checked, we store in `eligibility_checks` table:

```sql
- patient_id (links to fhir_patients)
- member_id
- payer_id
- service_code (CPT)
- date_of_service
- eligible (boolean)
- copay_amount
- allowed_amount
- insurance_pays
- deductible_total
- deductible_remaining
- coinsurance_percent
- plan_summary
- response_data (full JSON response)
```

---

## Summary

**Stedi API provides:**
- ✅ Insurance eligibility status
- ✅ Financial benefits (copay, deductible, coinsurance)
- ✅ Coverage details (plan type, network status)
- ✅ Claim status and payment info

**Stedi API does NOT provide:**
- ❌ Clinical/medical data (get from EHR like Epic)
- ❌ Patient demographics storage (you provide this)
- ❌ Visit/appointment history (stored in your system)

**For full patient data, you need:**
1. **Stedi** → Insurance/benefits data
2. **EHR (Epic/1upHealth)** → Clinical data, diagnoses, procedures
3. **Your System (DocLittle)** → Appointments, call records, FHIR patient records

---

## Example: Complete Patient Profile

```
PATIENT: John Doe
├── Demographics (from DocLittle/EHR)
│   ├── Name, DOB, Phone, Email
│   └── Address
├── Insurance (from Stedi)
│   ├── Member ID: BCBS123456
│   ├── Copay: $25
│   ├── Deductible: $500 remaining
│   └── Coverage: Active
├── Clinical Data (from Epic/EHR)
│   ├── Diagnoses: F41.1 (Anxiety)
│   ├── Procedures: 90834 (Psychotherapy)
│   └── Visit Notes
└── Appointments (from DocLittle)
    ├── Scheduled: 2025-11-10 2:00 PM
    └── History: 5 previous visits
```


# Amount Allowed Logic - Explanation

## What is "Amount Allowed"?

The **Amount Allowed** (also known as "Allowed Amount", "Allowable Charge", or "Negotiated Rate") is the maximum amount that an insurance plan will pay for a covered healthcare service. This is a critical concept in healthcare billing.

## How is Amount Allowed Determined?

### 1. **Provider Contracts** (Most Common)
- Insurance companies negotiate contracts with healthcare providers
- These contracts specify the maximum amount the insurance will pay for each service (CPT code)
- This amount is typically **lower** than the provider's standard "billed" charges
- Example: Provider bills $1,000, but contract allows only $850

### 2. **Fee Schedules**
- Insurance companies maintain fee schedules that list allowed amounts by:
  - CPT code (procedure code)
  - Geographic location
  - Provider type (in-network vs out-of-network)
- These schedules are updated periodically

### 3. **Usual, Customary, and Reasonable (UCR)**
- For out-of-network providers, insurance may determine allowed amounts based on:
  - What other providers in the same area charge for similar services
  - Industry standards
  - Historical data

## Is Amount Allowed from Stedi?

**No, Stedi does not determine the Amount Allowed.**

### What Stedi Provides:
1. **Eligibility Checks (270/271)**
   - Patient eligibility status
   - Deductible information (total and remaining)
   - Copay amounts
   - Coinsurance percentages
   - Plan benefits summary
   - **Does NOT provide allowed amounts for specific services**

2. **Claim Submission (837)**
   - Submit claims with billed charges
   - Send to insurance companies for adjudication

3. **Remittance Advice (835)**
   - **THIS is where you get Amount Allowed**
   - After insurance processes the claim, they send back an 835 ERA
   - The 835 contains:
     - Allowed amount for each service
     - How much the plan paid
     - Patient responsibility (deductible, copay, coinsurance)
     - Denials and adjustments

## Current Implementation

### For Now (Development/Testing):
Our system calculates Amount Allowed using a **simplified formula**:
- **In-network**: 85% of billed amount (typical industry standard)
- **Out-of-network**: 70% of billed amount (typical industry standard)

This is a placeholder until we have:
1. Fee schedule lookup by CPT code and payer
2. Provider contract rates
3. 835 ERA data from actual claim adjudication

### In Production:
To get **real** Amount Allowed, you need to:

1. **Submit the claim** to the insurance company (via Stedi 837)
2. **Wait for adjudication** (insurance processes the claim)
3. **Receive 835 ERA** (Electronic Remittance Advice)
4. **Parse the 835** to extract allowed amounts
5. **Update the claim** with real allowed amounts

## Calculation Flow

```
1. Provider bills: $1,000 (Amount Billed)
2. Insurance determines: $850 (Amount Allowed) ← From contract/fee schedule
3. Apply deductible: $750 (if remaining)
4. Apply copay: $35 (fixed amount)
5. Calculate coinsurance: 20% of ($850 - $750) = $20
6. Plan pays: $850 - $750 - $35 - $20 = $45
7. Patient owes: $750 + $35 + $20 = $805
```

## EOB Calculation Logic

Our `EOBCalculationService` calculates patient responsibility based on:

1. **Amount Billed**: From claim line items (CPT codes with charges)
2. **Amount Allowed**: Calculated or from 835 ERA (if available)
3. **Deductible**: From Stedi eligibility data (`deductible_remaining`)
4. **Copay**: From Stedi eligibility data (`copay_amount`)
5. **Coinsurance**: From Stedi eligibility data (`coinsurance_percent`)

### Calculation Order:
1. Apply deductible to allowed amount (up to remaining deductible)
2. Apply copay (fixed amount per service)
3. Calculate coinsurance (percentage of remaining after deductible)
4. Plan pays the remainder (allowed - deductible - copay - coinsurance)
5. Patient owes: deductible + copay + coinsurance

## Next Steps for Production

1. **Integrate 835 ERA Processing**
   - Set up webhook/listener for 835 files
   - Parse 835 data to extract allowed amounts
   - Update claims with real allowed amounts

2. **Fee Schedule Integration**
   - Maintain fee schedule database
   - Lookup allowed amounts by CPT code and payer
   - Update fee schedules periodically

3. **Provider Contract Rates**
   - Store provider-specific contract rates
   - Use contract rates when available
   - Fall back to fee schedule if no contract

4. **Real-time Eligibility with Estimated Allowed Amounts**
   - Some payers provide estimated allowed amounts in eligibility responses
   - Use these estimates for initial calculations
   - Update with actual amounts after claim adjudication

## Summary

- **Amount Allowed** = Maximum amount insurance will pay (from contract/fee schedule)
- **Stedi** = Facilitates data exchange, doesn't determine allowed amounts
- **835 ERA** = Source of truth for actual allowed amounts (after claim processing)
- **Current implementation** = Simplified calculation for development/testing
- **Production** = Need fee schedule lookup or 835 ERA processing


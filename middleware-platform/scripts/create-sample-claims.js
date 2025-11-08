/**
 * Create Sample Insurance Claims for Test Patients
 * 
 * This script creates sample insurance claims/EOB data for the test patients
 * to demonstrate the billing view.
 */

const db = require('../database');
const { v4: uuidv4 } = require('uuid');

async function createSampleClaims() {
  console.log('\n📋 CREATING SAMPLE INSURANCE CLAIMS...\n');

  // Get all patients
  const patients = db.db.prepare('SELECT resource_id, name, phone FROM fhir_patients').all();
  
  if (patients.length === 0) {
    console.log('⚠️  No patients found. Please run setup-patients-with-stedi-data.js first.');
    return;
  }

  // Get eligibility data for each patient
  const claims = [];

  for (const patient of patients) {
    const eligibility = db.getEligibilityChecksByPatient(patient.resource_id);
    
    if (eligibility && eligibility.length > 0) {
      const elig = eligibility[0];
      
      // Calculate EOB breakdown for Claim 1
      const amountBilled1 = elig.allowed_amount || 150.00;
      const allowedAmount1 = amountBilled1;
      const copay1 = elig.copay_amount || 25.00;
      
      let deductible1 = 0;
      let coinsurance1 = 0;
      let planPaid1 = 0;
      
      if (elig.eligible) {
        let remaining1 = allowedAmount1 - copay1;
        
        // Apply deductible
        if (elig.deductible_remaining !== null && elig.deductible_total > 0 && elig.deductible_remaining < elig.deductible_total) {
          const deductibleNeeded = elig.deductible_total - elig.deductible_remaining;
          deductible1 = Math.min(deductibleNeeded, remaining1);
          remaining1 = Math.max(0, remaining1 - deductible1);
        }
        
        // Apply coinsurance
        if (elig.coinsurance_percent && elig.coinsurance_percent > 0 && remaining1 > 0) {
          coinsurance1 = (remaining1 * elig.coinsurance_percent) / 100;
          remaining1 = Math.max(0, remaining1 - coinsurance1);
        }
        
        planPaid1 = remaining1;
      }

      // Claim 1: Initial Consultation
      const claim1 = {
        id: `claim_${uuidv4()}`,
        appointment_id: null,
        patient_id: patient.resource_id,
        member_id: elig.member_id,
        payer_id: elig.payer_id,
        service_code: '90834',
        diagnosis_code: 'F41.1',
        total_amount: amountBilled1,
        copay_amount: copay1,
        insurance_amount: planPaid1,
        status: elig.eligible ? 'approved' : 'denied',
        x12_claim_id: `X12-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        idempotency_key: `idem_${patient.resource_id}_${elig.service_code}_${new Date().toISOString().split('T')[0]}`,
        blockchain_proof: null,
        submitted_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        status_checked_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        approved_at: elig.eligible ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() : null,
        paid_at: elig.eligible ? new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() : null,
        response_data: JSON.stringify({
          allowed_amount: allowedAmount1,
          deductible_applied: deductible1,
          coinsurance_applied: coinsurance1,
          amount_not_covered: 0,
          claim_detail_codes: elig.eligible ? ['PAID', 'COVERED'] : ['DENIED']
        })
      };

      claims.push(claim1);

      // Claim 2: Follow-up (if eligible)
      if (elig.eligible) {
        // Calculate EOB breakdown for Claim 2
        const amountBilled2 = elig.allowed_amount ? elig.allowed_amount * 1.2 : 180.00;
        const allowedAmount2 = amountBilled2;
        const copay2 = elig.copay_amount || 25.00;
        
        // For claim 2, assume some deductible was used in claim 1
        // Update remaining deductible
        const updatedDeductibleRemaining = elig.deductible_remaining !== null 
          ? Math.max(0, elig.deductible_remaining - deductible1)
          : null;
        
        let deductible2 = 0;
        let coinsurance2 = 0;
        let planPaid2 = 0;
        
        let remaining2 = allowedAmount2 - copay2;
        
        // Apply remaining deductible if any
        if (updatedDeductibleRemaining !== null && updatedDeductibleRemaining < elig.deductible_total && updatedDeductibleRemaining > 0) {
          const deductibleNeeded2 = elig.deductible_total - updatedDeductibleRemaining;
          deductible2 = Math.min(deductibleNeeded2, remaining2);
          remaining2 = Math.max(0, remaining2 - deductible2);
        }
        
        // Apply coinsurance
        if (elig.coinsurance_percent && elig.coinsurance_percent > 0 && remaining2 > 0) {
          coinsurance2 = (remaining2 * elig.coinsurance_percent) / 100;
          remaining2 = Math.max(0, remaining2 - coinsurance2);
        }
        
        planPaid2 = remaining2;
        
        const claim2 = {
          id: `claim_${uuidv4()}`,
          appointment_id: null,
          patient_id: patient.resource_id,
          member_id: elig.member_id,
          payer_id: elig.payer_id,
          service_code: '90837',
          diagnosis_code: 'F41.1',
          total_amount: amountBilled2,
          copay_amount: copay2,
          insurance_amount: planPaid2,
          status: 'submitted',
          x12_claim_id: `X12-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          idempotency_key: `idem_${patient.resource_id}_90837_${new Date().toISOString().split('T')[0]}`,
          blockchain_proof: null,
          submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          status_checked_at: null,
          approved_at: null,
          paid_at: null,
          response_data: JSON.stringify({
            allowed_amount: allowedAmount2,
            deductible_applied: deductible2,
            coinsurance_applied: coinsurance2,
            amount_not_covered: 0,
            claim_detail_codes: ['PENDING', 'SUBMITTED']
          })
        };

        claims.push(claim2);
      }
    }
  }

  // Insert claims
  for (const claim of claims) {
    try {
      db.createInsuranceClaim(claim);
      console.log(`✅ Created claim ${claim.id} for patient ${claim.patient_id} - Status: ${claim.status}`);
    } catch (error) {
      console.error(`❌ Error creating claim ${claim.id}:`, error.message);
    }
  }

  console.log(`\n✅ Successfully created ${claims.length} sample claims\n`);
  return claims;
}

// Run the script
if (require.main === module) {
  createSampleClaims()
    .then(() => {
      console.log('✅ Setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createSampleClaims };


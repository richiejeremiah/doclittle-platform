/**
 * Setup Patients with Stedi Eligibility Data
 * 
 * This script:
 * 1. Cleans the database
 * 2. Creates test patients with FHIR resources
 * 3. Creates eligibility checks with Stedi coverage/benefits data
 */

const db = require('../database');
const FHIRService = require('../services/fhir-service');
const { v4: uuidv4 } = require('uuid');

async function setupPatientsWithStediData() {
  console.log('\n🧹 CLEANING DATABASE...\n');
  
  // Clean existing data (in proper order to respect foreign keys)
  try {
    db.db.exec(`
      DELETE FROM ehr_observations;
      DELETE FROM ehr_procedures;
      DELETE FROM ehr_conditions;
      DELETE FROM ehr_encounters;
      DELETE FROM eligibility_checks;
      DELETE FROM insurance_claims;
      DELETE FROM appointments;
      DELETE FROM fhir_encounters;
      DELETE FROM fhir_communications;
      DELETE FROM fhir_observations;
      DELETE FROM fhir_patients;
      DELETE FROM patient_insurance;
    `);
    console.log('✅ Database cleaned successfully');
  } catch (error) {
    console.error('❌ Error cleaning database:', error.message);
    throw error;
  }

  console.log('\n👥 CREATING TEST PATIENTS WITH STEDI DATA...\n');

  // Test patients with eligibility data
  const testPatients = [
    {
      name: 'John Smith',
      firstName: 'John',
      lastName: 'Smith',
      phone: '+15555550101',
      email: 'john.smith@example.com',
      birthDate: '1985-03-15',
      gender: 'male',
      eligibility: {
        eligible: true,
        copay: 25.00,
        allowedAmount: 150.00,
        insurancePays: 125.00,
        deductibleTotal: 2000.00,
        deductibleRemaining: 500.00,
        coinsurancePercent: 20,
        planSummary: 'PPO Plan - Mental Health Coverage',
        memberId: 'BCBS123456',
        payerId: 'BCBS'
      }
    },
    {
      name: 'Sarah Johnson',
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '+15555550102',
      email: 'sarah.johnson@example.com',
      birthDate: '1990-07-22',
      gender: 'female',
      eligibility: {
        eligible: true,
        copay: 30.00,
        allowedAmount: 175.00,
        insurancePays: 145.00,
        deductibleTotal: 1500.00,
        deductibleRemaining: 0.00,
        coinsurancePercent: 15,
        planSummary: 'HMO Plan - Comprehensive Coverage',
        memberId: 'AETNA789012',
        payerId: 'AETNA'
      }
    },
    {
      name: 'Michael Brown',
      firstName: 'Michael',
      lastName: 'Brown',
      phone: '+15555550103',
      email: 'michael.brown@example.com',
      birthDate: '1988-11-08',
      gender: 'male',
      eligibility: {
        eligible: true,
        copay: 20.00,
        allowedAmount: 140.00,
        insurancePays: 120.00,
        deductibleTotal: 3000.00,
        deductibleRemaining: 1200.00,
        coinsurancePercent: 25,
        planSummary: 'EPO Plan - Mental Health & Primary Care',
        memberId: 'UHG345678',
        payerId: 'UHG'
      }
    },
    {
      name: 'Emily Davis',
      firstName: 'Emily',
      lastName: 'Davis',
      phone: '+15555550104',
      email: 'emily.davis@example.com',
      birthDate: '1992-05-30',
      gender: 'female',
      eligibility: {
        eligible: true,
        copay: 35.00,
        allowedAmount: 200.00,
        insurancePays: 165.00,
        deductibleTotal: 1000.00,
        deductibleRemaining: 250.00,
        coinsurancePercent: 10,
        planSummary: 'Premium PPO - Full Coverage',
        memberId: 'CIGNA901234',
        payerId: 'CIGNA'
      }
    },
    {
      name: 'David Wilson',
      firstName: 'David',
      lastName: 'Wilson',
      phone: '+15555550105',
      email: 'david.wilson@example.com',
      birthDate: '1987-09-14',
      gender: 'male',
      eligibility: {
        eligible: false,
        copay: 0.00,
        allowedAmount: 0.00,
        insurancePays: 0.00,
        deductibleTotal: null,
        deductibleRemaining: null,
        coinsurancePercent: null,
        planSummary: 'Coverage Expired',
        memberId: 'BCBS567890',
        payerId: 'BCBS'
      }
    },
    {
      name: 'Jessica Martinez',
      firstName: 'Jessica',
      lastName: 'Martinez',
      phone: '+15555550106',
      email: 'jessica.martinez@example.com',
      birthDate: '1995-12-03',
      gender: 'female',
      eligibility: {
        eligible: true,
        copay: 15.00,
        allowedAmount: 120.00,
        insurancePays: 105.00,
        deductibleTotal: 500.00,
        deductibleRemaining: 0.00,
        coinsurancePercent: 0,
        planSummary: 'Basic Plan - Deductible Met',
        memberId: 'ANTHEM234567',
        payerId: 'ANTHEM'
      }
    }
  ];

  const createdPatients = [];

  for (const patientData of testPatients) {
    try {
      // Create FHIR patient
      const patientResource = await FHIRService.getOrCreatePatient({
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        phone: patientData.phone,
        email: patientData.email,
        birthDate: patientData.birthDate,
        gender: patientData.gender
      });

      console.log(`✅ Created patient: ${patientData.name} (${patientResource.id})`);

      // Create eligibility check
      const eligibilityRecord = {
        id: `elig_${uuidv4()}`,
        patient_id: patientResource.id,
        member_id: patientData.eligibility.memberId,
        payer_id: patientData.eligibility.payerId,
        service_code: '90834', // Psychotherapy CPT code
        date_of_service: new Date().toISOString().split('T')[0],
        eligible: patientData.eligibility.eligible ? 1 : 0,
        copay_amount: patientData.eligibility.copay,
        allowed_amount: patientData.eligibility.allowedAmount,
        insurance_pays: patientData.eligibility.insurancePays,
        deductible_total: patientData.eligibility.deductibleTotal,
        deductible_remaining: patientData.eligibility.deductibleRemaining,
        coinsurance_percent: patientData.eligibility.coinsurancePercent,
        plan_summary: patientData.eligibility.planSummary,
        response_data: JSON.stringify(patientData.eligibility),
        created_at: new Date().toISOString()
      };

      db.createEligibilityCheck(eligibilityRecord);
      console.log(`   📋 Created eligibility check for ${patientData.eligibility.payerId}`);

      createdPatients.push({
        patient: patientResource,
        eligibility: eligibilityRecord
      });

    } catch (error) {
      console.error(`❌ Error creating patient ${patientData.name}:`, error.message);
    }
  }

  console.log(`\n✅ Successfully created ${createdPatients.length} patients with Stedi eligibility data\n`);
  
  return createdPatients;
}

// Run the script
if (require.main === module) {
  setupPatientsWithStediData()
    .then(() => {
      console.log('✅ Setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupPatientsWithStediData };


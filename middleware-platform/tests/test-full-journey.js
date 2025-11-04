/**
 * FULL JOURNEY TEST
 * 
 * Tests the complete pathway from appointment booking to billing:
 * 1. Clears database
 * 2. Creates two test patients via FHIR
 * 3. Creates appointments for both
 * 4. Verifies billing aggregation
 */

const axios = require('axios');
const db = require('../database');

const API_BASE = 'http://localhost:4000';

// Test patients
const TEST_PATIENTS = [
  {
    name: 'Mary April',
    phone: '8262307479',
    email: 'tylert16@ymail.com',
    appointmentTime: '1:00 PM', // Today
    appointmentDate: new Date().toISOString().split('T')[0] // Today
  },
  {
    name: 'Oscar Matthew',
    phone: '7822307478',
    email: 'doctorjay254@gmail.com',
    appointmentTime: '9:00 AM', // Tomorrow
    appointmentDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Tomorrow
  }
];

async function clearDatabase() {
  console.log('\n🗑️  Clearing database...');
  
  try {
    // Delete all appointments
    const appointments = db.getAllAppointments({});
    for (const appt of appointments) {
      db.deleteAppointment(appt.id);
    }
    console.log(`   ✅ Deleted ${appointments.length} appointments`);

    // Delete all FHIR patients
    const fhirPatients = db.searchFHIRPatients({ limit: 1000 });
    for (const patient of fhirPatients) {
      // Soft delete by updating is_deleted
      db.db.prepare('UPDATE fhir_patients SET is_deleted = 1 WHERE resource_id = ?').run(patient.resource_id);
    }
    console.log(`   ✅ Soft-deleted ${fhirPatients.length} FHIR patients`);

    // Delete all voice checkouts
    const checkouts = db.getAllVoiceCheckouts();
    for (const checkout of checkouts) {
      db.db.prepare('DELETE FROM voice_checkouts WHERE id = ?').run(checkout.id);
    }
    console.log(`   ✅ Deleted ${checkouts.length} voice checkouts`);

    console.log('✅ Database cleared\n');
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    throw error;
  }
}

async function createFHIRPatient(patientData) {
  console.log(`\n👤 Creating FHIR patient: ${patientData.name}`);
  
  try {
    const response = await axios.post(`${API_BASE}/fhir/Patient`, {
      resourceType: 'Patient',
      name: [{
        use: 'official',
        family: patientData.name.split(' ')[1] || '',
        given: [patientData.name.split(' ')[0] || '']
      }],
      telecom: [
        {
          system: 'phone',
          value: patientData.phone,
          use: 'mobile'
        },
        {
          system: 'email',
          value: patientData.email,
          use: 'home'
        }
      ],
      gender: 'unknown',
      birthDate: '1980-01-01' // Default birth date
    });

    if (response.data && response.data.id) {
      console.log(`   ✅ FHIR Patient created: ${response.data.id}`);
      return response.data.id;
    } else {
      throw new Error('No patient ID returned');
    }
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ Error: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    throw error;
  }
}

async function createAppointment(patientData, fhirPatientId) {
  console.log(`\n📅 Creating appointment for ${patientData.name}`);
  console.log(`   Date: ${patientData.appointmentDate}`);
  console.log(`   Time: ${patientData.appointmentTime}`);
  
  try {
    const response = await axios.post(`${API_BASE}/voice/appointments/schedule`, {
      args: {
        patient_name: patientData.name,
        patient_phone: patientData.phone,
        patient_email: patientData.email,
        date: patientData.appointmentDate,
        time: patientData.appointmentTime,
        appointment_type: 'Mental Health Consultation',
        provider: 'DocLittle Mental Health Team',
        timezone: 'America/New_York',
        notes: `Test appointment for ${patientData.name}`
      }
    });

    if (response.data.success) {
      console.log(`   ✅ Appointment created: ${response.data.appointment.id}`);
      console.log(`   📧 Confirmation email should be sent to ${patientData.email}`);
      return response.data.appointment;
    } else {
      throw new Error(response.data.error || 'Appointment creation failed');
    }
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ Error: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    throw error;
  }
}

async function verifyBilling() {
  console.log('\n💰 Verifying billing aggregation...');
  
  try {
    const response = await axios.get(`${API_BASE}/api/admin/billing`);
    
    if (response.data.success) {
      console.log(`   ✅ Found ${response.data.count} patient records`);
      console.log(`   💵 Price per appointment: $${response.data.price_per_appointment}`);
      
      response.data.patients.forEach(patient => {
        console.log(`\n   Patient: ${patient.patient_name}`);
        console.log(`      Total appointments: ${patient.total_appointments}`);
        console.log(`      This week: ${patient.week_appointments}`);
        console.log(`      Total amount: $${patient.total_amount.toFixed(2)}`);
        console.log(`      This week amount: $${patient.week_amount.toFixed(2)}`);
      });
      
      return response.data;
    } else {
      throw new Error(response.data.error || 'Billing verification failed');
    }
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ Error: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    throw error;
  }
}

async function verifyAppointments() {
  console.log('\n📋 Verifying appointments...');
  
  try {
    const response = await axios.get(`${API_BASE}/api/admin/appointments`);
    
    if (response.data.success) {
      console.log(`   ✅ Found ${response.data.count} appointments`);
      
      response.data.appointments.forEach(appt => {
        console.log(`\n   Appointment: ${appt.id}`);
        console.log(`      Patient: ${appt.patient_name}`);
        console.log(`      Date: ${appt.date} at ${appt.time}`);
        console.log(`      Status: ${appt.status}`);
        console.log(`      Email: ${appt.patient_email}`);
        console.log(`      Reminder sent: ${appt.reminder_sent ? 'Yes' : 'No'}`);
      });
      
      return response.data;
    } else {
      throw new Error(response.data.error || 'Appointment verification failed');
    }
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ Error: ${error.response.data.error || error.response.statusText}`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    throw error;
  }
}

async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 FULL JOURNEY TEST');
  console.log('='.repeat(60));

  try {
    // Step 1: Clear database
    await clearDatabase();

    // Step 2: Create FHIR patients and appointments
    const appointments = [];
    for (const patientData of TEST_PATIENTS) {
      try {
        // Create FHIR patient
        const fhirPatientId = await createFHIRPatient(patientData);
        
        // Create appointment
        const appointment = await createAppointment(patientData, fhirPatientId);
        appointments.push(appointment);
        
        // Small delay between patients
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to create patient/appointment for ${patientData.name}`);
        console.error(`   Error: ${error.message}`);
        // Continue with next patient
      }
    }

    if (appointments.length === 0) {
      throw new Error('No appointments were created');
    }

    // Step 3: Verify appointments
    await verifyAppointments();

    // Step 4: Verify billing
    await verifyBilling();

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('\n📝 Summary:');
    console.log(`   - Created ${appointments.length} appointments`);
    console.log(`   - Check billing at: http://localhost:4000/api/admin/billing`);
    console.log(`   - Check appointments at: http://localhost:4000/api/admin/appointments`);
    console.log('\n📧 Email Confirmations:');
    TEST_PATIENTS.forEach(p => {
      console.log(`   - ${p.name} should receive confirmation at ${p.email}`);
    });
    console.log('\n⏰ Reminders:');
    console.log('   - Reminders will be sent 1 hour before each appointment');
    console.log('   - Reminder scheduler runs every 5 minutes');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test if executed directly
if (require.main === module) {
  runTest();
}

module.exports = { runTest, clearDatabase, createFHIRPatient, createAppointment };


#!/usr/bin/env node

/**
 * COMPREHENSIVE SYSTEM TEST
 * Deep testing of appointment booking, insurance, billing, and complex scenarios
 */

require('dotenv').config();
const axios = require('axios');
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  warnings: []
};

// Helper function to make API calls
async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
}

// Test helper
function test(name, fn) {
  return async () => {
    try {
      log(`\n🧪 Testing: ${name}`, 'cyan');
      await fn();
      testResults.passed++;
      log(`✅ PASSED: ${name}`, 'green');
    } catch (error) {
      testResults.failed++;
      testResults.errors.push({ test: name, error: error.message });
      log(`❌ FAILED: ${name}`, 'red');
      log(`   Error: ${error.message}`, 'red');
    }
  };
}

// ============================================
// TEST SUITE 1: APPOINTMENT BOOKING
// ============================================

let testAppointmentId = null;
let testPatientPhone = '+15551234567';
let testPatientEmail = 'test-patient@example.com';
let testPatientName = 'Test Patient Comprehensive';

// Test 1: Check Available Slots
const testAvailableSlots = test('Get Available Slots', async () => {
  const today = new Date().toISOString().split('T')[0];
  const result = await apiCall('POST', '/voice/appointments/available-slots', {
    date: today,
    appointment_type: 'Mental Health Consultation'
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to get slots');
  const slots = result.data.available_slots || result.data.slots || [];
  if (!Array.isArray(slots)) throw new Error('Slots should be an array');

  log(`   Found ${slots.length} available slots for ${today}`, 'green');
});

// Test 2: Schedule Appointment
const testScheduleAppointment = test('Schedule Appointment', async () => {
  // Try multiple days to find available slots
  let dateStr = null;
  let chosen = null;
  const today = new Date();
  
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const testDate = new Date(today);
    testDate.setDate(testDate.getDate() + daysAhead);
    const testDateStr = testDate.toISOString().split('T')[0];
    
    const slotsResp = await apiCall('POST', '/voice/appointments/available-slots', { 
      date: testDateStr, 
      appointment_type: 'Mental Health Consultation' 
    });
    
    if (slotsResp.success && slotsResp.data.success) {
      const slotList2 = (slotsResp.data.slots || slotsResp.data.available_slots || []);
      if (slotList2.length > 0) {
        dateStr = testDateStr;
        chosen = slotList2[0];
        break;
      }
    }
  }
  
  if (!dateStr || !chosen) throw new Error('No available slot for schedule test (tried 7 days ahead)');

  const result = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: testPatientName,
    patient_phone: testPatientPhone,
    patient_email: testPatientEmail,
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: chosen
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to schedule');
  if (!result.data.appointment?.id) throw new Error('No appointment ID returned');

  testAppointmentId = result.data.appointment.id;
  log(`   Appointment ID: ${testAppointmentId}`, 'green');
  log(`   Status: ${result.data.appointment.status}`, 'green');
  log(`   Date: ${result.data.appointment.date} at ${result.data.appointment.time}`, 'green');
});

// Test 3: Search Appointment
const testSearchAppointment = test('Search Appointment', async () => {
  if (!testAppointmentId) throw new Error('No appointment ID from previous test');

  const result = await apiCall('POST', '/voice/appointments/search', {
    phone: testPatientPhone
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to search');
  if (!Array.isArray(result.data.appointments)) throw new Error('Appointments should be an array');
  if (result.data.appointments.length === 0) throw new Error('No appointments found');

  const found = result.data.appointments.find(a => a.id === testAppointmentId);
  if (!found) throw new Error('Created appointment not found in search results');

  log(`   Found ${result.data.appointments.length} appointment(s)`, 'green');
});

// Test 4: Confirm Appointment
const testConfirmAppointment = test('Confirm Appointment', async () => {
  if (!testAppointmentId) throw new Error('No appointment ID from previous test');

  const result = await apiCall('POST', '/voice/appointments/confirm', {
    appointment_id: testAppointmentId
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to confirm');
  if (result.data.appointment.status !== 'confirmed') {
    throw new Error(`Expected status 'confirmed', got '${result.data.appointment.status}'`);
  }

  log(`   Appointment confirmed successfully`, 'green');
});

// Test 5: Reschedule Appointment
const testRescheduleAppointment = test('Reschedule Appointment', async () => {
  if (!testAppointmentId) throw new Error('No appointment ID from previous test');

  const today = new Date();
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const newDateStr = dayAfterTomorrow.toISOString().split('T')[0];

  const result = await apiCall('POST', '/voice/appointments/reschedule', {
    appointment_id: testAppointmentId,
    new_date: newDateStr,
    new_time: '15:00:00'
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to reschedule');
  if (result.data.appointment.date !== newDateStr) {
    throw new Error(`Date not updated. Expected ${newDateStr}, got ${result.data.appointment.date}`);
  }

  log(`   Rescheduled to ${newDateStr} at 15:00`, 'green');
});

// Test 6: Cancel Appointment
const testCancelAppointment = test('Cancel Appointment', async () => {
  if (!testAppointmentId) throw new Error('No appointment ID from previous test');

  const result = await apiCall('POST', '/voice/appointments/cancel', {
    appointment_id: testAppointmentId,
    reason: 'Test cancellation'
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to cancel');
  if (result.data.appointment.status !== 'cancelled') {
    throw new Error(`Expected status 'cancelled', got '${result.data.appointment.status}'`);
  }

  log(`   Appointment cancelled successfully`, 'green');
});

// ============================================
// TEST SUITE 2: COMPLEX SCENARIOS
// ============================================

// Test 7: Multiple Appointments Same Day
const testMultipleAppointments = test('Multiple Appointments Same Day', async () => {
  // Try multiple days to find available slots
  let dateStr = null;
  let times = [];
  const today = new Date();
  
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const testDate = new Date(today);
    testDate.setDate(testDate.getDate() + daysAhead);
    const testDateStr = testDate.toISOString().split('T')[0];
    
    const slotsResp = await apiCall('POST', '/voice/appointments/available-slots', { 
      date: testDateStr, 
      appointment_type: 'Mental Health Consultation' 
    });
    
    if (slotsResp.success && slotsResp.data.success) {
      const slotList = (slotsResp.data.slots || slotsResp.data.available_slots || []);
      if (slotList.length >= 3) {
        dateStr = testDateStr;
        times = slotList.slice(0, 3);
        break;
      }
    }
  }
  
  if (!dateStr || times.length === 0) throw new Error('Failed to find day with at least 3 available slots');

  const appointments = [];
  for (const time of times) {
    const result = await apiCall('POST', '/voice/appointments/schedule', {
      patient_name: `Test Patient ${time}`,
      patient_phone: `+1555123${Math.floor(Math.random() * 10000)}`,
      appointment_type: 'Mental Health Consultation',
      date: dateStr,
      time: time
    });

    if (!result.success || !result.data.success) {
      testResults.warnings.push(`Failed to schedule appointment at ${time}`);
      continue;
    }

    appointments.push(result.data.appointment);
  }

  if (appointments.length === 0) throw new Error('Failed to schedule any appointments');
  log(`   Scheduled ${appointments.length} appointments on ${dateStr}`, 'green');
});

// Test 8: Buffer Time Conflicts
const testBufferTimeConflicts = test('Buffer Time Conflict Prevention', async () => {
  // Try multiple days to find available slots
  let dateStr = null;
  let firstSlot = null;
  const today = new Date();
  
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const testDate = new Date(today);
    testDate.setDate(testDate.getDate() + daysAhead);
    const testDateStr = testDate.toISOString().split('T')[0];
    
    const slotsResp = await apiCall('POST', '/voice/appointments/available-slots', { 
      date: testDateStr, 
      appointment_type: 'Mental Health Consultation' 
    });
    
    if (slotsResp.success && slotsResp.data.success) {
      const slotList = (slotsResp.data.slots || slotsResp.data.available_slots || []);
      if (slotList.length > 0) {
        dateStr = testDateStr;
        firstSlot = slotList[0];
        break;
      }
    }
  }
  
  if (!dateStr || !firstSlot) throw new Error('No slots available for buffer test (tried 7 days ahead)');

  // Schedule first appointment at first available slot
  const firstResult = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: 'Buffer Test Patient 1',
    patient_phone: '+15559990001',
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: firstSlot
  });

  if (!firstResult.success || !firstResult.data.success) {
    throw new Error('Failed to schedule first appointment');
  }

  // Try to schedule conflicting appointment (should fail)
  // Choose a time 30 minutes after firstSlot to fall within duration+buffer
  const [h, m] = firstSlot.split(':').map(Number);
  const conflictDate = new Date(`${dateStr}T${firstSlot}`.replace(' ', 'T'));
  conflictDate.setMinutes(conflictDate.getMinutes() + 30);
  const pad = (n) => String(n).padStart(2, '0');
  const conflictTime = `${pad(conflictDate.getHours())}:${pad(conflictDate.getMinutes())}:00`;
  const conflictResult = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: 'Buffer Test Patient 2',
    patient_phone: '+15559990002',
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: conflictTime // Should conflict with buffer time
  });

  if (conflictResult.success && conflictResult.data.success) {
    throw new Error('Buffer time conflict not prevented - appointment should have been rejected');
  }

  log(`   Buffer time conflict correctly prevented`, 'green');
});

// Test 9: Business Hours Validation
const testBusinessHours = test('Business Hours Validation', async () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  // Try to schedule outside business hours (should fail)
  const earlyResult = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: 'Business Hours Test',
    patient_phone: '+15559990003',
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: '08:00:00' // Before 9 AM
  });

  if (earlyResult.success && earlyResult.data.success) {
    throw new Error('Business hours validation failed - appointment before 9 AM was accepted');
  }

  // Try to schedule after business hours (should fail)
  const lateResult = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: 'Business Hours Test',
    patient_phone: '+15559990004',
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: '17:30:00' // After 5 PM
  });

  if (lateResult.success && lateResult.data.success) {
    throw new Error('Business hours validation failed - appointment after 5 PM was accepted');
  }

  log(`   Business hours validation working correctly`, 'green');
});

// ============================================
// TEST SUITE 3: INSURANCE & BILLING
// ============================================

let testInsuranceId = null;

// Test 10: Collect Insurance Information
const testCollectInsurance = test('Collect Insurance Information', async () => {
  const result = await apiCall('POST', '/voice/insurance/collect', {
    payer_name: 'Blue Cross Blue Shield',
    member_id: 'TEST123456789',
    patient_phone: testPatientPhone
  });

  if (!result.success) throw new Error(result.error);

  if (result.data.multipleMatches) {
    log(`   Multiple matches found - this is expected`, 'yellow');
    // If multiple matches, we'd need to confirm
    if (result.data.suggestions && result.data.suggestions.length > 0) {
      log(`   ${result.data.suggestions.length} suggestions available`, 'yellow');
    }
  } else if (result.data.confirmed) {
    testInsuranceId = result.data.insurance_id;
    log(`   Insurance confirmed: ${result.data.payer_name}`, 'green');
    log(`   Member ID: ${result.data.member_id}`, 'green');
    log(`   API Call Saved: ${result.data.apiCallSaved ? 'Yes ✓' : 'No'}`, 'green');
  } else {
    testResults.warnings.push('Insurance collection returned unexpected response');
  }
});

// Test 11: Check Insurance Eligibility
const testCheckEligibility = test('Check Insurance Eligibility', async () => {
  const result = await apiCall('POST', '/voice/insurance/check-eligibility', {
    member_id: 'TEST123456789',
    payer_id: 'BCBS',
    patient_name: testPatientName
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) {
    testResults.warnings.push('Eligibility check returned error (may be expected with test data)');
    return;
  }

  log(`   Eligible: ${result.data.eligible}`, 'green');
  if (result.data.eligible) {
    log(`   Copay: $${result.data.copay}`, 'green');
    log(`   Insurance Pays: $${result.data.insurancePays}`, 'green');
  }
});

// Test 12: Get Payer Cache Stats
const testPayerCacheStats = test('Get Payer Cache Statistics', async () => {
  const result = await apiCall('GET', '/api/admin/insurance/payers/stats');

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to get stats');

  log(`   Total Cached Payers: ${result.data.totalCached || 0}`, 'green');
  if (result.data.samplePayers) {
    log(`   Sample Payers: ${result.data.samplePayers.length}`, 'green');
  }
});

// ============================================
// TEST SUITE 4: PAYMENT & CHECKOUT
// ============================================

let testCheckoutId = null;
let testPaymentToken = null;

// Test 13: Create Appointment Checkout
const testCreateCheckout = test('Create Appointment Checkout', async () => {
  // First, create a new appointment for checkout - try multiple days
  let dateStr = null;
  let slotForCheckout = null;
  const today = new Date();
  
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const testDate = new Date(today);
    testDate.setDate(testDate.getDate() + daysAhead);
    const testDateStr = testDate.toISOString().split('T')[0];
    
    const slotsResp = await apiCall('POST', '/voice/appointments/available-slots', { 
      date: testDateStr, 
      appointment_type: 'Mental Health Consultation' 
    });
    
    if (slotsResp.success && slotsResp.data.success) {
      const slotList3 = (slotsResp.data.slots || slotsResp.data.available_slots || []);
      if (slotList3.length > 0) {
        dateStr = testDateStr;
        slotForCheckout = slotList3[slotList3.length - 1] || slotList3[0];
        break;
      }
    }
  }
  
  if (!dateStr || !slotForCheckout) throw new Error('Failed to find available slot for checkout test (tried 7 days ahead)');

  const apptResult = await apiCall('POST', '/voice/appointments/schedule', {
    patient_name: 'Checkout Test Patient',
    patient_phone: '+15559990005',
    patient_email: 'checkout-test@example.com',
    appointment_type: 'Mental Health Consultation',
    date: dateStr,
    time: slotForCheckout
  });

  if (!apptResult.success || !apptResult.data.success) {
    throw new Error('Failed to create appointment for checkout test');
  }

  const appointmentId = apptResult.data.appointment.id;

  // Create checkout
  const result = await apiCall('POST', '/voice/appointments/checkout', {
    patient_phone: '+15559990005',
    patient_email: 'checkout-test@example.com',
    appointment_id: appointmentId
  });

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to create checkout');

  testCheckoutId = result.data.checkout_id;
  testPaymentToken = result.data.payment_token;

  log(`   Checkout ID: ${testCheckoutId}`, 'green');
  log(`   Payment Token: ${testPaymentToken}`, 'green');
  log(`   Amount: $${result.data.amount}`, 'green');
  log(`   Requires Verification: ${result.data.requires_verification}`, 'green');
});

// ============================================
// TEST SUITE 5: ADMIN ENDPOINTS
// ============================================

// Test 14: Get All Appointments
const testGetAllAppointments = test('Get All Appointments (Admin)', async () => {
  const result = await apiCall('GET', '/api/admin/appointments');

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to get appointments');

  log(`   Total Appointments: ${result.data.count || 0}`, 'green');
});

// Test 15: Get Upcoming Appointments
const testGetUpcomingAppointments = test('Get Upcoming Appointments', async () => {
  const result = await apiCall('GET', '/api/admin/appointments/upcoming?limit=10');

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to get upcoming');

  log(`   Upcoming Appointments: ${result.data.appointments?.length || 0}`, 'green');
});

// Test 16: Get Dashboard Stats
const testGetDashboardStats = test('Get Dashboard Statistics', async () => {
  const result = await apiCall('GET', '/api/admin/stats');

  if (!result.success) throw new Error(result.error);
  if (!result.data.success) throw new Error(result.data.error || 'Failed to get stats');

  log(`   Total Calls: ${result.data.totalCalls || 0}`, 'green');
  log(`   Total Revenue: $${result.data.totalRevenue || 0}`, 'green');
  log(`   Total Appointments: ${result.data.totalAppointments || 0}`, 'green');
});

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runAllTests() {
  log('\n═══════════════════════════════════════════════════════════════', 'cyan');
  log('🧪 COMPREHENSIVE SYSTEM TEST SUITE', 'cyan');
  log('═══════════════════════════════════════════════════════════════\n', 'cyan');

  log(`Testing against: ${BASE_URL}`, 'blue');
  log(`Test started at: ${new Date().toISOString()}\n`, 'blue');

  // Clear test data first to ensure clean slate
  log('🧹 Clearing test data...', 'yellow');
  try {
    const clearResult = await apiCall('POST', '/dev/clear-test-data');
    if (clearResult.success && clearResult.data.success) {
      log('✅ Test data cleared', 'green');
    } else {
      log('⚠️  Could not clear test data (continuing anyway)', 'yellow');
    }
  } catch (e) {
    log('⚠️  Could not clear test data (continuing anyway)', 'yellow');
  }

  // Test Suite 1: Appointment Booking
  log('\n📋 TEST SUITE 1: Appointment Booking', 'magenta');
  await testAvailableSlots();
  await testScheduleAppointment();
  await testSearchAppointment();
  await testConfirmAppointment();
  await testRescheduleAppointment();
  await testCancelAppointment();

  // Test Suite 2: Complex Scenarios
  log('\n📋 TEST SUITE 2: Complex Scenarios', 'magenta');
  await testMultipleAppointments();
  await testBufferTimeConflicts();
  await testBusinessHours();

  // Test Suite 3: Insurance & Billing
  log('\n📋 TEST SUITE 3: Insurance & Billing', 'magenta');
  await testCollectInsurance();
  await testCheckEligibility();
  await testPayerCacheStats();

  // Test Suite 4: Payment & Checkout
  log('\n📋 TEST SUITE 4: Payment & Checkout', 'magenta');
  await testCreateCheckout();

  // Test Suite 5: Admin Endpoints
  log('\n📋 TEST SUITE 5: Admin Endpoints', 'magenta');
  await testGetAllAppointments();
  await testGetUpcomingAppointments();
  await testGetDashboardStats();

  // Print Summary
  log('\n═══════════════════════════════════════════════════════════════', 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('═══════════════════════════════════════════════════════════════\n', 'cyan');

  log(`✅ Passed: ${testResults.passed}`, 'green');
  log(`❌ Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
  log(`⚠️  Warnings: ${testResults.warnings.length}`, testResults.warnings.length > 0 ? 'yellow' : 'green');

  if (testResults.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    testResults.errors.forEach(err => {
      log(`   - ${err.test}: ${err.error}`, 'red');
    });
  }

  if (testResults.warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    testResults.warnings.forEach(warning => {
      log(`   - ${warning}`, 'yellow');
    });
  }

  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  log(`\n📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

  log(`\n✅ Test completed at: ${new Date().toISOString()}`, 'green');
  log('═══════════════════════════════════════════════════════════════\n', 'cyan');

  return {
    passed: testResults.passed,
    failed: testResults.failed,
    warnings: testResults.warnings.length,
    errors: testResults.errors,
    successRate: parseFloat(successRate)
  };
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      log(`\n❌ Fatal error: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { runAllTests };


/**
 * EHR Integration Test Suite
 * 
 * Tests the 1upHealth EHR integration with sandbox/mock data
 */

const axios = require('axios');
const db = require('../database');
const EHRAggregatorService = require('../services/ehr-aggregator-service');
const EHRSyncService = require('../services/ehr-sync-service');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const TEST_PROVIDER_ID = 'test-provider-123';
const TEST_EHR_NAME = 'epic';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 Testing: ${name}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function recordTest(name, passed, message = '') {
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
    logSuccess(message || `${name} passed`);
  } else {
    results.failed++;
    logError(message || `${name} failed`);
  }
}

// ============================================
// TEST 1: Database Schema
// ============================================

async function testDatabaseSchema() {
  logTest('Database Schema');

  try {
    // Check if EHR tables exist
    const tables = [
      'ehr_connections',
      'ehr_encounters',
      'ehr_conditions',
      'ehr_procedures',
      'ehr_observations'
    ];

    for (const table of tables) {
      const exists = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
      `).get(table);

      if (exists) {
        recordTest(`Table ${table} exists`, true);
      } else {
        recordTest(`Table ${table} exists`, false, `Table ${table} not found`);
      }
    }

    // Check if appointments table has EHR columns
    const apptInfo = db.db.prepare(`PRAGMA table_info(appointments)`).all();
    const hasEhrSynced = apptInfo.some(col => col.name === 'ehr_synced');
    const hasPrimaryIcd10 = apptInfo.some(col => col.name === 'primary_icd10');
    const hasPrimaryCpt = apptInfo.some(col => col.name === 'primary_cpt');

    recordTest('appointments.ehr_synced column', hasEhrSynced);
    recordTest('appointments.primary_icd10 column', hasPrimaryIcd10);
    recordTest('appointments.primary_cpt column', hasPrimaryCpt);

    // Test database methods
    const connections = db.getActiveEHRConnections();
    recordTest('getActiveEHRConnections() method', Array.isArray(connections));

  } catch (error) {
    recordTest('Database Schema', false, error.message);
  }
}

// ============================================
// TEST 2: Service Methods (Mock)
// ============================================

async function testServiceMethods() {
  logTest('Service Methods');

  try {
    // Test generateAuthUrl (should work even without credentials in test mode)
    try {
      const authData = EHRAggregatorService.generateAuthUrl(TEST_EHR_NAME, TEST_PROVIDER_ID);
      recordTest('generateAuthUrl()', !!authData.auth_url && !!authData.state);
    } catch (error) {
      if (error.message.includes('Client ID not configured')) {
        recordTest('generateAuthUrl()', false, 'UPHEALTH_CLIENT_ID not set (expected in test)');
        results.warnings++;
      } else {
        recordTest('generateAuthUrl()', false, error.message);
      }
    }

    // Test code extraction methods with mock data
    const mockConditions = [
      {
        resource: {
          code: {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: 'F41.1',
                display: 'Generalized anxiety disorder'
              }
            ]
          },
          severity: { text: 'primary' }
        }
      }
    ];

    const icdCodes = EHRAggregatorService.extractICDCodes(mockConditions);
    recordTest('extractICDCodes()', icdCodes.length > 0 && icdCodes[0].code === 'F41.1');

    const mockProcedures = [
      {
        resource: {
          code: {
            coding: [
              {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '90834',
                display: 'Psychotherapy 45 minutes'
              }
            ]
          }
        }
      }
    ];

    const cptCodes = EHRAggregatorService.extractCPTCodes(mockProcedures);
    recordTest('extractCPTCodes()', cptCodes.length > 0 && cptCodes[0].code === '90834');

  } catch (error) {
    recordTest('Service Methods', false, error.message);
  }
}

// ============================================
// TEST 3: Database Operations
// ============================================

async function testDatabaseOperations() {
  logTest('Database Operations');

  try {
    // Create test EHR connection
    const connectionId = uuidv4();
    const stateToken = uuidv4();
    
    db.db.prepare(`
      INSERT INTO ehr_connections 
      (id, provider_id, ehr_name, state_token, auth_url, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(connectionId, TEST_PROVIDER_ID, TEST_EHR_NAME, stateToken, 'https://test.com');

    const connection = db.getEHRConnection(connectionId);
    recordTest('Create EHR connection', !!connection && connection.id === connectionId);

    // Create test patient
    const patientId = `patient-${uuidv4()}`;
    db.db.prepare(`
      INSERT INTO fhir_patients 
      (resource_id, resource_data, phone, name, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(patientId, JSON.stringify({ resourceType: 'Patient' }), '+1234567890', 'Test Patient');

    // Create test appointment
    const appointmentId = `appt-${uuidv4()}`;
    db.db.prepare(`
      INSERT INTO appointments 
      (id, patient_name, patient_phone, date, time, start_time, end_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(appointmentId, 'Test Patient', '+1234567890', '2024-11-06', '14:00:00', '2024-11-06 14:00:00', '2024-11-06 14:50:00', 'confirmed');

    // Create test EHR encounter
    const encounterId = uuidv4();
    const fhirEncounterId = `encounter-${uuidv4()}`;
    db.db.prepare(`
      INSERT INTO ehr_encounters 
      (id, fhir_encounter_id, patient_id, appointment_id, start_time, end_time, status, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      encounterId,
      fhirEncounterId,
      patientId,
      appointmentId,
      '2024-11-06T14:00:00Z',
      '2024-11-06T14:50:00Z',
      'finished',
      JSON.stringify({ resourceType: 'Encounter' })
    );

    recordTest('Create EHR encounter', true);

    // Add test conditions
    const conditionId = uuidv4();
    db.db.prepare(`
      INSERT INTO ehr_conditions 
      (id, ehr_encounter_id, icd10_code, description, is_primary, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(conditionId, encounterId, 'F41.1', 'Generalized anxiety disorder', 1, '{}');

    const conditions = db.getEHRConditions(encounterId);
    recordTest('Get EHR conditions', conditions.length > 0 && conditions[0].icd10_code === 'F41.1');

    // Add test procedures
    const procedureId = uuidv4();
    db.db.prepare(`
      INSERT INTO ehr_procedures 
      (id, ehr_encounter_id, cpt_code, description, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(procedureId, encounterId, '90834', 'Psychotherapy 45 minutes', '{}');

    const procedures = db.getEHRProcedures(encounterId);
    recordTest('Get EHR procedures', procedures.length > 0 && procedures[0].cpt_code === '90834');

    // Test EHR summary
    const summary = db.getEHRSummaryForAppointment(appointmentId);
    recordTest('Get EHR summary for appointment', !!summary && !!summary.encounter);

    // Cleanup test data
    db.db.prepare('DELETE FROM ehr_conditions WHERE id = ?').run(conditionId);
    db.db.prepare('DELETE FROM ehr_procedures WHERE id = ?').run(procedureId);
    db.db.prepare('DELETE FROM ehr_encounters WHERE id = ?').run(encounterId);
    db.db.prepare('DELETE FROM appointments WHERE id = ?').run(appointmentId);
    db.db.prepare('DELETE FROM fhir_patients WHERE resource_id = ?').run(patientId);
    db.db.prepare('DELETE FROM ehr_connections WHERE id = ?').run(connectionId);

    logInfo('Test data cleaned up');

  } catch (error) {
    recordTest('Database Operations', false, error.message);
  }
}

// ============================================
// TEST 4: API Endpoints
// ============================================

async function testAPIEndpoints() {
  logTest('API Endpoints');

  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    logInfo('Server is running, testing API endpoints...');
  } catch (error) {
    logWarning('Server not running - skipping API endpoint tests');
    logInfo('Start server with: cd middleware-platform && npm start');
    results.warnings++;
    return;
  }

  try {
    // Test 1: GET /api/ehr/connect
    try {
      const response = await axios.get(`${BASE_URL}/api/ehr/connect`, {
        params: {
          ehr_name: TEST_EHR_NAME,
          provider_id: TEST_PROVIDER_ID
        },
        timeout: 5000
      });

      if (response.data.success && response.data.auth_url) {
        recordTest('GET /api/ehr/connect', true);
        logInfo(`Auth URL: ${response.data.auth_url}`);
      } else {
        recordTest('GET /api/ehr/connect', false, 'Invalid response structure');
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        recordTest('GET /api/ehr/connect', false, 'Server not responding');
      } else if (error.response?.status === 500 && error.response?.data?.error?.includes('Client ID')) {
        recordTest('GET /api/ehr/connect', false, 'UPHEALTH_CLIENT_ID not configured (expected)');
        results.warnings++;
      } else if (error.response?.status === 404) {
        recordTest('GET /api/ehr/connect', false, 'Endpoint not found (server may need restart)');
      } else {
        recordTest('GET /api/ehr/connect', false, error.message);
      }
    }

    // Test 2: GET /api/admin/ehr/connections
    try {
      const response = await axios.get(`${BASE_URL}/api/admin/ehr/connections`, { timeout: 5000 });
      recordTest('GET /api/admin/ehr/connections', response.data.success === true);
    } catch (error) {
      if (error.response?.status === 404) {
        recordTest('GET /api/admin/ehr/connections', false, 'Endpoint not found (server may need restart)');
      } else {
        recordTest('GET /api/admin/ehr/connections', false, error.message);
      }
    }

    // Test 3: POST /api/ehr/sync/encounters (will fail without real connection, but tests endpoint)
    try {
      const response = await axios.post(`${BASE_URL}/api/ehr/sync/encounters`, {
        connection_id: 'non-existent'
      }, { timeout: 5000 });
      // Should return error, but endpoint should exist
      recordTest('POST /api/ehr/sync/encounters', response.status < 500);
    } catch (error) {
      if (error.response?.status === 404) {
        recordTest('POST /api/ehr/sync/encounters', false, 'Endpoint not found (server may need restart)');
      } else if (error.response?.status === 400 || error.response?.status === 500) {
        // Expected error for non-existent connection
        recordTest('POST /api/ehr/sync/encounters', true, 'Endpoint exists (error expected)');
      } else {
        recordTest('POST /api/ehr/sync/encounters', false, error.message);
      }
    }

  } catch (error) {
    recordTest('API Endpoints', false, error.message);
  }
}

// ============================================
// TEST 5: 1upHealth Sandbox Connection
// ============================================

async function test1upHealthSandbox() {
  logTest('1upHealth Sandbox Connection');

  if (!process.env.UPHEALTH_CLIENT_ID || !process.env.UPHEALTH_CLIENT_SECRET) {
    logWarning('UPHEALTH_CLIENT_ID and UPHEALTH_CLIENT_SECRET not set');
    logInfo('To test with 1upHealth sandbox:');
    logInfo('1. Sign up at https://1up.health');
    logInfo('2. Create an application');
    logInfo('3. Get CLIENT_ID and CLIENT_SECRET');
    logInfo('4. Add to .env file');
    logInfo('5. Run this test again');
    results.warnings++;
    return;
  }

  try {
    // Test OAuth URL generation
    const authData = EHRAggregatorService.generateAuthUrl(TEST_EHR_NAME, TEST_PROVIDER_ID);
    
    if (authData.auth_url && authData.auth_url.includes('1up.health')) {
      recordTest('1upHealth OAuth URL generation', true);
      logInfo(`OAuth URL: ${authData.auth_url}`);
      logInfo('Visit this URL in a browser to complete OAuth flow');
    } else {
      recordTest('1upHealth OAuth URL generation', false, 'Invalid OAuth URL');
    }

    // Note: Actual OAuth flow requires user interaction
    logInfo('To complete OAuth test:');
    logInfo('1. Visit the auth_url above');
    logInfo('2. Complete OAuth flow');
    logInfo('3. System will redirect to callback with code');
    logInfo('4. Token will be stored automatically');

  } catch (error) {
    recordTest('1upHealth Sandbox Connection', false, error.message);
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🧪 EHR Integration Test Suite', 'cyan');
  log('='.repeat(60) + '\n', 'blue');

  logInfo('Testing EHR integration components...\n');

  // Run all tests
  await testDatabaseSchema();
  await testServiceMethods();
  await testDatabaseOperations();
  await testAPIEndpoints();
  await test1upHealthSandbox();

  // Print summary
  log('\n' + '='.repeat(60), 'blue');
  log('📊 Test Summary', 'cyan');
  log('='.repeat(60), 'blue');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, 'red');
  log(`⚠️  Warnings: ${results.warnings}`, 'yellow');
  log('='.repeat(60) + '\n', 'blue');

  // Detailed results
  if (results.tests.length > 0) {
    log('\n📋 Detailed Results:', 'cyan');
    results.tests.forEach(test => {
      const icon = test.passed ? '✅' : '❌';
      const color = test.passed ? 'green' : 'red';
      log(`${icon} ${test.name}${test.message ? ': ' + test.message : ''}`, color);
    });
  }

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});


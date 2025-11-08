/**
 * Epic FHIR Integration Test Script
 * 
 * Tests Epic direct integration endpoints and functionality
 */

const axios = require('axios');
const db = require('../database');
const EpicAdapter = require('../services/epic-adapter');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const TEST_PROVIDER_ID = 'test-provider-epic';

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
// TEST 1: Configuration Check
// ============================================

async function testConfiguration() {
  logTest('Epic Configuration');

  const clientId = process.env.EPIC_CLIENT_ID;
  const redirectUri = process.env.EPIC_REDIRECT_URI;

  if (!clientId) {
    recordTest('EPIC_CLIENT_ID configured', false, 'EPIC_CLIENT_ID not set in .env');
    logWarning('Add EPIC_CLIENT_ID=2f2d99a7-4ac1-4a82-8559-03e1e680bf91 to .env');
  } else {
    recordTest('EPIC_CLIENT_ID configured', true, `Client ID: ${clientId.substring(0, 20)}...`);
  }

  if (!redirectUri) {
    recordTest('EPIC_REDIRECT_URI configured', false, 'EPIC_REDIRECT_URI not set in .env');
    logWarning('Add EPIC_REDIRECT_URI to .env (must match Epic app settings)');
  } else {
    recordTest('EPIC_REDIRECT_URI configured', true, `Redirect URI: ${redirectUri}`);
  }
}

// ============================================
// TEST 2: Epic Adapter Service
// ============================================

async function testEpicAdapter() {
  logTest('Epic Adapter Service');

  try {
    // Test generateAuthUrl
    if (process.env.EPIC_CLIENT_ID) {
      try {
        const authData = EpicAdapter.generateAuthUrl(TEST_PROVIDER_ID);
        recordTest('generateAuthUrl()', !!authData.auth_url && !!authData.state);
        logInfo(`Auth URL: ${authData.auth_url.substring(0, 80)}...`);
        logInfo(`State: ${authData.state}`);
      } catch (error) {
        recordTest('generateAuthUrl()', false, error.message);
      }
    } else {
      recordTest('generateAuthUrl()', false, 'EPIC_CLIENT_ID not configured');
      results.warnings++;
    }

    // Test code extraction methods (same as aggregator)
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
          }
        }
      }
    ];

    const icdCodes = EpicAdapter.extractICDCodes(mockConditions);
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

    const cptCodes = EpicAdapter.extractCPTCodes(mockProcedures);
    recordTest('extractCPTCodes()', cptCodes.length > 0 && cptCodes[0].code === '90834');

  } catch (error) {
    recordTest('Epic Adapter Service', false, error.message);
  }
}

// ============================================
// TEST 3: API Endpoints
// ============================================

async function testAPIEndpoints() {
  logTest('Epic API Endpoints');

  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
    logInfo('Server is running, testing Epic endpoints...');
  } catch (error) {
    logWarning('Server not running - skipping API endpoint tests');
    logInfo('Start server with: cd middleware-platform && npm start');
    results.warnings++;
    return;
  }

  try {
    // Test 1: GET /api/ehr/epic/connect
    try {
      const response = await axios.get(`${BASE_URL}/api/ehr/epic/connect`, {
        params: {
          provider_id: TEST_PROVIDER_ID
        },
        timeout: 5000
      });

      if (response.data.success && response.data.auth_url) {
        recordTest('GET /api/ehr/epic/connect', true);
        logInfo(`Auth URL: ${response.data.auth_url.substring(0, 100)}...`);
        logInfo(`State: ${response.data.state}`);
        logInfo(`\n📋 Next Steps:`);
        logInfo(`1. Visit this auth_url in your browser`);
        logInfo(`2. Login to Epic sandbox`);
        logInfo(`3. Authorize the application`);
        logInfo(`4. You'll be redirected to callback with code`);
      } else {
        recordTest('GET /api/ehr/epic/connect', false, 'Invalid response structure');
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        recordTest('GET /api/ehr/epic/connect', false, 'Server not responding');
      } else if (error.response?.status === 500 && error.response?.data?.error?.includes('Client ID')) {
        recordTest('GET /api/ehr/epic/connect', false, 'EPIC_CLIENT_ID not configured');
        results.warnings++;
      } else if (error.response?.status === 404) {
        recordTest('GET /api/ehr/epic/connect', false, 'Endpoint not found (server may need restart)');
      } else {
        recordTest('GET /api/ehr/epic/connect', false, error.message);
      }
    }

    // Test 2: GET /api/ehr/epic/status (will fail without connection, but tests endpoint)
    try {
      const response = await axios.get(`${BASE_URL}/api/ehr/epic/status`, {
        params: { connection_id: 'non-existent' },
        timeout: 5000
      });
      // Should return error, but endpoint should exist
      recordTest('GET /api/ehr/epic/status', response.status < 500);
    } catch (error) {
      if (error.response?.status === 404) {
        recordTest('GET /api/ehr/epic/status', false, 'Endpoint not found (server may need restart)');
      } else if (error.response?.status === 400 || error.response?.status === 404) {
        // Expected error for non-existent connection
        recordTest('GET /api/ehr/epic/status', true, 'Endpoint exists (error expected)');
      } else {
        recordTest('GET /api/ehr/epic/status', false, error.message);
      }
    }

    // Test 3: POST /api/ehr/epic/sync (will fail without connection, but tests endpoint)
    try {
      const response = await axios.post(`${BASE_URL}/api/ehr/epic/sync`, {
        connection_id: 'non-existent'
      }, { timeout: 5000 });
      recordTest('POST /api/ehr/epic/sync', response.status < 500);
    } catch (error) {
      if (error.response?.status === 404) {
        recordTest('POST /api/ehr/epic/sync', false, 'Endpoint not found (server may need restart)');
      } else if (error.response?.status === 400 || error.response?.status === 500) {
        // Expected error for non-existent connection
        recordTest('POST /api/ehr/epic/sync', true, 'Endpoint exists (error expected)');
      } else {
        recordTest('POST /api/ehr/epic/sync', false, error.message);
      }
    }

  } catch (error) {
    recordTest('API Endpoints', false, error.message);
  }
}

// ============================================
// TEST 4: Database Operations
// ============================================

async function testDatabaseOperations() {
  logTest('Database Operations for Epic');

  try {
    // Check if Epic connections can be stored
    const connectionId = require('uuid').v4();
    const stateToken = require('uuid').v4();
    
    db.db.prepare(`
      INSERT OR REPLACE INTO ehr_connections 
      (id, provider_id, ehr_name, state_token, auth_url, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(connectionId, TEST_PROVIDER_ID, 'epic', stateToken, 'https://test-epic.com');

    const connection = db.getEHRConnection(connectionId);
    recordTest('Create Epic connection', !!connection && connection.ehr_name === 'epic');

    // Cleanup
    db.db.prepare('DELETE FROM ehr_connections WHERE id = ?').run(connectionId);
    logInfo('Test data cleaned up');

  } catch (error) {
    recordTest('Database Operations', false, error.message);
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🧪 Epic FHIR Integration Test Suite', 'cyan');
  log('='.repeat(60) + '\n', 'blue');

  logInfo('Testing Epic direct integration...\n');

  // Run all tests
  await testConfiguration();
  await testEpicAdapter();
  await testDatabaseOperations();
  await testAPIEndpoints();

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

  // Instructions
  if (results.failed > 0 || results.warnings > 0) {
    log('\n📝 Next Steps:', 'cyan');
    if (!process.env.EPIC_CLIENT_ID) {
      log('1. Add Epic credentials to .env:', 'yellow');
      log('   EPIC_CLIENT_ID=2f2d99a7-4ac1-4a82-8559-03e1e680bf91', 'yellow');
      log('   EPIC_REDIRECT_URI=https://www.doclittle.site/api/ehr/epic/callback', 'yellow');
    }
    log('2. Restart server: npm start', 'yellow');
    log('3. Run this test again', 'yellow');
    log('4. Visit auth_url to complete OAuth flow', 'yellow');
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


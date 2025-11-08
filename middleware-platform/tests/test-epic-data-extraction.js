/**
 * Epic FHIR Data Extraction Test
 * 
 * Tests what data we can extract from Epic FHIR, especially clinical notes
 * for medical coding
 */

const db = require('../database');
const EpicAdapter = require('../services/epic-adapter');

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

// ============================================
// Test 1: Check Epic Connection
// ============================================

async function checkEpicConnection() {
  logTest('Epic Connection Status');
  
  try {
    // Check if we have any Epic connections
    const connections = db.db.prepare(`
      SELECT * FROM ehr_connections 
      WHERE ehr_name = 'epic' 
        AND access_token IS NOT NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).all();
    
    if (connections.length === 0) {
      logWarning('No active Epic connections found');
      logInfo('You need to:');
      logInfo('1. Set EPIC_CLIENT_ID in .env');
      logInfo('2. Visit /api/ehr/epic/connect to authorize');
      logInfo('3. Complete OAuth flow');
      return null;
    }
    
    logSuccess(`Found ${connections.length} active Epic connection(s)`);
    return connections[0];
  } catch (error) {
    logError(`Error checking connections: ${error.message}`);
    return null;
  }
}

// ============================================
// Test 2: Fetch Encounters
// ============================================

async function testFetchEncounters(connection) {
  logTest('Fetching Encounters from Epic');
  
  try {
    const connectionId = connection.id;
    const patientId = connection.patient_id; // From OAuth token
    
    if (!patientId) {
      logWarning('No patient_id in connection (may need patient context in OAuth)');
      logInfo('Trying to fetch encounters without patient filter...');
    }
    
    // Try to fetch encounters
    const encounters = await EpicAdapter.fetchEncounters(
      connectionId,
      patientId,
      new Date().toISOString().split('T')[0] // Today
    );
    
    if (encounters.length === 0) {
      logWarning('No encounters found for today');
      logInfo('Epic sandbox may not have test data');
      logInfo('Trying to fetch encounters without date filter...');
      
      // Try without date
      const allEncounters = await EpicAdapter.fetchEncounters(connectionId, patientId);
      logInfo(`Found ${allEncounters.length} total encounters`);
      
      if (allEncounters.length > 0) {
        const sample = allEncounters[0].resource;
        logInfo('\n📋 Sample Encounter Structure:');
        console.log(JSON.stringify(sample, null, 2));
      }
      
      return allEncounters;
    }
    
    logSuccess(`Found ${encounters.length} encounter(s)`);
    
    // Show structure of first encounter
    if (encounters.length > 0) {
      const sample = encounters[0].resource;
      logInfo('\n📋 Sample Encounter Structure:');
      console.log(JSON.stringify(sample, null, 2));
    }
    
    return encounters;
  } catch (error) {
    logError(`Error fetching encounters: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return [];
  }
}

// ============================================
// Test 3: Fetch Observations (may contain notes)
// ============================================

async function testFetchObservations(connection, encounterId = null) {
  logTest('Fetching Observations from Epic');
  
  try {
    const connectionId = connection.id;
    const patientId = connection.patient_id;
    
    if (!patientId) {
      logWarning('No patient_id - cannot fetch observations');
      return [];
    }
    
    const observations = await EpicAdapter.fetchObservations(
      connectionId,
      patientId,
      encounterId
    );
    
    logSuccess(`Found ${observations.length} observation(s)`);
    
    if (observations.length > 0) {
      logInfo('\n📋 Sample Observations:');
      observations.slice(0, 3).forEach((entry, idx) => {
        const obs = entry.resource;
        logInfo(`\nObservation ${idx + 1}:`);
        console.log(JSON.stringify({
          id: obs.id,
          code: obs.code,
          value: obs.valueString || obs.valueQuantity || obs.valueCodeableConcept,
          note: obs.note || 'No note field',
          component: obs.component || 'No component',
          text: obs.text || 'No text'
        }, null, 2));
      });
    }
    
    return observations;
  } catch (error) {
    logError(`Error fetching observations: ${error.message}`);
    return [];
  }
}

// ============================================
// Test 4: Extract Clinical Notes
// ============================================

function extractClinicalNote(encounter, observations) {
  logTest('Extracting Clinical Notes');
  
  const noteParts = [];
  
  // Try to extract from encounter
  if (encounter.text && encounter.text.div) {
    noteParts.push(`Encounter Note: ${encounter.text.div}`);
  }
  
  if (encounter.reasonCode && encounter.reasonCode.length > 0) {
    const reasons = encounter.reasonCode.map(r => r.text || r.coding?.[0]?.display).filter(Boolean);
    if (reasons.length > 0) {
      noteParts.push(`Reason: ${reasons.join(', ')}`);
    }
  }
  
  // Try to extract from observations
  observations.forEach(entry => {
    const obs = entry.resource;
    
    // Check for note field
    if (obs.note && obs.note.length > 0) {
      obs.note.forEach(note => {
        if (note.text) {
          noteParts.push(`Observation Note: ${note.text}`);
        }
      });
    }
    
    // Check for valueString (may contain notes)
    if (obs.valueString) {
      noteParts.push(`Observation: ${obs.valueString}`);
    }
    
    // Check for text field
    if (obs.text && obs.text.div) {
      noteParts.push(`Observation Text: ${obs.text.div}`);
    }
  });
  
  const clinicalNote = noteParts.join('\n\n');
  
  if (clinicalNote.length > 0) {
    logSuccess(`Extracted ${clinicalNote.length} characters of clinical notes`);
    logInfo('\n📝 Extracted Clinical Note:');
    logInfo(clinicalNote.substring(0, 500) + (clinicalNote.length > 500 ? '...' : ''));
  } else {
    logWarning('No clinical notes found in encounter or observations');
    logInfo('Epic may store notes in DocumentReference or DiagnosticReport resources');
  }
  
  return clinicalNote;
}

// ============================================
// Test 5: Try to Fetch DocumentReference (clinical documents)
// ============================================

async function testFetchDocumentReferences(connection, encounterId = null) {
  logTest('Fetching DocumentReferences from Epic (Clinical Documents)');
  
  try {
    const connectionId = connection.id;
    const patientId = connection.patient_id;
    const token = await EpicAdapter.getValidToken(connectionId);
    const fhirBaseUrl = EpicAdapter.getFhirBaseUrl();
    
    let url = `${fhirBaseUrl}/DocumentReference?patient=${patientId}`;
    if (encounterId) {
      url += `&encounter=${encounterId}`;
    }
    
    const axios = require('axios');
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    const documents = response.data.entry || [];
    logSuccess(`Found ${documents.length} document(s)`);
    
    if (documents.length > 0) {
      logInfo('\n📋 Sample DocumentReference:');
      const sample = documents[0].resource;
      console.log(JSON.stringify({
        id: sample.id,
        type: sample.type,
        status: sample.status,
        content: sample.content || 'No content',
        description: sample.description || 'No description'
      }, null, 2));
    }
    
    return documents;
  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 401) {
      logWarning('DocumentReference requires additional scope in OAuth');
      logInfo('Add "patient/DocumentReference.read" to Epic OAuth scopes');
    } else if (error.response?.status === 404) {
      logWarning('DocumentReference endpoint not available or no documents found');
    } else {
      logError(`Error fetching DocumentReferences: ${error.message}`);
    }
    return [];
  }
}

// ============================================
// Test 6: Try to Fetch DiagnosticReport (may contain notes)
// ============================================

async function testFetchDiagnosticReports(connection, encounterId = null) {
  logTest('Fetching DiagnosticReports from Epic');
  
  try {
    const connectionId = connection.id;
    const patientId = connection.patient_id;
    const token = await EpicAdapter.getValidToken(connectionId);
    const fhirBaseUrl = EpicAdapter.getFhirBaseUrl();
    
    let url = `${fhirBaseUrl}/DiagnosticReport?patient=${patientId}`;
    if (encounterId) {
      url += `&encounter=${encounterId}`;
    }
    
    const axios = require('axios');
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    const reports = response.data.entry || [];
    logSuccess(`Found ${reports.length} diagnostic report(s)`);
    
    if (reports.length > 0) {
      logInfo('\n📋 Sample DiagnosticReport:');
      const sample = reports[0].resource;
      console.log(JSON.stringify({
        id: sample.id,
        status: sample.status,
        code: sample.code,
        conclusion: sample.conclusion || 'No conclusion',
        conclusionCode: sample.conclusionCode || 'No conclusion codes',
        presentedForm: sample.presentedForm || 'No presented form'
      }, null, 2));
    }
    
    return reports;
  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 401) {
      logWarning('DiagnosticReport requires additional scope in OAuth');
      logInfo('Add "patient/DiagnosticReport.read" to Epic OAuth scopes');
    } else if (error.response?.status === 404) {
      logWarning('DiagnosticReport endpoint not available or no reports found');
    } else {
      logError(`Error fetching DiagnosticReports: ${error.message}`);
    }
    return [];
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🧪 Epic FHIR Data Extraction Test', 'cyan');
  log('='.repeat(60) + '\n', 'blue');
  
  // Check configuration
  if (!process.env.EPIC_CLIENT_ID) {
    logError('EPIC_CLIENT_ID not configured');
    logInfo('Add EPIC_CLIENT_ID to .env file');
    process.exit(1);
  }
  
  // Check for active connection
  const connection = await checkEpicConnection();
  if (!connection) {
    logError('No active Epic connection found');
    logInfo('You need to complete OAuth flow first');
    logInfo('Visit: /api/ehr/epic/connect');
    process.exit(1);
  }
  
  logInfo(`Using connection: ${connection.id}`);
  logInfo(`Patient ID: ${connection.patient_id || 'Not set'}`);
  logInfo(`Connected at: ${connection.connected_at || 'Unknown'}\n`);
  
  // Test 1: Fetch encounters
  const encounters = await testFetchEncounters(connection);
  
  if (encounters.length === 0) {
    logWarning('\n⚠️  No encounters found - cannot test data extraction');
    logInfo('Epic sandbox may need test data seeded');
    logInfo('Or you may need to use a different patient context');
    process.exit(0);
  }
  
  // Use first encounter for testing
  const encounterId = encounters[0].resource.id;
  logInfo(`\nUsing encounter: ${encounterId}`);
  
  // Test 2: Fetch observations
  const observations = await testFetchObservations(connection, encounterId);
  
  // Test 3: Extract clinical notes
  const clinicalNote = extractClinicalNote(encounters[0].resource, observations);
  
  // Test 4: Try DocumentReference
  const documents = await testFetchDocumentReferences(connection, encounterId);
  
  // Test 5: Try DiagnosticReport
  const reports = await testFetchDiagnosticReports(connection, encounterId);
  
  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('📊 Summary', 'cyan');
  log('='.repeat(60), 'blue');
  log(`Encounters: ${encounters.length}`, 'green');
  log(`Observations: ${observations.length}`, 'green');
  log(`DocumentReferences: ${documents.length}`, documents.length > 0 ? 'green' : 'yellow');
  log(`DiagnosticReports: ${reports.length}`, reports.length > 0 ? 'green' : 'yellow');
  log(`Clinical Note Length: ${clinicalNote.length} chars`, clinicalNote.length > 0 ? 'green' : 'yellow');
  log('='.repeat(60) + '\n', 'blue');
  
  // Recommendations
  if (clinicalNote.length === 0) {
    logWarning('⚠️  No clinical notes extracted');
    logInfo('Recommendations:');
    logInfo('1. Check if Epic stores notes in DocumentReference (may need additional OAuth scope)');
    logInfo('2. Check if notes are in DiagnosticReport.conclusion');
    logInfo('3. Epic may require specific encounter types to have notes');
    logInfo('4. For sandbox, test data may not include clinical notes');
  } else {
    logSuccess('✅ Clinical notes can be extracted from Epic!');
    logInfo('Next step: Integrate this into EHR sync service');
  }
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});


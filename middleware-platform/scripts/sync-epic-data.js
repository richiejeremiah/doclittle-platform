/**
 * Sync Epic Sandbox Data
 * 
 * This script helps you connect to Epic sandbox and pull REAL data
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.BASE_URL || 'http://localhost:4000';

console.log('🔗 Epic Sandbox Data Sync\n');
console.log('='.repeat(60));

// Step 1: Check if Epic is configured
console.log('\n📋 Step 1: Checking Epic Configuration...');
if (!process.env.EPIC_CLIENT_ID) {
  console.error('❌ EPIC_CLIENT_ID not set in .env');
  console.log('\n📝 To connect Epic sandbox:');
  console.log('1. Go to: https://fhir.epic.com/Interconnect-FHIR-oauth/oauth2');
  console.log('2. Register your app to get Client ID');
  console.log('3. Add to .env: EPIC_CLIENT_ID=your-client-id');
  console.log('4. Add to .env: EPIC_REDIRECT_URI=http://localhost:4000/api/ehr/epic/callback');
  process.exit(1);
}

console.log('✅ EPIC_CLIENT_ID configured');

// Step 2: Check for existing connections
console.log('\n📋 Step 2: Checking for Epic Connections...');
axios.get(`${API_BASE}/api/ehr/epic/status`, {
  params: { connection_id: 'all' }
}).then(response => {
  if (response.data.success && response.data.connections && response.data.connections.length > 0) {
    console.log(`✅ Found ${response.data.connections.length} Epic connection(s)`);
    
    // Step 3: Sync data from Epic
    console.log('\n📋 Step 3: Syncing Data from Epic Sandbox...');
    const connection = response.data.connections[0];
    console.log(`   Using connection: ${connection.id}`);
    
    return axios.post(`${API_BASE}/api/ehr/epic/sync`, {
      connection_id: connection.id,
      date: new Date().toISOString().split('T')[0] // Today
    });
  } else {
    console.log('⚠️  No Epic connections found');
    console.log('\n📝 To connect Epic:');
    console.log(`1. Visit: ${API_BASE}/api/ehr/epic/connect?provider_id=default`);
    console.log('2. Authorize the app in Epic sandbox');
    console.log('3. You will be redirected back with a connection');
    console.log('4. Run this script again to sync data');
    return Promise.reject(new Error('No connections'));
  }
}).then(response => {
  if (response.data.success) {
    console.log('✅ Epic sync completed!');
    console.log(`   Synced: ${response.data.synced || 0} encounters`);
    console.log('\n📊 Data Summary:');
    if (response.data.encounters) {
      console.log(`   - Encounters: ${response.data.encounters.length}`);
    }
    if (response.data.conditions) {
      console.log(`   - Conditions (ICD-10): ${response.data.conditions.length}`);
    }
    if (response.data.procedures) {
      console.log(`   - Procedures (CPT): ${response.data.procedures.length}`);
    }
    if (response.data.observations) {
      console.log(`   - Observations: ${response.data.observations.length}`);
    }
    console.log('\n🔄 Now refresh your browser to see Epic data in the Clients tab!');
  } else {
    console.error('❌ Sync failed:', response.data.error);
  }
}).catch(error => {
  if (error.response) {
    console.error('❌ Error:', error.response.data.error || error.response.data.message);
    if (error.response.status === 404) {
      console.log('\n💡 Tip: Make sure your middleware server is running:');
      console.log('   cd middleware-platform && npm start');
    }
  } else if (error.message === 'No connections') {
    // Already handled above
  } else {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Tip: Make sure your middleware server is running:');
    console.log('   cd middleware-platform && npm start');
  }
});


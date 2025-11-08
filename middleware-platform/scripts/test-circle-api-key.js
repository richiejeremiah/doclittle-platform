/**
 * Test Circle API Key
 * Tests different Circle API endpoints to determine which ones work
 */

require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.CIRCLE_API_KEY;
if (!API_KEY) {
    console.error('❌ CIRCLE_API_KEY environment variable is required');
    console.error('   Please set it in your .env file or export it before running this script');
    console.error('   Get your API key from: https://console.circle.com/');
    process.exit(1);
}
const BASE_URL = 'https://api-sandbox.circle.com';

async function testCircleAPI() {
    console.log('🧪 Testing Circle API Key...\n');
    console.log(`🔑 API Key: ${API_KEY.split(':')[0]}:${API_KEY.split(':')[1]}:***${API_KEY.split(':')[2].slice(-4)}`);
    console.log(`🌐 Base URL: ${BASE_URL}\n`);

    // Test endpoints to try
    // Try different authentication methods
    const authMethods = [
        { name: 'Bearer Token', header: 'Authorization', value: `Bearer ${API_KEY}` },
        { name: 'API Key Header', header: 'X-API-Key', value: API_KEY },
        { name: 'API Key Header (Alt)', header: 'Circle-Token', value: API_KEY },
        { name: 'Basic Auth (ID:Secret)', header: 'Authorization', value: `Basic ${Buffer.from(API_KEY.split(':')[1] + ':' + API_KEY.split(':')[2]).toString('base64')}` },
    ];

    const testEndpoints = [
        // Configuration/Info endpoints
        { method: 'GET', path: '/v1/configuration', description: 'Get configuration' },
        { method: 'GET', path: '/v1/account', description: 'Get account info' },
        
        // Programmable Wallets endpoints
        { method: 'GET', path: '/v1/w3s/developer/config', description: 'Get developer config (Programmable Wallets)' },
        { method: 'GET', path: '/v1/w3s/developer/entities', description: 'List entities (Programmable Wallets)' },
        
        // Classic Payments endpoints
        { method: 'GET', path: '/v1/payments', description: 'List payments (Classic Payments)' },
        { method: 'GET', path: '/v1/transfers', description: 'List transfers (Classic Payments)' },
    ];

    let successCount = 0;
    let failCount = 0;
    let workingAuth = null;
    let workingEndpoint = null;

    // First, try to find working authentication method
    console.log('🔍 Step 1: Testing authentication methods...\n');
    
    for (const authMethod of authMethods) {
        const client = axios.create({
            baseURL: BASE_URL,
            headers: {
                [authMethod.header]: authMethod.value,
                'Content-Type': 'application/json'
            }
        });

        // Try a simple endpoint with this auth method
        try {
            console.log(`📤 Testing auth: ${authMethod.name}...`);
            const response = await client.get('/v1/configuration');
            
            console.log(`   ✅ SUCCESS with ${authMethod.name}!`);
            console.log(`   📦 Response:`, JSON.stringify(response.data, null, 2).substring(0, 200));
            workingAuth = authMethod;
            successCount++;
            break;
        } catch (error) {
            const status = error.response?.status;
            const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
            
            if (status === 404) {
                console.log(`   ⚠️  Endpoint not found (might still be valid auth)`);
            } else if (status === 401) {
                console.log(`   ❌ Invalid credentials`);
            } else {
                console.log(`   ⚠️  Status ${status}: ${errorMsg}`);
            }
        }
    }

    if (!workingAuth) {
        console.log('\n❌ No working authentication method found.');
        console.log('💡 The API key might be invalid or the authentication method is different.');
        console.log('💡 Check Circle API documentation for the correct authentication method.');
        return;
    }

    console.log(`\n✅ Found working authentication: ${workingAuth.name}`);
    console.log(`   Header: ${workingAuth.header}`);
    console.log(`   Value format: ${workingAuth.value.substring(0, 50)}...\n`);

    // Now test endpoints with working auth
    console.log('🔍 Step 2: Testing endpoints with working authentication...\n');
    
    const client = axios.create({
        baseURL: BASE_URL,
        headers: {
            [workingAuth.header]: workingAuth.value,
            'Content-Type': 'application/json'
        }
    });

    for (const endpoint of testEndpoints) {
        try {
            console.log(`📤 Testing ${endpoint.method} ${endpoint.path} - ${endpoint.description}...`);
            
            let response;
            if (endpoint.method === 'GET') {
                response = await client.get(endpoint.path);
            } else if (endpoint.method === 'POST') {
                response = await client.post(endpoint.path, {});
            }

            console.log(`   ✅ Success! Status: ${response.status}`);
            if (response.data) {
                console.log(`   📦 Response structure:`, JSON.stringify(response.data, null, 2).substring(0, 300));
            }
            workingEndpoint = endpoint;
            successCount++;
            console.log('');
        } catch (error) {
            const status = error.response?.status;
            const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
            
            if (status === 404) {
                console.log(`   ⚠️  Not found (404) - Endpoint may not exist for this account type`);
            } else if (status === 401) {
                console.log(`   ❌ Unauthorized (401) - ${errorMsg}`);
            } else if (status === 403) {
                console.log(`   ❌ Forbidden (403) - ${errorMsg} - API key may not have permissions`);
            } else {
                console.log(`   ❌ Error (${status || 'N/A'}): ${errorMsg}`);
            }
            failCount++;
            console.log('');
        }
    }

    console.log('='.repeat(60));
    console.log(`📊 Test Results: ${successCount} successful, ${failCount} failed`);
    console.log('='.repeat(60));
    
    if (successCount > 0) {
        console.log('\n✅ API key is valid! Some endpoints are accessible.');
        console.log('💡 Next step: Use the working endpoints to determine API structure.');
    } else {
        console.log('\n❌ API key authentication failed on all endpoints.');
        console.log('💡 Possible issues:');
        console.log('   1. API key is invalid or expired');
        console.log('   2. API key doesn\'t have required permissions');
        console.log('   3. Account type doesn\'t match endpoint expectations');
    }
}

testCircleAPI().catch(console.error);


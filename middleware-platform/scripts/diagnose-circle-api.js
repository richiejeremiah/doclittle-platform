/**
 * Diagnose Circle API Key Issues
 * Tests the API key in various ways to identify the problem
 */

require('dotenv').config();
const axios = require('axios');
const https = require('https');

async function runDiagnostics() {

const API_KEY = process.env.CIRCLE_API_KEY;
if (!API_KEY) {
    console.error('❌ CIRCLE_API_KEY environment variable is required');
    console.error('   Please set it in your .env file or export it before running this script');
    console.error('   Get your API key from: https://console.circle.com/');
    process.exit(1);
}

console.log('🔍 Circle API Key Diagnostics\n');
console.log('='.repeat(60));

// Parse API key
const keyParts = API_KEY.split(':');
console.log(`📋 API Key Analysis:`);
console.log(`   Total parts: ${keyParts.length}`);
console.log(`   Part 1 (Environment): ${keyParts[0]}`);
console.log(`   Part 2 (ID): ${keyParts[1]}`);
console.log(`   Part 3 (Secret): ${keyParts[2] ? keyParts[2].substring(0, 4) + '...' + keyParts[2].slice(-4) : 'MISSING'}`);
console.log(`   Full length: ${API_KEY.length} characters\n`);

// Test different base URLs
const baseURLs = [
    'https://api-sandbox.circle.com',
    'https://api.circle.com',
    'https://api-sandbox.circle.com/v1',
];

// Test different authentication headers
const authConfigs = [
    {
        name: 'Bearer Token (Standard)',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'Bearer Token (No prefix)',
        headers: {
            'Authorization': `Bearer ${keyParts[1]}:${keyParts[2]}`,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'X-API-Key Header',
        headers: {
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        }
    },
    {
        name: 'Circle-Token Header',
        headers: {
            'Circle-Token': API_KEY,
            'Content-Type': 'application/json'
        }
    },
];

// Test endpoints (various Circle API products)
const testEndpoints = [
    // Programmable Wallets API
    { path: '/v1/w3s/developer/config', product: 'Programmable Wallets' },
    { path: '/v1/w3s/developer/entities', product: 'Programmable Wallets' },
    { path: '/v1/w3s/wallets', method: 'GET', product: 'Programmable Wallets' },
    
    // Payments API (Classic)
    { path: '/v1/configuration', product: 'Payments API' },
    { path: '/v1/payments', method: 'GET', product: 'Payments API' },
    { path: '/v1/transfers', method: 'GET', product: 'Payments API' },
    
    // Account/Info endpoints
    { path: '/v1/account', product: 'Account API' },
    { path: '/v1/user', product: 'User API' },
];

console.log('🧪 Testing API Key with Different Configurations...\n');

let anySuccess = false;

for (const baseURL of baseURLs) {
    console.log(`\n🌐 Testing Base URL: ${baseURL}`);
    console.log('-'.repeat(60));
    
    for (const authConfig of authConfigs) {
        console.log(`\n   🔑 Auth Method: ${authConfig.name}`);
        
        const client = axios.create({
            baseURL: baseURL,
            headers: authConfig.headers,
            timeout: 5000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: true
            })
        });

        // Try a simple GET request first
        for (const endpoint of testEndpoints.slice(0, 2)) { // Just test first 2 to save time
            try {
                const method = endpoint.method || 'GET';
                const path = endpoint.path;
                
                let response;
                if (method === 'GET') {
                    response = await client.get(path);
                } else {
                    response = await client.post(path, {});
                }

                console.log(`      ✅ SUCCESS! ${method} ${path}`);
                console.log(`         Status: ${response.status}`);
                console.log(`         Product: ${endpoint.product}`);
                if (response.data) {
                    console.log(`         Response keys: ${Object.keys(response.data).join(', ')}`);
                }
                anySuccess = true;
                break; // Found working config, move to next base URL
            } catch (error) {
                const status = error.response?.status;
                const errorMsg = error.response?.data?.message || error.response?.data?.error;
                
                if (status === 401) {
                    // Invalid credentials - try next auth method
                    continue;
                } else if (status === 404) {
                    // Endpoint doesn't exist - might still be valid auth
                    // Continue to next endpoint
                    continue;
                } else if (status === 403) {
                    console.log(`      ⚠️  Forbidden (403) - ${path} - Key might not have permissions`);
                    continue;
                } else {
                    // Other error - log but continue
                    continue;
                }
            }
        }
        
        if (anySuccess) break; // Found working config
    }
    
    if (anySuccess) break; // Found working base URL
}

console.log('\n' + '='.repeat(60));

if (!anySuccess) {
    console.log('\n❌ No successful authentication found.');
    console.log('\n💡 Possible Issues:');
    console.log('   1. API key might be invalid or expired');
    console.log('   2. API key might need activation in Circle Console');
    console.log('   3. Account might not have access to these APIs');
    console.log('   4. IP restrictions might be blocking requests');
    console.log('   5. API key might be for a different Circle product');
    console.log('\n🔧 Next Steps:');
    console.log('   1. Verify API key in Circle Console: https://console.circle.com');
    console.log('   2. Check if API key is "Active" status');
    console.log('   3. Check "Allowed IP Addresses" settings');
    console.log('   4. Verify which Circle products are enabled for your account');
    console.log('   5. Contact Circle support if key appears valid in console');
} else {
    console.log('\n✅ Found working configuration!');
    console.log('💡 Update circle-service.js with the working configuration.');
}

    console.log('\n');
}

// Run diagnostics
runDiagnostics().catch(console.error);


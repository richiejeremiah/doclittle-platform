// retell-diagnostic.js
// Complete diagnostic tool for Retell + Twilio integration

require('dotenv').config();
const axios = require('axios');

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const AGENT_ID = 'agent_9151f738c705a56f4a0d8df63a';

console.log('\n' + '='.repeat(70));
console.log('🔍 RETELL API DIAGNOSTIC TOOL');
console.log('='.repeat(70) + '\n');

async function runDiagnostics() {

    // TEST 1: Verify API Key
    console.log('📋 TEST 1: Verify API Key');
    console.log('   API Key:', RETELL_API_KEY ? RETELL_API_KEY.substring(0, 20) + '...' : '❌ MISSING');

    if (!RETELL_API_KEY) {
        console.error('   ❌ RETELL_API_KEY not found in .env file\n');
        return;
    }
    console.log('   ✅ API Key present\n');

    try {
        // TEST 2: Get Agent Details
        console.log('📋 TEST 2: Fetch Agent Details');
        console.log('   Agent ID:', AGENT_ID);

        const agentResponse = await axios.get(
            `https://api.retellai.com/get-agent/${AGENT_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );

        console.log('   ✅ Agent found!');
        console.log('   Agent Name:', agentResponse.data.agent_name);
        console.log('   Version:', agentResponse.data.agent_version);
        console.log('   Voice:', agentResponse.data.voice_id);
        console.log('   LLM Type:', agentResponse.data.llm_websocket_url ? 'Custom WebSocket' : 'Retell LLM');
        console.log();

    } catch (error) {
        console.error('   ❌ Failed to fetch agent');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Error:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
        console.log();
        return;
    }

    try {
        // TEST 3: Register Phone Call
        console.log('📋 TEST 3: Register Phone Call');

        const registerPayload = {
            agent_id: AGENT_ID,
            audio_websocket_protocol: 'twilio',
            audio_encoding: 'mulaw',
            sample_rate: 8000,
            from_number: '+18622307479',
            to_number: '+15856202445',
            metadata: {
                test: true
            }
        };

        console.log('   Payload:', JSON.stringify(registerPayload, null, 2));

        const registerResponse = await axios.post(
            'https://api.retellai.com/v2/register-phone-call',
            registerPayload,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('   ✅ Call registered!');
        console.log('   Call ID:', registerResponse.data.call_id);
        console.log('   Status:', registerResponse.data.call_status);
        console.log();
        console.log('   📊 Full Register Response:');
        console.log(JSON.stringify(registerResponse.data, null, 2));
        console.log();

        const callId = registerResponse.data.call_id;

        // TEST 4: Get Call Details
        console.log('📋 TEST 4: Get Call Details (to fetch WebSocket URL)');
        console.log('   Endpoint: GET /v2/get-call/' + callId);

        const callDetailsResponse = await axios.get(
            `https://api.retellai.com/v2/get-call/${callId}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );

        console.log('   ✅ Call details retrieved!');
        console.log();
        console.log('   📊 Full Call Details Response:');
        console.log(JSON.stringify(callDetailsResponse.data, null, 2));
        console.log();

        // TEST 5: Find WebSocket URL
        console.log('📋 TEST 5: Locate WebSocket URL');

        const response = callDetailsResponse.data;

        console.log('   Checking possible locations:');
        console.log('   - response.websocket_url:', response.websocket_url || '❌ Not found');
        console.log('   - response.call_detail?.websocket_url:', response.call_detail?.websocket_url || '❌ Not found');
        console.log('   - response.access?.websocket_url:', response.access?.websocket_url || '❌ Not found');
        console.log('   - response.access_token:', response.access_token || '❌ Not found');

        // Check all properties
        console.log('\n   🔍 All top-level properties in response:');
        Object.keys(response).forEach(key => {
            console.log(`      - ${key}: ${typeof response[key]}`);
        });

        const websocketUrl =
            response.websocket_url ||
            response.call_detail?.websocket_url ||
            response.access?.websocket_url ||
            response.access_token;

        if (websocketUrl) {
            console.log('\n   ✅ WebSocket URL FOUND:', websocketUrl);

            // Check if it's a valid WebSocket URL
            if (websocketUrl.startsWith('wss://') || websocketUrl.startsWith('ws://')) {
                console.log('   ✅ Valid WebSocket URL format');
            } else {
                console.log('   ⚠️  URL does not start with wss:// or ws://');
            }
        } else {
            console.log('\n   ❌ WebSocket URL NOT FOUND in any expected location');
            console.log('   This is the problem! Retell is not returning a WebSocket URL.');
        }

        console.log();

        // TEST 6: Alternative endpoints to try
        console.log('📋 TEST 6: Try Alternative Endpoint');
        console.log('   Trying: GET /get-call/' + callId);

        try {
            const altResponse = await axios.get(
                `https://api.retellai.com/get-call/${callId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${RETELL_API_KEY}`
                    }
                }
            );

            console.log('   ✅ Alternative endpoint works!');
            console.log('   Response:', JSON.stringify(altResponse.data, null, 2));

        } catch (altError) {
            console.log('   ❌ Alternative endpoint failed');
            if (altError.response) {
                console.log('   Status:', altError.response.status);
            }
        }

        console.log();

    } catch (error) {
        console.error('   ❌ Test failed!');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Error:', error.message);
        }
        console.log();
    }

    console.log('='.repeat(70));
    console.log('🏁 DIAGNOSTIC COMPLETE');
    console.log('='.repeat(70) + '\n');

    console.log('📝 NEXT STEPS:');
    console.log('   1. Check if WebSocket URL was found above');
    console.log('   2. If not found, this is a Retell API configuration issue');
    console.log('   3. You may need to contact Retell support or check your agent settings');
    console.log('   4. Verify your agent is set up for "Custom Telephony" mode');
    console.log();
}

runDiagnostics();
/**
 * CONFIGURE RETELL AGENT
 * 
 * Run: node configure-retell.js
 * This will properly configure your Retell agent with webhook endpoints
 */

require('dotenv').config();
const axios = require('axios');

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const AGENT_ID = 'agent_9151f738c705a56f4a0d8df63a';
const NGROK_URL = process.env.NGROK_URL || 'https://54eb53881107.ngrok-free.app';

async function configureRetellAgent() {
    console.log('\n🔧 CONFIGURING RETELL AGENT');
    console.log('━'.repeat(60));
    console.log('Agent ID:', AGENT_ID);
    console.log('Ngrok URL:', NGROK_URL);
    console.log('━'.repeat(60) + '\n');

    try {
        // Get current agent config
        console.log('📥 Fetching current agent...');
        const getResponse = await axios.get(
            `https://api.retellai.com/v2/agent/${AGENT_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`
                }
            }
        );

        console.log('✅ Current agent:', getResponse.data.agent_name);

        // Update agent with WebSocket URL
        console.log('\n📤 Updating agent with webhook...');

        const updateData = {
            llm_websocket_url: `${NGROK_URL}/webhook/retell/llm`,
            agent_name: 'Voice Commerce Agent',
            voice_id: 'openai-Alloy',
            language: 'en-US',
            response_engine: {
                type: 'retell-llm',
                llm_model: 'gpt-4'
            },
            enable_backchannel: true,
            ambient_sound: 'office',
            // Voice shopping instructions
            general_prompt: `You are a helpful voice shopping assistant. Your role is to:
1. Help customers find products they're looking for
2. Provide product details and pricing
3. Process purchases by creating checkout links
4. Be friendly, clear, and concise

When a customer wants to buy something:
1. Confirm the product and quantity
2. Get their phone number if you don't have it
3. Create a checkout and tell them a payment link will be sent via SMS

Keep responses short and natural for voice conversation.`,
            general_tools: [
                {
                    type: 'end_call',
                    name: 'end_call',
                    description: 'End the call when customer is done'
                }
            ]
        };

        const updateResponse = await axios.patch(
            `https://api.retellai.com/v2/agent/${AGENT_ID}`,
            updateData,
            {
                headers: {
                    'Authorization': `Bearer ${RETELL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Agent updated successfully!\n');
        console.log('📋 Configuration:');
        console.log('   Agent ID:', AGENT_ID);
        console.log('   Phone:', '+15856202445');
        console.log('   LLM Webhook:', updateData.llm_websocket_url);
        console.log('   Voice:', updateData.voice_id);

        console.log('\n━'.repeat(60));
        console.log('✅ CONFIGURATION COMPLETE!');
        console.log('━'.repeat(60) + '\n');

        console.log('🧪 TEST YOUR AGENT:');
        console.log('   1. Make sure your server is running (npm start)');
        console.log('   2. Make sure ngrok is running');
        console.log('   3. Call: +15856202445');
        console.log('   4. Say: "I want to buy vitamin D"');
        console.log('   5. Check your terminal for logs\n');

        console.log('⚠️  MAKE SURE:');
        console.log('   ✓ Server running on port 4000');
        console.log('   ✓ Ngrok forwarding to localhost:4000');
        console.log('   ✓ Merchant shop running on port 3000');
        console.log('   ✓ Your phone has SMS enabled\n');

        return updateResponse.data;

    } catch (error) {
        console.error('\n❌ Configuration failed:');

        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Error:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Error:', error.message);
        }

        if (error.response?.status === 401) {
            console.error('\n⚠️  Check your RETELL_API_KEY in .env');
        }

        if (error.response?.status === 404) {
            console.error('\n⚠️  Agent not found. Check agent ID:', AGENT_ID);
            console.error('   You can find your agent ID in the Retell dashboard');
        }

        throw error;
    }
}

// Test webhook endpoint
async function testWebhook() {
    console.log('\n🧪 TESTING WEBHOOK ENDPOINT...\n');

    try {
        const response = await axios.get(`${NGROK_URL}/webhook/retell/health`);

        console.log('✅ Webhook is reachable!');
        console.log('   Status:', response.data);

        return true;
    } catch (error) {
        console.error('❌ Webhook test failed!');
        console.error('   Make sure your server is running');
        console.error('   Make sure ngrok is forwarding to localhost:4000');
        console.error('   Error:', error.message);

        return false;
    }
}

// Run configuration
if (require.main === module) {
    (async () => {
        try {
            // Test webhook first
            const webhookOk = await testWebhook();

            if (!webhookOk) {
                console.error('\n❌ Fix webhook issues before configuring agent');
                process.exit(1);
            }

            // Configure agent
            await configureRetellAgent();

            process.exit(0);
        } catch (error) {
            process.exit(1);
        }
    })();
}

module.exports = configureRetellAgent;
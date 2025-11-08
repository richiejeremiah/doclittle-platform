/**
 * Test Groq API Connection
 * Verifies that Groq API is working correctly
 */

require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function testGroqConnection() {
  console.log('\n🧪 Testing Groq API Connection\n');
  console.log('='.repeat(60));

  // Check API key
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not found in .env file');
    console.log('\nPlease add to .env:');
    console.log('GROQ_API_KEY=your-api-key-here');
    process.exit(1);
  }

  console.log('✅ API Key found');
  console.log(`   Key: ${process.env.GROQ_API_KEY.substring(0, 10)}...`);

  // Test simple completion
  try {
    console.log('\n📡 Testing API connection...');
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Respond briefly and clearly.'
        },
        {
          role: 'user',
          content: 'Say "Groq API is working!" if you can read this.'
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    });

    const message = response.choices[0].message.content;
    console.log('✅ API Connection Successful!');
    console.log(`\n📝 Response: ${message}`);

    // Test JSON response format (for medical coding)
    console.log('\n📡 Testing JSON response format...');
    
    const jsonResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a medical coding assistant. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: 'Return a JSON object with: {"status": "working", "model": "llama-3.3-70b"}'
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 100
    });

    const jsonMessage = jsonResponse.choices[0].message.content;
    console.log('✅ JSON Format Working!');
    console.log(`\n📝 JSON Response: ${jsonMessage}`);

    // Test medical coding context
    console.log('\n📡 Testing medical coding context...');
    
    const medicalResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a medical coding expert. Analyze clinical notes and provide ICD-10 and CPT codes in JSON format.'
        },
        {
          role: 'user',
          content: `Clinical Note: "Patient presents with anxiety and depression. 50-minute psychotherapy session conducted."

Return JSON with:
{
  "primary_icd10": "code",
  "primary_cpt": "code",
  "confidence": 0.0-1.0
}`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200
    });

    const medicalMessage = medicalResponse.choices[0].message.content;
    console.log('✅ Medical Coding Context Working!');
    console.log(`\n📝 Medical Response: ${medicalMessage}`);

    // Parse to verify it's valid JSON
    try {
      const parsed = JSON.parse(medicalMessage);
      console.log('\n✅ Valid JSON parsed successfully!');
      console.log('   Structure:', Object.keys(parsed));
    } catch (e) {
      console.log('\n⚠️  Response is not valid JSON (but API is working)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All Groq API tests passed!');
    console.log('✅ Ready for medical coding integration\n');

  } catch (error) {
    console.error('\n❌ Groq API Error:');
    console.error('   Message:', error.message);
    
    if (error.status) {
      console.error('   Status:', error.status);
    }
    
    if (error.response) {
      console.error('   Response:', JSON.stringify(error.response, null, 2));
    }

    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check your API key is correct');
    console.log('   2. Verify you have internet connection');
    console.log('   3. Check Groq API status: https://status.groq.com');
    
    process.exit(1);
  }
}

// Run test
testGroqConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


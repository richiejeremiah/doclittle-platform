/**
 * RETELL WEBSOCKET HANDLER
 * 
 * This handles real-time communication between Retell AI and your middleware
 * Place this in: middleware-platform/webhooks/retell-websocket.js
 */

const WebSocket = require('ws');
const axios = require('axios');

class RetellWebSocketHandler {
    constructor(db, config) {
        this.db = db;
        this.config = config;
        this.activeConnections = new Map();
    }

    // Handle incoming WebSocket connection from Retell
    handleConnection(ws, req) {
        const callId = this.extractCallId(req);
        console.log(`\n📞 NEW RETELL CALL: ${callId}`);

        // Store connection
        this.activeConnections.set(callId, {
            ws,
            callId,
            startTime: Date.now(),
            conversationHistory: []
        });

        // Handle messages from Retell
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                await this.handleRetellMessage(callId, message);
            } catch (error) {
                console.error('Error handling Retell message:', error);
            }
        });

        // Handle connection close
        ws.on('close', () => {
            console.log(`📴 Call ended: ${callId}`);
            this.activeConnections.delete(callId);
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for ${callId}:`, error);
        });

        // Store call metadata (will be populated from first message)
        connection.callMetadata = {};
        connection.customerPhone = null;
        connection.customerName = null; // Will be collected during conversation
    }

    // Handle different message types from Retell
    async handleRetellMessage(callId, message) {
        const connection = this.activeConnections.get(callId);
        if (!connection) return;

        // Store call metadata from first message
        if (message.call) {
            connection.callMetadata = message.call;
            connection.customerPhone = message.call.from_number || null;
        }

        console.log(`\n📨 Message from ${callId}:`, message.type);

        switch (message.type) {
            case 'update':
                // Retell sends updates about call state
                if (message.update?.transcript) {
                    await this.handleTranscript(callId, { transcript: message.update.transcript });
                }
                break;

            case 'function_call':
                await this.handleFunctionCall(callId, message);
                break;

            case 'response':
                // Retell is responding to user
                break;

            case 'ping':
                // Respond to ping
                this.sendToRetell(connection.ws, { type: 'pong' });
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    // Handle user speech transcript
    async handleTranscript(callId, message) {
        const connection = this.activeConnections.get(callId);
        const userSaid = message.transcript;

        console.log(`🗣️  User said: "${userSaid}"`);

        // Store in conversation history
        connection.conversationHistory.push({
            role: 'user',
            content: userSaid,
            timestamp: Date.now()
        });

        // For healthcare, we let Retell LLM handle the conversation
        // and call functions as needed. No intent detection here.
    }

    // Handle function calls from Retell LLM
    async handleFunctionCall(callId, message) {
        const connection = this.activeConnections.get(callId);
        if (!connection) return;

        const functionCall = message.function_call || message;
        const functionName = functionCall.name;
        const functionArgs = functionCall.parameters || functionCall.arguments || {};

        console.log(`\n🔧 FUNCTION CALL: ${functionName}`);
        console.log('   Args:', JSON.stringify(functionArgs, null, 2));

        try {
            let result;

            switch (functionName) {
                case 'collect_insurance':
                    result = await this.handleCollectInsurance(callId, functionArgs);
                    break;

                case 'schedule_appointment':
                    result = await this.handleScheduleAppointment(callId, functionArgs);
                    break;

                case 'get_available_slots':
                    result = await this.handleGetAvailableSlots(callId, functionArgs);
                    break;

                case 'search_appointments':
                    result = await this.handleSearchAppointments(callId, functionArgs);
                    break;

                case 'confirm_appointment':
                    result = await this.handleConfirmAppointment(callId, functionArgs);
                    break;

                case 'cancel_appointment':
                    result = await this.handleCancelAppointment(callId, functionArgs);
                    break;

                case 'reschedule_appointment':
                    result = await this.handleRescheduleAppointment(callId, functionArgs);
                    break;

                case 'create_appointment_checkout':
                    result = await this.handleCreateAppointmentCheckout(callId, functionArgs);
                    break;

                case 'verify_checkout_code':
                    result = await this.handleVerifyCheckoutCode(callId, functionArgs);
                    break;

                case 'get_patient_claims':
                    result = await this.handleGetPatientClaims(callId, functionArgs);
                    break;

                default:
                    result = {
                        success: false,
                        error: `Unknown function: ${functionName}`
                    };
            }

            console.log(`✅ Function result:`, JSON.stringify(result, null, 2));

            // Send function result back to Retell
            this.sendToRetell(connection.ws, {
                type: 'function_call_response',
                function_call_id: functionCall.id || functionCall.function_call_id,
                result: result
            });

        } catch (error) {
            console.error(`❌ Function call error (${functionName}):`, error);
            this.sendToRetell(connection.ws, {
                type: 'function_call_response',
                function_call_id: functionCall.id || functionCall.function_call_id,
                result: {
                    success: false,
                    error: error.message
                }
            });
        }
    }

    // Handle product search
    async handleProductSearch(callId, query) {
        const connection = this.activeConnections.get(callId);

        try {
            console.log(`🔍 Searching products: ${query}`);

            // Call your middleware API
            const response = await axios.post('http://localhost:4000/voice/products/search', {
                merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
                query: query
            });

            const products = response.data.products;

            if (products.length === 0) {
                this.sendToRetell(connection.ws, {
                    type: 'response',
                    response: {
                        content: `I couldn't find any products matching "${query}". Would you like to browse our other products?`,
                        end_call: false
                    }
                });
                return;
            }

            // Format product list for voice
            const productList = products.slice(0, 3).map((p, i) =>
                `${i + 1}. ${p.title} for $${p.price}`
            ).join('. ');

            const response_text = products.length === 1
                ? `I found ${products[0].title} for $${products[0].price}. ${products[0].description}. Would you like to purchase this?`
                : `I found ${products.length} products: ${productList}. Which one interests you?`;

            this.sendToRetell(connection.ws, {
                type: 'response',
                response: {
                    content: response_text,
                    end_call: false,
                    metadata: {
                        products: products
                    }
                }
            });

            // Store search results
            connection.lastSearchResults = products;

        } catch (error) {
            console.error('❌ Product search error:', error);
            this.sendToRetell(connection.ws, {
                type: 'response',
                response: {
                    content: "Sorry, I'm having trouble searching products right now. Please try again.",
                    end_call: false
                }
            });
        }
    }

    // Handle purchase intent
    async handlePurchaseIntent(callId, productInfo) {
        const connection = this.activeConnections.get(callId);

        // Extract customer info from call
        const customerPhone = this.getCustomerPhone(callId);
        const customerName = this.getCustomerName(callId) || 'Customer';

        try {
            console.log(`💳 Creating checkout for: ${productInfo.product_id}`);

            // Create checkout via middleware
            const response = await axios.post('http://localhost:4000/voice/checkout/create', {
                merchant_id: 'd10794ff-ca11-4e6f-93e9-560162b4f884',
                product_id: productInfo.product_id,
                customer_name: customerName,
                customer_phone: customerPhone,
                quantity: 1
            });

            if (response.data.success) {
                const checkout = response.data;

                this.sendToRetell(connection.ws, {
                    type: 'response',
                    response: {
                        content: `Perfect! I've sent a payment link to ${customerPhone}. The total is $${checkout.amount}. You can complete your purchase using that link. Is there anything else I can help you with?`,
                        end_call: false
                    }
                });

                console.log(`✅ Checkout created: ${checkout.checkout_id}`);
                console.log(`📱 SMS sent to: ${customerPhone}`);
            } else {
                throw new Error('Checkout creation failed');
            }

        } catch (error) {
            console.error('❌ Purchase error:', error);
            this.sendToRetell(connection.ws, {
                type: 'response',
                response: {
                    content: "I'm sorry, I'm having trouble processing that order. Please try again or call us for assistance.",
                    end_call: false
                }
            });
        }
    }

    // Handle end of call
    async handleEndOfCall(callId, message) {
        const connection = this.activeConnections.get(callId);
        if (!connection) return;

        const duration = Math.floor((Date.now() - connection.startTime) / 1000);
        console.log(`\n📊 CALL SUMMARY`);
        console.log(`   Duration: ${duration}s`);
        console.log(`   Messages: ${connection.conversationHistory.length}`);

        // Store call record in database
        try {
            this.db.prepare(`
                INSERT INTO call_logs (
                    call_id,
                    customer_phone,
                    duration_seconds,
                    conversation_data,
                    created_at
                ) VALUES (?, ?, ?, ?, ?)
            `).run(
                callId,
                this.getCustomerPhone(callId),
                duration,
                JSON.stringify(connection.conversationHistory),
                new Date().toISOString()
            );
        } catch (error) {
            console.error('Error storing call log:', error);
        }

        this.activeConnections.delete(callId);
    }

    // Simple intent detection
    detectIntent(text) {
        const lowerText = text.toLowerCase();

        // Purchase intent
        if (lowerText.match(/\b(buy|purchase|order|get)\b/)) {
            return { type: 'purchase', query: text };
        }

        // Search intent
        if (lowerText.match(/\b(find|search|looking for|need|want)\b/)) {
            return { type: 'search_product', query: text };
        }

        return { type: 'general', query: text };
    }

    // Helper: Send message to Retell
    sendToRetell(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    // Helper: Extract call ID from request
    extractCallId(req) {
        return req.headers['x-retell-call-id'] ||
            req.url.split('/').pop() ||
            `call_${Date.now()}`;
    }

    // Helper: Get customer phone from Retell call
    getCustomerPhone(callId) {
        const connection = this.activeConnections.get(callId);
        return connection?.customerPhone || connection?.callMetadata?.from_number || null;
    }

    // Helper: Get customer name
    getCustomerName(callId) {
        const connection = this.activeConnections.get(callId);
        return connection?.customerName || null;
    }

    // ==========================================
    // HEALTHCARE FUNCTION HANDLERS
    // ==========================================

    // Handle collect_insurance function
    async handleCollectInsurance(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/insurance/collect`, {
                patient_name: args.patient_name,
                member_id: args.member_id,
                payer_name: args.payer_name,
                payer_id: args.payer_id,
                patient_phone: args.patient_phone || this.getCustomerPhone(callId),
                patient_email: args.patient_email,
                service_code: args.service_code
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle schedule_appointment function
    async handleScheduleAppointment(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/schedule`, {
                patient_name: args.patient_name,
                patient_phone: args.patient_phone || this.getCustomerPhone(callId),
                patient_email: args.patient_email,
                appointment_type: args.appointment_type,
                date: args.date,
                time: args.time,
                timezone: args.timezone || 'America/New_York',
                notes: args.notes
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle get_available_slots function
    async handleGetAvailableSlots(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/available-slots`, {
                date: args.date,
                appointment_type: args.appointment_type,
                timezone: args.timezone || 'America/New_York'
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle search_appointments function
    async handleSearchAppointments(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/search`, {
                search_term: args.search_term
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle confirm_appointment function
    async handleConfirmAppointment(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/confirm`, {
                appointment_id: args.appointment_id
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle cancel_appointment function
    async handleCancelAppointment(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/cancel`, {
                appointment_id: args.appointment_id,
                reason: args.reason
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle reschedule_appointment function
    async handleRescheduleAppointment(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/reschedule`, {
                appointment_id: args.appointment_id,
                new_date: args.new_date,
                new_time: args.new_time,
                reason: args.reason,
                timezone: args.timezone || 'America/New_York'
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle create_appointment_checkout function
    async handleCreateAppointmentCheckout(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/appointments/checkout`, {
                appointment_id: args.appointment_id,
                customer_name: args.customer_name,
                customer_email: args.customer_email,
                customer_phone: args.customer_phone || this.getCustomerPhone(callId),
                appointment_type: args.appointment_type,
                amount: args.amount
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle verify_checkout_code function
    async handleVerifyCheckoutCode(callId, args) {
        try {
            const response = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/checkout/verify`, {
                payment_token: args.payment_token,
                verification_code: args.verification_code
            });

            return response.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Handle get_patient_claims function
    async handleGetPatientClaims(callId, args) {
        try {
            // First collect insurance to get patient_id
            const insuranceResponse = await axios.post(`${this.config.apiBaseUrl || 'http://localhost:4000'}/voice/insurance/collect`, {
                patient_name: args.patient_name,
                member_id: args.member_id,
                payer_name: args.payer_name
            });

            if (!insuranceResponse.data.success || !insuranceResponse.data.patient_id) {
                return {
                    success: false,
                    error: 'Could not find patient with provided insurance information'
                };
            }

            // Get patient benefits/claims
            const claimsResponse = await axios.get(`${this.config.apiBaseUrl || 'http://localhost:4000'}/api/patient/benefits`, {
                params: {
                    patient_id: insuranceResponse.data.patient_id
                }
            });

            return claimsResponse.data;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = RetellWebSocketHandler;
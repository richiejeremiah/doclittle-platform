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

        // Send initial greeting
        this.sendToRetell(ws, {
            type: 'response',
            response: {
                content: "Hi! I'm your voice shopping assistant. How can I help you today?",
                end_call: false
            }
        });
    }

    // Handle different message types from Retell
    async handleRetellMessage(callId, message) {
        const connection = this.activeConnections.get(callId);
        if (!connection) return;

        console.log(`\n📨 Message from ${callId}:`, message.type);

        switch (message.type) {
            case 'transcript':
                await this.handleTranscript(callId, message);
                break;

            case 'function_call':
                await this.handleFunctionCall(callId, message);
                break;

            case 'end_of_call':
                await this.handleEndOfCall(callId, message);
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

        // Detect shopping intent
        const intent = this.detectIntent(userSaid);

        if (intent.type === 'search_product') {
            await this.handleProductSearch(callId, intent.query);
        } else if (intent.type === 'purchase') {
            await this.handlePurchaseIntent(callId, intent.product);
        } else {
            // General conversation
            this.sendToRetell(connection.ws, {
                type: 'response',
                response: {
                    content: "I can help you find and purchase products. What are you looking for?",
                    end_call: false
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
        // In production, extract from Retell call data
        // For now, return test number
        return '+18622307479';
    }

    // Helper: Get customer name
    getCustomerName(callId) {
        return 'Voice Customer';
    }
}

module.exports = RetellWebSocketHandler;
/**
 * SMS SERVICE
 * Sends payment links via Twilio
 * Falls back to simulation if Twilio not configured
 */

const twilio = require('twilio');

class SMSService {
    /**
     * Get Twilio client
     * Returns null if credentials not configured
     */
    static getTwilioClient() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            console.warn('⚠️  Twilio credentials not configured - SMS will be simulated');
            return null;
        }

        return twilio(accountSid, authToken);
    }

    /**
     * Send payment link via SMS
     * Uses Twilio if configured, otherwise simulates
     */
    static async sendPaymentLink(phoneNumber, paymentLink, orderDetails) {
        try {
            const client = this.getTwilioClient();
            const fromNumber = process.env.TWILIO_PHONE_NUMBER;

            // Validate phone number format
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            if (!this.validatePhoneNumber(formattedPhone)) {
                throw new Error(`Invalid phone number format: ${phoneNumber}`);
            }

            // Format SMS message
            const message = this.formatPaymentMessage(paymentLink, orderDetails);

            // If Twilio is configured, send real SMS
            if (client && fromNumber) {
                console.log('\n📱 SENDING REAL SMS VIA TWILIO');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`From: ${fromNumber}`);
                console.log(`To: ${formattedPhone}`);
                console.log(`Message Length: ${message.length} characters`);
                console.log(`Message:\n${message}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                try {
                    const result = await client.messages.create({
                        body: message,
                        from: fromNumber,
                        to: formattedPhone
                    });

                    console.log(`✅ SMS sent successfully!`);
                    console.log(`   Message SID: ${result.sid}`);
                    console.log(`   Status: ${result.status}`);
                    console.log(`   To: ${result.to}\n`);

                    return {
                        success: true,
                        message_sid: result.sid,
                        status: result.status,
                        to: formattedPhone,
                        provider: 'twilio',
                        real_sms: true
                    };
                } catch (twilioError) {
                    console.error('❌ Twilio API Error:', twilioError.message);
                    console.error('   Error Code:', twilioError.code);
                    console.error('   More Info:', twilioError.moreInfo);

                    throw new Error(`Twilio SMS failed: ${twilioError.message}`);
                }
            } else {
                // Fallback to simulation if Twilio not configured
                console.log('\n📱 SMS SIMULATION (Twilio not configured)');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`To: ${formattedPhone}`);
                console.log(`Message:\n${message}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('💡 To send real SMS, add Twilio credentials to .env file');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                return {
                    success: true,
                    simulated: true,
                    message: 'SMS simulated - Twilio not configured',
                    phone: formattedPhone,
                    real_sms: false
                };
            }

        } catch (error) {
            console.error('❌ SMS Service Error:', error.message);

            // Return error details
            return {
                success: false,
                error: error.message,
                code: error.code || 'UNKNOWN',
                phone: phoneNumber,
                real_sms: false
            };
        }
    }

    /**
     * Format SMS message for payment link
     */
    static formatPaymentMessage(paymentLink, orderDetails) {
        const { product_name, amount, merchant_name } = orderDetails;

        return `${merchant_name}: Complete your order for ${product_name} ($${amount}):\n\n${paymentLink}\n\nLink expires in 1 hour.`;
    }

    /**
     * Send order confirmation SMS
     * Called after payment is completed
     */
    static async sendOrderConfirmation(phoneNumber, orderDetails) {
        try {
            const client = this.getTwilioClient();
            const fromNumber = process.env.TWILIO_PHONE_NUMBER;
            const formattedPhone = this.formatPhoneNumber(phoneNumber);

            const message = `Order confirmed! Your ${orderDetails.product_name} will be shipped soon. Order #${orderDetails.order_id}`;

            if (client && fromNumber) {
                console.log('\n📱 SENDING ORDER CONFIRMATION');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`To: ${formattedPhone}`);
                console.log(`Message: ${message}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                const result = await client.messages.create({
                    body: message,
                    from: fromNumber,
                    to: formattedPhone
                });

                console.log(`✅ Confirmation sent! SID: ${result.sid}\n`);

                return {
                    success: true,
                    message_sid: result.sid,
                    status: result.status,
                    real_sms: true
                };
            } else {
                console.log('\n📱 ORDER CONFIRMATION SIMULATION');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`To: ${formattedPhone}`);
                console.log(`Message: ${message}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                return {
                    success: true,
                    simulated: true,
                    real_sms: false
                };
            }

        } catch (error) {
            console.error('❌ Order confirmation SMS error:', error.message);
            return {
                success: false,
                error: error.message,
                real_sms: false
            };
        }
    }

    /**
     * Validate phone number format (E.164)
     */
    static validatePhoneNumber(phoneNumber) {
        // E.164 format: +[country code][number]
        // Example: +18622307479
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        return phoneRegex.test(phoneNumber);
    }

    /**
     * Format phone number to E.164 standard
     */
    static formatPhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');

        // If it starts with 1 and has 11 digits (US number)
        if (cleaned.length === 11 && cleaned[0] === '1') {
            return `+${cleaned}`;
        }

        // If it has 10 digits (US number without country code)
        if (cleaned.length === 10) {
            return `+1${cleaned}`;
        }

        // Already has country code
        if (cleaned.length > 10) {
            return `+${cleaned}`;
        }

        // If starts with +, return as-is
        if (phoneNumber.startsWith('+')) {
            return phoneNumber;
        }

        // Default: assume US number
        return `+1${cleaned}`;
    }

    /**
     * Check if Twilio is configured
     */
    static isConfigured() {
        return !!(
            process.env.TWILIO_ACCOUNT_SID &&
            process.env.TWILIO_AUTH_TOKEN &&
            process.env.TWILIO_PHONE_NUMBER
        );
    }

    /**
     * Get configuration status
     */
    static getStatus() {
        return {
            configured: this.isConfigured(),
            account_sid: process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing',
            auth_token: process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing',
            phone_number: process.env.TWILIO_PHONE_NUMBER || '❌ Missing'
        };
    }
}

module.exports = SMSService;
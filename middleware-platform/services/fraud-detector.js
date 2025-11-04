/**
 * FRAUD DETECTION SERVICE
 * 
 * Multi-signal fraud detection system optimized for AI/voice commerce.
 * This is your competitive moat - tracks agent behavior, not just transactions.
 * 
 * Risk Score: 0-100
 * - 0-49: LOW RISK (auto-approve)
 * - 50-79: MEDIUM RISK (require SMS verification)
 * - 80-100: HIGH RISK (block transaction)
 */

const db = require('../database');
const crypto = require('crypto');

class FraudDetector {
    /**
     * Main fraud detection entry point
     * Analyzes transaction and returns risk assessment
     */
    static async analyzeTransaction(paymentRequest) {
        console.log('\n🛡️  FRAUD DETECTION STARTED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        try {
            // Collect all fraud signals
            const signals = await this._collectSignals(paymentRequest);

            // Calculate risk score
            const riskScore = this._calculateRiskScore(signals);
            const riskLevel = this._getRiskLevel(riskScore);

            // Generate human-readable reasons
            const reasons = this._generateReasons(signals);

            console.log(`📊 Risk Score: ${riskScore}/100`);
            console.log(`📋 Risk Level: ${riskLevel}`);
            console.log(`⚠️  Reasons: ${reasons.slice(0, 3).join(', ')}`);

            // Log fraud check to database
            this._logFraudCheck(paymentRequest, riskScore, signals, riskLevel);

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            return {
                risk_score: riskScore,
                risk_level: riskLevel,
                should_block: riskScore >= 80,
                requires_verification: riskScore >= 50 && riskScore < 80,
                signals: signals,
                reasons: reasons,
                transaction_id: paymentRequest.transaction_id,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Fraud detection error:', error);
            // Fail open (allow transaction) but log error
            return {
                risk_score: 0,
                risk_level: 'LOW',
                should_block: false,
                requires_verification: false,
                signals: {},
                reasons: ['Fraud check failed - proceeding with caution'],
                error: error.message
            };
        }
    }

    /**
     * Collect all fraud detection signals
     * @private
     */
    static async _collectSignals(request) {
        const signals = {
            // Customer signals
            customer: await this._analyzeCustomer(request.customer),

            // Transaction signals
            transaction: await this._analyzeTransactionPattern(request),

            // Agent signals (COMPETITIVE ADVANTAGE!)
            agent: await this._analyzeAgent(request.source),

            // Velocity signals
            velocity: await this._analyzeVelocity(request.customer),

            // Payment method signals
            payment: this._analyzePaymentMethod(request.payment),

            // Time-based signals
            temporal: this._analyzeTiming(),

            // Blacklist check
            blacklist: await this._checkBlacklist(request.customer)
        };

        return signals;
    }

    /**
     * Analyze customer signals
     * @private
     */
    static async _analyzeCustomer(customer) {
        const signals = {
            has_phone: !!customer.phone,
            has_email: !!customer.email,
            has_name: !!customer.name,
            phone_valid: false,
            email_valid: false,
            is_new_customer: true,
            previous_orders: 0,
            previous_fraud: 0,
            phone_type: 'unknown'
        };

        // Phone validation
        if (customer.phone) {
            signals.phone_valid = this._validatePhoneFormat(customer.phone);
            signals.phone_type = this._detectPhoneType(customer.phone);
        }

        // Email validation
        if (customer.email) {
            signals.email_valid = this._validateEmailFormat(customer.email);
            signals.email_domain = this._getEmailDomain(customer.email);
            signals.is_disposable_email = this._isDisposableEmail(customer.email);
        }

        // Customer history
        try {
            const history = await this._getCustomerHistory(customer);
            signals.is_new_customer = history.order_count === 0;
            signals.previous_orders = history.order_count;
            signals.previous_fraud = history.fraud_count;
            signals.lifetime_value = history.total_spent;
        } catch (error) {
            console.log('⚠️  Could not fetch customer history:', error.message);
        }

        return signals;
    }

    /**
     * Analyze transaction patterns
     * @private
     */
    static async _analyzeTransactionPattern(request) {
        const signals = {
            amount: request.totals.total,
            has_items: request.items && request.items.length > 0,
            item_count: request.items ? request.items.length : 0,
            merchant_exists: false,
            is_unusual_amount: false,
            deviation_from_avg: 1
        };

        try {
            const merchant = db.getMerchant(request.merchant_id);
            signals.merchant_exists = !!merchant;

            if (merchant) {
                // Get merchant's average order value
                const merchantStats = await this._getMerchantStats(request.merchant_id);
                signals.merchant_avg_order = merchantStats.avg_order_value;

                if (merchantStats.avg_order_value > 0) {
                    signals.deviation_from_avg = signals.amount / merchantStats.avg_order_value;
                    signals.is_unusual_amount = signals.deviation_from_avg > 3 || signals.deviation_from_avg < 0.1;
                }
            }
        } catch (error) {
            console.log('⚠️  Could not analyze transaction pattern:', error.message);
        }

        return signals;
    }

    /**
     * Analyze agent signals (YOUR COMPETITIVE MOAT!)
     * @private
     */
    static async _analyzeAgent(source) {
        const signals = {
            protocol: source.protocol,
            platform: source.platform,
            input_type: source.input_type,
            is_known_platform: false,
            platform_reputation: 0,
            agent_transaction_count: 0,
            agent_fraud_rate: 0,
            agent_chargeback_rate: 0,
            agent_success_rate: 0
        };

        // Known platforms with base reputation scores
        const platformReputation = {
            'chatgpt': 95,
            'retell': 90,
            'vapi': 88,
            'bland': 85,
            'voiceflow': 85,
            'voice': 80,
            'unknown': 30
        };

        const platform = (source.platform || 'unknown').toLowerCase();
        signals.is_known_platform = platform !== 'unknown' && platformReputation[platform] !== undefined;
        signals.platform_reputation = platformReputation[platform] || 30;

        // Get historical agent performance
        try {
            const agentStats = db.getAgentStats(source.platform);
            signals.agent_transaction_count = agentStats.total_transactions;
            signals.agent_fraud_rate = agentStats.fraud_rate;
            signals.agent_chargeback_rate = agentStats.chargeback_rate;
            signals.agent_success_rate = agentStats.success_rate;
        } catch (error) {
            console.log('⚠️  Could not fetch agent stats:', error.message);
        }

        return signals;
    }

    /**
     * Analyze velocity (rate of transactions)
     * @private
     */
    static async _analyzeVelocity(customer) {
        const signals = {
            transactions_last_hour: 0,
            transactions_last_24h: 0,
            unique_merchants_24h: 0,
            failed_attempts_1h: 0
        };

        try {
            // Check by phone
            if (customer.phone) {
                const phoneVelocity = await this._getPhoneVelocity(customer.phone);
                signals.transactions_last_hour = phoneVelocity.last_hour;
                signals.transactions_last_24h = phoneVelocity.last_24h;
                signals.unique_merchants_24h = phoneVelocity.unique_merchants;
                signals.failed_attempts_1h = phoneVelocity.failed_attempts;
            }

            // Check by email
            if (customer.email) {
                const emailVelocity = await this._getEmailVelocity(customer.email);
                signals.transactions_last_hour = Math.max(
                    signals.transactions_last_hour,
                    emailVelocity.last_hour
                );
            }
        } catch (error) {
            console.log('⚠️  Could not analyze velocity:', error.message);
        }

        return signals;
    }

    /**
     * Analyze payment method
     * @private
     */
    static _analyzePaymentMethod(payment) {
        return {
            method: payment.method,
            is_link: payment.method === 'link',
            is_direct: payment.method === 'stripe',
            currency: payment.currency,
            save_for_future: payment.save_for_future
        };
    }

    /**
     * Analyze transaction timing
     * @private
     */
    static _analyzeTiming() {
        const now = new Date();
        const hour = now.getHours();

        return {
            hour: hour,
            is_late_night: hour >= 1 && hour <= 5,
            is_business_hours: hour >= 9 && hour <= 17,
            day_of_week: now.getDay(),
            is_weekend: now.getDay() === 0 || now.getDay() === 6
        };
    }

    /**
     * Check blacklist
     * @private
     */
    static async _checkBlacklist(customer) {
        const blacklisted = {
            phone: false,
            email: false,
            reason: null
        };

        try {
            if (customer.phone) {
                const phoneBlacklist = db.checkBlacklist('phone', customer.phone);
                if (phoneBlacklist) {
                    blacklisted.phone = true;
                    blacklisted.reason = phoneBlacklist.reason;
                }
            }

            if (customer.email) {
                const emailBlacklist = db.checkBlacklist('email', customer.email);
                if (emailBlacklist) {
                    blacklisted.email = true;
                    blacklisted.reason = emailBlacklist.reason;
                }
            }
        } catch (error) {
            console.log('⚠️  Could not check blacklist:', error.message);
        }

        return blacklisted;
    }

    /**
     * Calculate final risk score (0-100)
     * @private
     */
    static _calculateRiskScore(signals) {
        let score = 0;

        // BLACKLIST CHECK (instant block)
        if (signals.blacklist.phone || signals.blacklist.email) {
            return 100;
        }

        // CUSTOMER SIGNALS (max 30 points)
        if (!signals.customer.phone_valid) score += 10;
        if (!signals.customer.email_valid && signals.customer.has_email) score += 5;
        if (signals.customer.is_disposable_email) score += 10;
        if (signals.customer.phone_type === 'voip') score += 8;
        if (signals.customer.is_new_customer) score += 5;
        if (signals.customer.previous_fraud > 0) score += 15;

        // TRANSACTION SIGNALS (max 20 points)
        if (signals.transaction.is_unusual_amount) score += 15;
        if (!signals.transaction.merchant_exists) score += 10;

        // AGENT SIGNALS (max 25 points) - YOUR COMPETITIVE MOAT!
        if (!signals.agent.is_known_platform) score += 15;
        if (signals.agent.platform_reputation < 50) score += 10;
        if (signals.agent.agent_fraud_rate > 0.05) score += 10; // >5% fraud rate
        if (signals.agent.agent_chargeback_rate > 0.03) score += 5; // >3% chargeback

        // VELOCITY SIGNALS (max 20 points)
        if (signals.velocity.transactions_last_hour > 3) score += 10;
        if (signals.velocity.transactions_last_24h > 10) score += 8;
        if (signals.velocity.failed_attempts_1h > 2) score += 12;
        if (signals.velocity.unique_merchants_24h > 5) score += 8;

        // TEMPORAL SIGNALS (max 10 points)
        if (signals.temporal.is_late_night) score += 8;
        if (signals.temporal.is_weekend) score += 3;

        // Cap at 100
        return Math.min(score, 100);
    }

    /**
     * Get risk level from score
     * @private
     */
    static _getRiskLevel(score) {
        if (score < 50) return 'LOW';
        if (score < 80) return 'MEDIUM';
        return 'HIGH';
    }

    /**
     * Generate human-readable reasons
     * @private
     */
    static _generateReasons(signals) {
        const reasons = [];

        if (signals.blacklist.phone || signals.blacklist.email) {
            reasons.push(`Blacklisted: ${signals.blacklist.reason}`);
        }

        if (!signals.customer.phone_valid) {
            reasons.push('Invalid phone number');
        }

        if (signals.customer.is_disposable_email) {
            reasons.push('Disposable email detected');
        }

        if (signals.customer.phone_type === 'voip') {
            reasons.push('VoIP phone number');
        }

        if (signals.velocity.transactions_last_hour > 3) {
            reasons.push(`High velocity: ${signals.velocity.transactions_last_hour} transactions/hour`);
        }

        if (signals.velocity.failed_attempts_1h > 2) {
            reasons.push(`${signals.velocity.failed_attempts_1h} failed attempts in last hour`);
        }

        if (!signals.agent.is_known_platform) {
            reasons.push('Unknown agent platform');
        }

        if (signals.agent.agent_fraud_rate > 0.05) {
            reasons.push(`Agent fraud rate: ${(signals.agent.agent_fraud_rate * 100).toFixed(1)}%`);
        }

        if (signals.transaction.is_unusual_amount) {
            reasons.push(`Unusual amount (${signals.transaction.deviation_from_avg.toFixed(1)}x average)`);
        }

        if (signals.temporal.is_late_night) {
            reasons.push('Late night transaction (1-5 AM)');
        }

        if (reasons.length === 0) {
            reasons.push('No significant risk factors');
        }

        return reasons;
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    static _validatePhoneFormat(phone) {
        // E.164 format: +[country code][number]
        return /^\+[1-9]\d{1,14}$/.test(phone);
    }

    static _detectPhoneType(phone) {
        // Simple heuristic - in production use Twilio Lookup API
        const voipPrefixes = ['555', '800', '888', '877', '866', '844', '855'];
        const number = phone.replace(/\D/g, '');
        const prefix = number.substring(1, 4);

        return voipPrefixes.includes(prefix) ? 'voip' : 'mobile';
    }

    static _validateEmailFormat(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static _getEmailDomain(email) {
        return email.split('@')[1]?.toLowerCase();
    }

    static _isDisposableEmail(email) {
        const disposableDomains = [
            'tempmail.com', 'guerrillamail.com', '10minutemail.com',
            'mailinator.com', 'throwaway.email', 'temp-mail.org',
            'yopmail.com', 'trashmail.com'
        ];
        const domain = this._getEmailDomain(email);
        return disposableDomains.includes(domain);
    }

    static async _getCustomerHistory(customer) {
        try {
            const transactions = db.getTransactionsByCustomer(
                customer.phone,
                customer.email
            );

            const fraudChecks = db.getFraudChecksByCustomer(
                customer.phone,
                customer.email
            );

            return {
                order_count: transactions.length,
                fraud_count: fraudChecks.filter(f => f.is_fraud).length,
                total_spent: transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
            };
        } catch (error) {
            return { order_count: 0, fraud_count: 0, total_spent: 0 };
        }
    }

    static async _getMerchantStats(merchantId) {
        try {
            const transactions = db.getTransactionsByMerchant(merchantId);
            const completed = transactions.filter(t => t.status === 'completed');

            const avgOrderValue = completed.length > 0
                ? completed.reduce((sum, t) => sum + t.amount, 0) / completed.length
                : 50;

            return {
                total_transactions: transactions.length,
                avg_order_value: avgOrderValue
            };
        } catch (error) {
            return { total_transactions: 0, avg_order_value: 50 };
        }
    }

    static async _getPhoneVelocity(phone) {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now - 60 * 60 * 1000);
            const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

            const recentTransactions = db.getTransactionsByPhone(phone, oneDayAgo);

            return {
                last_hour: recentTransactions.filter(t =>
                    new Date(t.created_at) > oneHourAgo
                ).length,
                last_24h: recentTransactions.length,
                unique_merchants: new Set(recentTransactions.map(t => t.merchant_id)).size,
                failed_attempts: recentTransactions.filter(t =>
                    t.status === 'failed' && new Date(t.created_at) > oneHourAgo
                ).length
            };
        } catch (error) {
            return { last_hour: 0, last_24h: 0, unique_merchants: 0, failed_attempts: 0 };
        }
    }

    static async _getEmailVelocity(email) {
        try {
            const now = new Date();
            const oneHourAgo = new Date(now - 60 * 60 * 1000);
            const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

            const recentTransactions = db.getTransactionsByEmail(email, oneDayAgo);

            return {
                last_hour: recentTransactions.filter(t =>
                    new Date(t.created_at) > oneHourAgo
                ).length,
                last_24h: recentTransactions.length
            };
        } catch (error) {
            return { last_hour: 0, last_24h: 0 };
        }
    }

    static _logFraudCheck(request, riskScore, signals, riskLevel) {
        try {
            db.createFraudCheck({
                id: crypto.randomBytes(16).toString('hex'),
                transaction_id: request.transaction_id,
                customer_phone: request.customer.phone,
                customer_email: request.customer.email,
                merchant_id: request.merchant_id,
                agent_platform: request.source.platform,
                risk_score: riskScore,
                risk_level: riskLevel,
                signals: JSON.stringify(signals),
                is_fraud: riskScore >= 80,
                requires_verification: riskScore >= 50 && riskScore < 80
            });
        } catch (error) {
            console.error('⚠️  Failed to log fraud check:', error.message);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    static addToBlacklist(type, value, reason, addedBy = 'system') {
        return db.addToBlacklist(type, value, reason, addedBy);
    }

    static removeFromBlacklist(type, value) {
        return db.removeFromBlacklist(type, value);
    }

    static addToWhitelist(type, value, addedBy = 'system') {
        return db.addToWhitelist(type, value, addedBy);
    }

    static async getFraudStats(timeframe = '24h') {
        return db.getFraudStats(timeframe);
    }
}

module.exports = FraudDetector;
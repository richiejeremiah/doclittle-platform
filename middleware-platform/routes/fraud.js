/**
 * FRAUD DETECTION API ROUTES
 * Endpoints for fraud monitoring, review, and management
 */

const express = require('express');
const db = require('../database');
const FraudDetector = require('../services/fraud-detector');

const router = express.Router();

/**
 * Get fraud dashboard overview
 * GET /api/fraud/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '24h';

        // Get fraud statistics
        const stats = db.getFraudStats(timeframe);

        // Get high-risk transactions pending review
        const highRiskTransactions = db.getHighRiskFraudChecks();

        // Get recent fraud checks
        const recentChecks = db.getAllFraudChecks(50);

        // Get blacklist/whitelist counts
        const blacklist = db.getAllBlacklisted();
        const whitelist = db.getAllWhitelisted();

        // Get agent platform reputation
        const agentPlatforms = ['chatgpt', 'retell', 'vapi', 'bland', 'voiceflow', 'voice', 'unknown'];
        const agentReputation = agentPlatforms.map(platform => {
            const stats = db.getAgentStats(platform);
            return {
                platform,
                ...stats,
                reputation_score: calculateReputationScore(stats)
            };
        }).filter(a => a.total_transactions > 0);

        res.json({
            success: true,
            timeframe,
            stats,
            high_risk_pending: highRiskTransactions.length,
            high_risk_transactions: highRiskTransactions.map(t => ({
                ...t,
                signals: JSON.parse(t.signals || '{}')
            })),
            recent_checks: recentChecks.slice(0, 20).map(c => ({
                ...c,
                signals: JSON.parse(c.signals || '{}')
            })),
            blacklist_count: blacklist.length,
            whitelist_count: whitelist.length,
            agent_reputation: agentReputation
        });
    } catch (error) {
        console.error('Fraud dashboard error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Calculate reputation score helper
 */
function calculateReputationScore(stats) {
    if (stats.total_transactions === 0) return 0;

    const fraudPenalty = stats.fraud_rate * 50;
    const chargebackPenalty = stats.chargeback_rate * 30;
    const successBonus = stats.success_rate * 20;

    const score = 100 - fraudPenalty - chargebackPenalty + successBonus;
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get all fraud checks with filtering
 * GET /api/fraud/checks
 */
router.get('/checks', (req, res) => {
    try {
        const { risk_level, reviewed, limit = 100 } = req.query;

        let checks = db.getAllFraudChecks(parseInt(limit));

        // Filter by risk level
        if (risk_level) {
            checks = checks.filter(c => c.risk_level === risk_level.toUpperCase());
        }

        // Filter by reviewed status
        if (reviewed !== undefined) {
            const isReviewed = reviewed === 'true' || reviewed === '1';
            checks = checks.filter(c => c.reviewed === (isReviewed ? 1 : 0));
        }

        res.json({
            success: true,
            count: checks.length,
            checks: checks.map(c => ({
                ...c,
                signals: JSON.parse(c.signals || '{}')
            }))
        });
    } catch (error) {
        console.error('Fraud checks fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get single fraud check details
 * GET /api/fraud/checks/:id
 */
router.get('/checks/:id', (req, res) => {
    try {
        const check = db.getFraudCheck(req.params.id);

        if (!check) {
            return res.status(404).json({
                success: false,
                error: 'Fraud check not found'
            });
        }

        // Get associated transaction details
        const transaction = db.getTransaction(check.transaction_id) ||
            db.getVoiceCheckout(check.transaction_id);

        res.json({
            success: true,
            fraud_check: {
                ...check,
                signals: JSON.parse(check.signals || '{}')
            },
            transaction
        });
    } catch (error) {
        console.error('Fraud check details error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Review a fraud check (approve/block)
 * POST /api/fraud/checks/:id/review
 */
router.post('/checks/:id/review', (req, res) => {
    try {
        const { id } = req.params;
        const { action, reviewed_by } = req.body;

        if (!action || !['approve', 'block', 'whitelist', 'blacklist'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action. Must be: approve, block, whitelist, or blacklist'
            });
        }

        const check = db.getFraudCheck(id);
        if (!check) {
            return res.status(404).json({
                success: false,
                error: 'Fraud check not found'
            });
        }

        // Update fraud check as reviewed
        db.updateFraudCheckReview(id, reviewed_by || 'admin', action);

        // Take action based on review
        if (action === 'blacklist' && check.customer_phone) {
            db.addToBlacklist('phone', check.customer_phone, 'Manual review', reviewed_by);
        }

        if (action === 'whitelist' && check.customer_phone) {
            db.addToWhitelist('phone', check.customer_phone, reviewed_by);
        }

        res.json({
            success: true,
            message: `Fraud check ${action}ed successfully`,
            fraud_check_id: id,
            action
        });
    } catch (error) {
        console.error('Fraud review error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get blacklist entries
 * GET /api/fraud/blacklist
 */
router.get('/blacklist', (req, res) => {
    try {
        const blacklist = db.getAllBlacklisted();

        res.json({
            success: true,
            count: blacklist.length,
            blacklist
        });
    } catch (error) {
        console.error('Blacklist fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Add to blacklist
 * POST /api/fraud/blacklist
 */
router.post('/blacklist', (req, res) => {
    try {
        const { type, value, reason, added_by } = req.body;

        if (!type || !value) {
            return res.status(400).json({
                success: false,
                error: 'Type and value are required'
            });
        }

        if (!['phone', 'email'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Type must be phone or email'
            });
        }

        db.addToBlacklist(type, value, reason, added_by || 'admin');

        res.json({
            success: true,
            message: 'Added to blacklist',
            blacklist_entry: { type, value, reason }
        });
    } catch (error) {
        console.error('Blacklist add error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Remove from blacklist
 * DELETE /api/fraud/blacklist
 */
router.delete('/blacklist', (req, res) => {
    try {
        const { type, value } = req.body;

        if (!type || !value) {
            return res.status(400).json({
                success: false,
                error: 'Type and value are required'
            });
        }

        db.removeFromBlacklist(type, value);

        res.json({
            success: true,
            message: 'Removed from blacklist'
        });
    } catch (error) {
        console.error('Blacklist remove error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get fraud statistics
 * GET /api/fraud/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '24h';
        const stats = db.getFraudStats(timeframe);

        res.json({
            success: true,
            timeframe,
            stats
        });
    } catch (error) {
        console.error('Fraud stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get agent reputation scores
 * GET /api/fraud/agents
 */
router.get('/agents', (req, res) => {
    try {
        const platforms = ['chatgpt', 'retell', 'vapi', 'bland', 'voiceflow', 'voice', 'unknown'];

        const agentData = platforms.map(platform => {
            const stats = db.getAgentStats(platform);
            return {
                platform,
                ...stats,
                reputation_score: calculateReputationScore(stats)
            };
        }).filter(a => a.total_transactions > 0);

        res.json({
            success: true,
            count: agentData.length,
            agents: agentData
        });
    } catch (error) {
        console.error('Agent stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Simulate fraud check (for testing)
 * POST /api/fraud/simulate
 */
router.post('/simulate', async (req, res) => {
    try {
        const { customer, merchant_id, amount, agent_platform } = req.body;

        const mockRequest = {
            transaction_id: 'sim_' + Date.now(),
            merchant_id: merchant_id || 'test_merchant',
            customer: {
                name: customer?.name || 'Test User',
                phone: customer?.phone || '+15555555555',
                email: customer?.email || 'test@example.com'
            },
            items: [{
                product_id: 'test_product',
                quantity: 1
            }],
            totals: {
                total: amount || 100
            },
            payment: {
                method: 'link',
                currency: 'USD'
            },
            source: {
                protocol: 'voice',
                platform: agent_platform || 'unknown',
                input_type: 'voice'
            }
        };

        const fraudAnalysis = await FraudDetector.analyzeTransaction(mockRequest);

        res.json({
            success: true,
            simulation: true,
            fraud_analysis: fraudAnalysis
        });
    } catch (error) {
        console.error('Fraud simulation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
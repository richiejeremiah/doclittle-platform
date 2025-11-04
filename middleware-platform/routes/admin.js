/**
 * ADMIN ROUTES
 * Dashboard API to view merchants, transactions, and analytics
 * NOW INCLUDES VOICE COMMERCE SUPPORT
 */

const express = require('express');
const db = require('../database');

const router = express.Router();

/**
 * Get dashboard overview
 * GET /api/admin/dashboard
 * 
 * Returns stats from all platforms: ACP, AP2, and Voice
 */
router.get('/dashboard', (req, res) => {
    try {
        const merchants = db.getAllMerchants();
        const transactions = db.getAllTransactions();
        const ap2Transactions = db.getAllAP2Transactions();
        const voiceCheckouts = db.getAllVoiceCheckouts();

        // Calculate revenue by platform
        const acpRevenue = transactions
            .filter(t => t.platform === 'acp' && t.status === 'completed')
            .reduce((sum, t) => sum + (t.amount || 0), 0);

        const ap2Revenue = ap2Transactions
            .filter(t => t.status === 'completed')
            .reduce((sum, t) => sum + (t.amount || 0), 0);

        const voiceRevenue = voiceCheckouts
            .filter(v => v.status === 'completed')
            .reduce((sum, v) => sum + (v.amount || 0), 0);

        // Combine all transactions for recent display
        const allTransactions = [];

        // Add ACP transactions
        transactions.forEach(t => {
            allTransactions.push({
                id: t.id,
                merchant_id: t.merchant_id,
                platform: t.platform,
                customer_email: t.customer_email,
                amount: t.amount,
                status: t.status,
                created_at: t.created_at,
                source: 'acp'
            });
        });

        // Add Voice transactions
        voiceCheckouts
            .filter(v => v.status === 'completed' || v.status === 'pending')
            .forEach(v => {
                allTransactions.push({
                    id: v.id,
                    merchant_id: v.merchant_id,
                    platform: 'voice',
                    customer_email: v.customer_email || v.customer_phone,
                    amount: v.amount,
                    status: v.status,
                    created_at: v.created_at,
                    source: 'voice'
                });
            });

        // Sort by date (most recent first) and take top 20
        allTransactions.sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });
        const recentTransactions = allTransactions.slice(0, 20);

        // Calculate comprehensive stats
        const stats = {
            total_merchants: merchants.length,
            active_merchants: merchants.filter(m => m.status === 'active').length,
            total_transactions:
                transactions.length +
                ap2Transactions.length +
                voiceCheckouts.filter(v => v.status === 'completed').length,
            completed_transactions:
                transactions.filter(t => t.status === 'completed').length +
                ap2Transactions.filter(t => t.status === 'completed').length +
                voiceCheckouts.filter(v => v.status === 'completed').length,
            pending_transactions:
                transactions.filter(t => t.status === 'pending').length +
                ap2Transactions.filter(t => t.status === 'pending').length +
                voiceCheckouts.filter(v => v.status === 'pending').length,
            total_revenue: (acpRevenue + ap2Revenue + voiceRevenue).toFixed(2),
            platforms: {
                acp: {
                    transactions: transactions.filter(t => t.platform === 'acp').length,
                    completed: transactions.filter(t => t.platform === 'acp' && t.status === 'completed').length,
                    revenue: acpRevenue.toFixed(2)
                },
                ap2: {
                    transactions: ap2Transactions.length,
                    completed: ap2Transactions.filter(t => t.status === 'completed').length,
                    revenue: ap2Revenue.toFixed(2)
                },
                voice: {
                    transactions: voiceCheckouts.length,
                    completed: voiceCheckouts.filter(v => v.status === 'completed').length,
                    pending: voiceCheckouts.filter(v => v.status === 'pending').length,
                    revenue: voiceRevenue.toFixed(2)
                }
            }
        };

        // Enrich recent transactions with merchant names
        const enrichedTransactions = recentTransactions.map(t => {
            const merchant = db.getMerchant(t.merchant_id);
            return {
                ...t,
                merchant_name: merchant ? merchant.name : 'Unknown'
            };
        });

        res.json({
            success: true,
            stats,
            recent_transactions: enrichedTransactions,
            merchants: merchants.map(m => ({
                id: m.id,
                name: m.name,
                status: m.status,
                enabled_platforms: JSON.parse(m.enabled_platforms),
                api_url: m.api_url,
                created_at: m.created_at
            }))
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all transactions (all platforms)
 * GET /api/admin/transactions
 */
router.get('/transactions', (req, res) => {
    try {
        const transactions = db.getAllTransactions();
        const voiceCheckouts = db.getAllVoiceCheckouts();

        // Combine all transactions
        const allTransactions = [];

        // Add regular transactions
        transactions.forEach(t => {
            const merchant = db.getMerchant(t.merchant_id);
            allTransactions.push({
                ...t,
                merchant_name: merchant ? merchant.name : 'Unknown',
                source: 'transaction'
            });
        });

        // Add voice checkouts
        voiceCheckouts.forEach(v => {
            const merchant = db.getMerchant(v.merchant_id);
            allTransactions.push({
                id: v.id,
                merchant_id: v.merchant_id,
                merchant_name: merchant ? merchant.name : 'Unknown',
                platform: 'voice',
                customer_email: v.customer_email || v.customer_phone,
                amount: v.amount,
                status: v.status,
                created_at: v.created_at,
                product_id: v.product_id,
                product_name: v.product_name,
                quantity: v.quantity,
                source: 'voice'
            });
        });

        // Sort by date
        allTransactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
            success: true,
            count: allTransactions.length,
            transactions: allTransactions
        });
    } catch (error) {
        console.error('Transactions fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get transaction details
 * GET /api/admin/transactions/:id
 */
router.get('/transactions/:id', (req, res) => {
    try {
        // Try to find in regular transactions first
        let transaction = db.getTransaction(req.params.id);
        let isVoice = false;

        // If not found, try voice checkouts
        if (!transaction) {
            transaction = db.getVoiceCheckout(req.params.id);
            isVoice = true;
        }

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found'
            });
        }

        const merchant = db.getMerchant(transaction.merchant_id);

        // Format response based on transaction type
        const responseData = {
            ...transaction,
            merchant_name: merchant ? merchant.name : 'Unknown',
            merchant_api_url: merchant ? merchant.api_url : null,
            platform: isVoice ? 'voice' : transaction.platform,
            transaction_type: isVoice ? 'voice_checkout' : 'standard'
        };

        // Add voice-specific fields if applicable
        if (isVoice) {
            responseData.customer_phone = transaction.customer_phone;
            responseData.product_name = transaction.product_name;
            responseData.quantity = transaction.quantity;
            responseData.payment_token = transaction.payment_token;
        }

        res.json({
            success: true,
            transaction: responseData
        });
    } catch (error) {
        console.error('Transaction details error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all merchants with enriched data
 * GET /api/admin/merchants
 */
router.get('/merchants', (req, res) => {
    try {
        const merchants = db.getAllMerchants();

        const enrichedMerchants = merchants.map(m => {
            const transactions = db.getAllTransactions()
                .filter(t => t.merchant_id === m.id);

            const voiceCheckouts = db.getVoiceCheckoutsByMerchant(m.id);

            const syncedProducts = db.getSyncedProducts(m.id, 'acp');

            // Calculate total revenue across all platforms
            const acpRevenue = transactions
                .filter(t => t.status === 'completed')
                .reduce((sum, t) => sum + (t.amount || 0), 0);

            const voiceRevenue = voiceCheckouts
                .filter(v => v.status === 'completed')
                .reduce((sum, v) => sum + (v.amount || 0), 0);

            return {
                ...m,
                enabled_platforms: JSON.parse(m.enabled_platforms),
                transaction_count: transactions.length + voiceCheckouts.filter(v => v.status === 'completed').length,
                voice_checkouts: voiceCheckouts.length,
                product_count: syncedProducts.length,
                total_revenue: (acpRevenue + voiceRevenue).toFixed(2),
                platform_breakdown: {
                    acp: {
                        transactions: transactions.filter(t => t.platform === 'acp').length,
                        revenue: transactions
                            .filter(t => t.platform === 'acp' && t.status === 'completed')
                            .reduce((sum, t) => sum + (t.amount || 0), 0)
                            .toFixed(2)
                    },
                    voice: {
                        transactions: voiceCheckouts.length,
                        completed: voiceCheckouts.filter(v => v.status === 'completed').length,
                        revenue: voiceRevenue.toFixed(2)
                    }
                }
            };
        });

        res.json({
            success: true,
            count: enrichedMerchants.length,
            merchants: enrichedMerchants
        });
    } catch (error) {
        console.error('Merchants fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get merchant details with all transactions
 * GET /api/admin/merchants/:id
 */
router.get('/merchants/:id', (req, res) => {
    try {
        const merchant = db.getMerchant(req.params.id);

        if (!merchant) {
            return res.status(404).json({
                success: false,
                error: 'Merchant not found'
            });
        }

        const transactions = db.getAllTransactions()
            .filter(t => t.merchant_id === merchant.id);

        const voiceCheckouts = db.getVoiceCheckoutsByMerchant(merchant.id);

        const syncedProducts = db.getSyncedProducts(merchant.id, 'acp');

        // Calculate revenue
        const acpRevenue = transactions
            .filter(t => t.status === 'completed')
            .reduce((sum, t) => sum + (t.amount || 0), 0);

        const voiceRevenue = voiceCheckouts
            .filter(v => v.status === 'completed')
            .reduce((sum, v) => sum + (v.amount || 0), 0);

        // Combine recent transactions
        const allRecentTransactions = [
            ...transactions.slice(0, 5),
            ...voiceCheckouts.filter(v => v.status === 'completed').slice(0, 5)
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);

        res.json({
            success: true,
            merchant: {
                ...merchant,
                enabled_platforms: JSON.parse(merchant.enabled_platforms),
                transaction_count: transactions.length + voiceCheckouts.filter(v => v.status === 'completed').length,
                voice_checkouts_count: voiceCheckouts.length,
                product_count: syncedProducts.length,
                total_revenue: (acpRevenue + voiceRevenue).toFixed(2)
            },
            recent_transactions: allRecentTransactions,
            voice_checkouts: voiceCheckouts.slice(0, 10),
            products: syncedProducts.map(sp => JSON.parse(sp.product_data)).slice(0, 20)
        });
    } catch (error) {
        console.error('Merchant details error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get voice-specific analytics
 * GET /api/admin/voice/analytics
 */
router.get('/voice/analytics', (req, res) => {
    try {
        const voiceCheckouts = db.getAllVoiceCheckouts();

        const analytics = {
            total_checkouts: voiceCheckouts.length,
            completed: voiceCheckouts.filter(v => v.status === 'completed').length,
            pending: voiceCheckouts.filter(v => v.status === 'pending').length,
            failed: voiceCheckouts.filter(v => v.status === 'failed').length,
            total_revenue: voiceCheckouts
                .filter(v => v.status === 'completed')
                .reduce((sum, v) => sum + (v.amount || 0), 0)
                .toFixed(2),
            average_order_value: voiceCheckouts.length > 0
                ? (voiceCheckouts
                    .filter(v => v.status === 'completed')
                    .reduce((sum, v) => sum + (v.amount || 0), 0) /
                    voiceCheckouts.filter(v => v.status === 'completed').length)
                    .toFixed(2)
                : '0.00',
            conversion_rate: voiceCheckouts.length > 0
                ? ((voiceCheckouts.filter(v => v.status === 'completed').length / voiceCheckouts.length) * 100).toFixed(2) + '%'
                : '0%'
        };

        res.json({
            success: true,
            analytics,
            recent_checkouts: voiceCheckouts.slice(0, 20)
        });
    } catch (error) {
        console.error('Voice analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
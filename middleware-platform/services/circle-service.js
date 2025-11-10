/**
 * Circle Payment Service
 * Handles all Circle API interactions for healthcare billing payments
 * Uses Circle's official Node.js SDK for Developer-Controlled Wallets
 * 
 * Documentation: https://developers.circle.com/sdk-explorer/developer-controlled-wallets/Node.js/getting-started
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../database');

let CircleSDK;
try {
    CircleSDK = require('@circle-fin/developer-controlled-wallets');
} catch (error) {
    console.error('❌ Circle SDK not installed. Run: npm install @circle-fin/developer-controlled-wallets');
    CircleSDK = null;
}

class CircleService {
    constructor() {
        // Circle API configuration
        // Circle API keys should be in format: ENVIRONMENT:ID:SECRET (e.g., TEST_API_KEY:id:secret)
        // Get your API key from: https://console.circle.com/
        this.apiKey = process.env.CIRCLE_API_KEY || null;
        this.entitySecret = process.env.CIRCLE_ENTITY_SECRET || process.env.ENTITY_SECRET || null;
        this.baseURL = process.env.CIRCLE_BASE_URL || 'https://api-sandbox.circle.com';
        this.environment = process.env.CIRCLE_ENVIRONMENT || 'sandbox';
        
        // Initialize Circle SDK client if available
        this.client = null;
        
        // Check if Circle is configured
        if (!this.apiKey) {
            console.warn('⚠️  CIRCLE_API_KEY not set. Circle wallet features will be disabled.');
            console.warn('   To enable Circle wallets, set CIRCLE_API_KEY in environment variables.');
            console.warn('   Get your key from: https://console.circle.com/');
            return; // Exit early - service will be unavailable
        }
        
        // Check if API key is in correct format (3 parts: ENV:ID:SECRET)
        const keyParts = this.apiKey.split(':');
        if (keyParts.length === 2) {
            // Old format or missing environment prefix - add TEST_API_KEY prefix for sandbox
            console.warn('⚠️  API key appears to be in old format (2 parts). Adding TEST_API_KEY prefix.');
            this.apiKey = `TEST_API_KEY:${this.apiKey}`;
        } else if (keyParts.length !== 3) {
            console.error('❌ Invalid API key format. Expected format: ENVIRONMENT:ID:SECRET or ID:SECRET');
            console.warn('⚠️  Circle service will be unavailable due to invalid API key format.');
            return; // Exit early - service will be unavailable
        }
        
        console.log(`🔑 Using Circle API Key format: ${this.apiKey.split(':').length} parts`);
        console.log(`🌐 Circle API Base URL: ${this.baseURL}`);
        
        // Initialize Circle SDK client if available
        if (CircleSDK) {
            try {
                // Initialize the Circle SDK client
                // Note: Entity secret is required for developer-controlled wallets
                // Get this from Circle Console: https://console.circle.com
                if (this.entitySecret) {
                    this.client = CircleSDK.initiateDeveloperControlledWalletsClient({
                        apiKey: this.apiKey,
                        entitySecret: this.entitySecret,
                    });
                    console.log('✅ Circle SDK client initialized');
                } else {
                    console.warn('⚠️  CIRCLE_ENTITY_SECRET not set. Wallet operations will be limited.');
                    console.warn('   Get your entity secret from Circle Console: https://console.circle.com');
                    console.warn('   Set it in .env file: CIRCLE_ENTITY_SECRET=your_entity_secret');
                }
            } catch (error) {
                console.error('❌ Error initializing Circle SDK:', error.message);
                console.warn('⚠️  Circle service will be unavailable.');
            }
        } else {
            console.warn('⚠️  Circle SDK not available. Install with: npm install @circle-fin/developer-controlled-wallets');
            console.warn('⚠️  Circle service will be unavailable.');
        }
    }

    /**
     * Check if SDK is available and configured
     */
    isAvailable() {
        return this.apiKey !== null && this.client !== null && this.entitySecret !== null;
    }

    /**
     * Create a wallet set (required for developer-controlled wallets)
     * Wallet sets group wallets together for easier management
     * @param {Object} params - Wallet set creation parameters
     * @param {string} params.name - Wallet set name
     * @param {string} params.description - Wallet set description
     * @returns {Promise<Object>} Created wallet set information
     */
    async createWalletSet(params) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured'
            };
        }

        try {
            const { name, description } = params;
            
            // Generate idempotency key (must be UUID format)
            const idempotencyKey = uuidv4();
            
            // Create wallet set using Circle SDK
            const response = await this.client.createWalletSet({
                idempotencyKey: idempotencyKey,
                name: name || 'Default Wallet Set'
            });

            // Extract wallet set ID from response
            // Response structure: { data: { walletSet: { id: '...' } } }
            const walletSet = response.data?.walletSet || response.walletSet || response.data || response;
            const walletSetId = walletSet.id || walletSet.walletSetId;

            if (!walletSetId) {
                console.error('❌ Could not extract wallet set ID from response');
                console.error('   Response:', JSON.stringify(response, null, 2));
                throw new Error('Invalid wallet set response - no ID found');
            }

            console.log(`✅ Wallet set created: ${walletSetId}`);

            return {
                success: true,
                walletSetId: walletSetId,
                walletSetData: walletSet
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - Create Wallet Set:', error.message);
            if (error.response) {
                console.error('   Response:', JSON.stringify(error.response.data || error.response, null, 2));
            }
            return {
                success: false,
                error: error.message || 'Failed to create wallet set',
                details: error.response?.data || error
            };
        }
    }

    /**
     * Create a wallet for an entity (Provider, Insurer, or Patient)
     * @param {Object} params - Wallet creation parameters
     * @param {string} params.walletSetId - Wallet set ID (required)
     * @param {string} params.entityType - 'provider', 'insurer', or 'patient'
     * @param {string} params.entityId - Internal entity ID
     * @param {string} params.description - Wallet description
     * @returns {Promise<Object>} Created wallet information
     */
    async createWallet(params) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured. Set CIRCLE_ENTITY_SECRET in .env file.'
            };
        }

        try {
            const { walletSetId, entityType, entityId, description } = params;

            if (!walletSetId) {
                return {
                    success: false,
                    error: 'walletSetId is required. Create a wallet set first using createWalletSet().'
                };
            }

            // Generate idempotency key (must be UUID format)
            const idempotencyKey = uuidv4();

            // Create wallet using Circle SDK (note: method is createWallets - plural)
            // For healthcare billing, we'll use Polygon Amoy testnet (MATIC-AMOY)
            // In production, use MATIC-POS for Polygon mainnet
            const result = await this.client.createWallets({
                idempotencyKey: idempotencyKey,
                walletSetId: walletSetId,
                accountType: 'SCA', // Smart Contract Account
                blockchains: ['MATIC-AMOY'], // Polygon Amoy testnet (use MATIC-POS for mainnet)
                count: 1, // Create single wallet
                walletMetadata: {
                    description: description || `${entityType} wallet for ${entityId}`
                }
            });

            // Extract wallet from response (createWallets returns array)
            const wallets = result.data?.wallets || result.wallets || [];
            if (wallets.length === 0) {
                throw new Error('No wallet created in response');
            }

            const wallet = wallets[0];
            const walletId = wallet.walletId || wallet.id;

            console.log(`✅ Wallet created: ${walletId}`);

            return {
                success: true,
                walletId: walletId,
                walletData: wallet
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - Create Wallet:', error.message);
            console.error('   Details:', JSON.stringify(error.response?.data || error, null, 2));
            return {
                success: false,
                error: error.message || 'Failed to create wallet',
                details: error.response?.data || error
            };
        }
    }

    /**
     * Get wallet balance
     * @param {string} walletId - Circle wallet ID
     * @returns {Promise<Object>} Wallet balance information
     */
    async getWalletBalance(walletId) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured',
                balances: []
            };
        }

        try {
            // First, get the wallet to determine blockchain
            const wallet = await this.client.getWallet({ id: walletId });
            const walletData = wallet.data?.wallet || wallet.wallet || wallet.data || wallet;
            const blockchain = walletData.blockchain || 'MATIC-AMOY'; // Default to Polygon Amoy testnet

            // Get wallets with balances (includes token balances)
            // Need to specify blockchain for balance queries
            try {
                const walletsWithBalances = await this.client.getWalletsWithBalances({
                    id: walletId,
                    blockchain: blockchain
                });

                // Extract balance information
                const walletWithBalance = walletsWithBalances.data?.wallets?.[0] || walletsWithBalances.wallets?.[0];
                
                if (walletWithBalance && walletWithBalance.balances) {
                    return {
                        success: true,
                        balances: walletWithBalance.balances,
                        walletId: walletId,
                        walletData: walletWithBalance
                    };
                }
            } catch (balanceError) {
                console.warn('Could not get wallets with balances:', balanceError.message);
            }

            // Fallback: Get token balance directly
            try {
                const tokenBalance = await this.client.getWalletTokenBalance({
                    id: walletId,
                    blockchain: blockchain
                });

                return {
                    success: true,
                    balances: tokenBalance.data?.tokenBalances || tokenBalance.tokenBalances || [],
                    walletId: walletId
                };
            } catch (tokenError) {
                console.warn('Could not get token balance:', tokenError.message);
                // If token balance fails, return empty balances (wallet might be new)
                return {
                    success: true,
                    balances: [],
                    walletId: walletId,
                    message: 'Wallet created but balance not yet available (new wallets start with $0.00)'
                };
            }
        } catch (error) {
            console.error('❌ Circle SDK Error - Get Balance:', error.message);
            // Don't fail completely - wallet might be new and balances not yet available
            return {
                success: true,
                balances: [],
                walletId: walletId,
                message: 'Balance check failed, but wallet exists. New wallets start with $0.00 USDC.'
            };
        }
    }

    /**
     * Create a transfer (payment) from one wallet to another
     * @param {Object} params - Transfer parameters
     * @param {string} params.fromWalletId - Source wallet ID (Insurer)
     * @param {string} params.toWalletId - Destination wallet ID (Provider)
     * @param {number} params.amount - Transfer amount
     * @param {string} params.currency - Currency (default: USDC)
     * @param {string} params.claimId - Associated claim ID
     * @param {string} params.description - Transfer description
     * @returns {Promise<Object>} Transfer information
     */
    async createTransfer(params) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured'
            };
        }

        try {
            const {
                fromWalletId,
                toWalletId,
                amount,
                currency = 'USDC',
                claimId,
                description
            } = params;

            // Generate idempotency key (must be UUID format)
            const idempotencyKey = uuidv4();

            // First, get the destination wallet to get its address
            const toWallet = await this.client.getWallet({ id: toWalletId });
            const toWalletAddress = toWallet.data?.address || toWallet.address;
            
            if (!toWalletAddress) {
                throw new Error('Could not get destination wallet address');
            }

            // Get USDC token ID for Polygon Amoy testnet
            // USDC on Polygon Amoy: 0x07865c6e87b9f70255377e024ace6630c1eaa37f
            // In production, use the mainnet USDC token ID
            const usdcTokenId = '0x07865c6e87b9f70255377e024ace6630c1eaa37f'; // Polygon Amoy testnet USDC

            // Create transaction (transfer) using Circle SDK
            // Note: Circle SDK uses createTransaction for transfers
            const transaction = await this.client.createTransaction({
                idempotencyKey: idempotencyKey,
                walletId: fromWalletId,
                destinationAddress: toWalletAddress, // Wallet address, not ID
                amounts: [amount.toString()], // Array of amounts
                tokenId: usdcTokenId, // USDC token ID
                fee: {
                    type: 'level',
                    config: {
                        feeLevel: 'MEDIUM' // LOW, MEDIUM, HIGH
                    }
                },
                metadata: {
                    description: description || `Payment for claim ${claimId}`
                }
            });

            console.log(`✅ Transfer transaction created: ${transaction.data?.id || transaction.id}`);

            return {
                success: true,
                transferId: transaction.data?.id || transaction.id,
                transactionId: transaction.data?.id || transaction.id,
                transferData: transaction.data || transaction,
                status: transaction.data?.status || transaction.status
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - Create Transfer:', error.message);
            console.error('   Details:', JSON.stringify(error.response?.data || error, null, 2));
            return {
                success: false,
                error: error.message || 'Failed to create transfer',
                details: error.response?.data || error
            };
        }
    }

    /**
     * Get transfer status
     * @param {string} transferId - Circle transaction ID
     * @returns {Promise<Object>} Transfer status information
     */
    async getTransferStatus(transferId) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured'
            };
        }

        try {
            // Get transaction (transfer) status using Circle SDK
            const transaction = await this.client.getTransaction({
                id: transferId
            });

            return {
                success: true,
                transferId: transferId,
                transactionId: transferId,
                status: transaction.data?.status || transaction.status,
                transferData: transaction.data || transaction
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - Get Transfer Status:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to get transfer status'
            };
        }
    }

    /**
     * Get wallet details
     * @param {string} walletId - Circle wallet ID
     * @returns {Promise<Object>} Wallet information
     */
    async getWallet(walletId) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured'
            };
        }

        try {
            const wallet = await this.client.getWallet({
                id: walletId
            });

            return {
                success: true,
                walletId: walletId,
                walletData: wallet.data || wallet
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - Get Wallet:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to get wallet'
            };
        }
    }

    /**
     * List all wallets in a wallet set
     * @param {string} walletSetId - Wallet set ID
     * @returns {Promise<Object>} List of wallets
     */
    async listWallets(walletSetId) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured',
                wallets: []
            };
        }

        try {
            const result = await this.client.listWallets({
                walletSetId: walletSetId
            });

            return {
                success: true,
                wallets: result.data?.wallets || result.wallets || [],
                walletSetId: walletSetId
            };
        } catch (error) {
            console.error('❌ Circle SDK Error - List Wallets:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to list wallets',
                wallets: []
            };
        }
    }

    /**
     * Fund wallet with test USDC (Sandbox only)
     * For sandbox/testnet, we'll transfer from a system wallet
     * @param {string} walletId - Target wallet ID to fund
     * @param {number} amount - Amount in USDC to transfer
     * @returns {Promise<Object>} Transfer result
     */
    async fundWallet(walletId, amount) {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'Circle SDK not available or entity secret not configured'
            };
        }

        try {
            // For sandbox, we need a system/funding wallet that has test USDC
            // First, check if we have a system wallet, or create one
            const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
            if (!walletSetId) {
                return {
                    success: false,
                    error: 'CIRCLE_WALLET_SET_ID not configured. Cannot fund wallet.'
                };
            }

            // Get or create system funding wallet
            // In sandbox, we'll use a system wallet that we manually fund via Circle Console
            // or use Circle's testnet faucet
            const systemWalletId = process.env.CIRCLE_SYSTEM_WALLET_ID;
            
            if (!systemWalletId) {
                // Try to find existing system wallet in wallet set
                const walletsResult = await this.listWallets(walletSetId);
                const systemWallet = walletsResult.wallets?.find(w => 
                    w.metadata?.description?.includes('system') || 
                    w.metadata?.description?.includes('funding')
                );
                
                if (systemWallet) {
                    // Use existing system wallet
                    const foundSystemWalletId = systemWallet.walletId || systemWallet.id;
                    console.log(`✅ Found system wallet: ${foundSystemWalletId}`);
                    
                    // Transfer from system wallet to target wallet
                    return await this.createTransfer({
                        fromWalletId: foundSystemWalletId,
                        toWalletId: walletId,
                        amount: amount,
                        currency: 'USDC',
                        description: `Test deposit of ${amount} USDC`
                    });
                } else {
                    return {
                        success: false,
                        error: 'System funding wallet not found. Please create a system wallet and fund it with test USDC via Circle Console, or set CIRCLE_SYSTEM_WALLET_ID in .env'
                    };
                }
            }

            // Transfer from system wallet to target wallet
            return await this.createTransfer({
                fromWalletId: systemWalletId,
                toWalletId: walletId,
                amount: amount,
                currency: 'USDC',
                description: `Test deposit of ${amount} USDC`
            });

        } catch (error) {
            console.error('❌ Circle SDK Error - Fund Wallet:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to fund wallet',
                details: error.response?.data || error
            };
        }
    }

    /**
     * Verify webhook signature
     * Circle uses HMAC SHA256 with the webhook secret
     * @param {string} signature - Webhook signature from headers (X-Circle-Signature)
     * @param {string|Buffer} payload - Raw webhook payload body
     * @returns {boolean} Whether signature is valid
     */
    verifyWebhookSignature(signature, payload) {
        const webhookSecret = process.env.CIRCLE_WEBHOOK_SECRET;
        
        if (!webhookSecret) {
            if (process.env.NODE_ENV === 'production') {
                console.error('❌ CIRCLE_WEBHOOK_SECRET not configured in production!');
                return false;
            }
            console.warn('⚠️  Webhook secret not configured - allowing in development');
            return true;
        }

        if (!signature) {
            console.error('❌ Webhook signature missing');
            return false;
        }

        try {
            const crypto = require('crypto');
            
            // Circle sends signature as: "v1=signature" format
            // Extract the signature value
            const signatureMatch = signature.match(/v1=([a-f0-9]+)/);
            if (!signatureMatch) {
                console.error('❌ Invalid signature format');
                return false;
            }
            
            const receivedSignature = signatureMatch[1];
            
            // Calculate expected signature
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(payload)
                .digest('hex');
            
            // Use timing-safe comparison to prevent timing attacks
            const isValid = crypto.timingSafeEqual(
                Buffer.from(receivedSignature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
            
            if (!isValid) {
                console.error('❌ Webhook signature verification failed');
            }
            
            return isValid;
        } catch (error) {
            console.error('❌ Error verifying webhook signature:', error.message);
            return false;
        }
    }

    /**
     * Get or create a patient wallet linked to FHIR Patient resource_id
     * @param {string} fhirPatientResourceId - FHIR Patient resource_id (e.g., 'patient-xxx')
     * @param {Object} options - Optional parameters
     * @param {boolean} options.createIfNotExists - Create wallet if it doesn't exist (default: true)
     * @returns {Promise<Object>} Wallet account information
     */
    async getOrCreatePatientWallet(fhirPatientResourceId, options = {}) {
        const { createIfNotExists = true } = options;

        try {
            // Check if wallet already exists for this FHIR Patient resource_id
            const existingAccount = db.getCircleAccountByEntity('patient', fhirPatientResourceId);
            if (existingAccount) {
                return {
                    success: true,
                    account: existingAccount,
                    walletId: existingAccount.circle_wallet_id,
                    message: 'Wallet already exists'
                };
            }

            // If wallet doesn't exist and we shouldn't create it, return error
            if (!createIfNotExists) {
                return {
                    success: false,
                    error: 'Patient wallet does not exist'
                };
            }

            // Verify FHIR Patient exists
            const fhirPatient = db.getFHIRPatient(fhirPatientResourceId);
            if (!fhirPatient) {
                return {
                    success: false,
                    error: `FHIR Patient with resource_id ${fhirPatientResourceId} not found`
                };
            }

            // Get or create wallet set
            let walletSetId = process.env.CIRCLE_WALLET_SET_ID;
            if (!walletSetId) {
                const walletSetResult = await this.createWalletSet({
                    name: 'Healthcare Billing Wallets',
                    description: 'Wallet set for Provider, Insurer, and Patient accounts'
                });

                if (!walletSetResult.success) {
                    return {
                        success: false,
                        error: `Failed to create wallet set: ${walletSetResult.error}`
                    };
                }

                walletSetId = walletSetResult.walletSetId;
                process.env.CIRCLE_WALLET_SET_ID = walletSetId;
            }

            // Create wallet using FHIR Patient resource_id as entity_id
            const walletResult = await this.createWallet({
                walletSetId: walletSetId,
                entityType: 'patient',
                entityId: fhirPatientResourceId, // Use FHIR Patient resource_id
                description: `Patient wallet for FHIR Patient ${fhirPatientResourceId}`
            });

            if (!walletResult.success) {
                return {
                    success: false,
                    error: walletResult.error || 'Failed to create wallet'
                };
            }

            // Store wallet in database
            const accountId = `circle-account-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            db.createCircleAccount({
                id: accountId,
                entity_type: 'patient',
                entity_id: fhirPatientResourceId, // Link to FHIR Patient resource_id
                circle_wallet_id: walletResult.walletId,
                currency: 'USDC',
                status: 'active'
            });

            const account = db.getCircleAccountByEntity('patient', fhirPatientResourceId);

            return {
                success: true,
                account: account,
                walletId: walletResult.walletId,
                walletData: walletResult.walletData,
                message: 'Wallet created successfully'
            };
        } catch (error) {
            console.error('❌ Error in getOrCreatePatientWallet:', error);
            return {
                success: false,
                error: error.message || 'Failed to get or create patient wallet'
            };
        }
    }

    /**
     * Get patient wallet by phone number or email (looks up FHIR Patient first)
     * @param {string} phone - Patient phone number (optional)
     * @param {string} email - Patient email (optional)
     * @returns {Promise<Object>} Wallet account information
     */
    async getPatientWalletByContact(phone, email) {
        try {
            // Look up FHIR Patient by phone or email
            let fhirPatient = null;
            if (phone) {
                fhirPatient = db.getFHIRPatientByPhone(phone);
            }
            if (!fhirPatient && email) {
                fhirPatient = db.getFHIRPatientByEmail(email);
            }

            if (!fhirPatient) {
                return {
                    success: false,
                    error: 'FHIR Patient not found for provided phone/email'
                };
            }

            // Get or create wallet using FHIR Patient resource_id
            return await this.getOrCreatePatientWallet(fhirPatient.resource_id);
        } catch (error) {
            console.error('❌ Error in getPatientWalletByContact:', error);
            return {
                success: false,
                error: error.message || 'Failed to get patient wallet by contact'
            };
        }
    }
}

module.exports = new CircleService();

/**
 * INSURANCE SERVICE
 * Integrates with Stedi API for healthcare insurance operations
 * Handles X12 EDI transactions for eligibility checks and claim submission
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

class InsuranceService {
  // Stedi API Configuration
  static STEDI_API_BASE = process.env.STEDI_API_BASE || 'https://api.stedi.com';
  static STEDI_API_KEY = process.env.STEDI_API_KEY || 'test_1rRzTb0.Va9Tn88BB3fgPgttprqbrxQ1';

  /**
   * Get Stedi API client with authentication
   */
  static getStediClient() {
    return axios.create({
      baseURL: this.STEDI_API_BASE,
      headers: {
        'Authorization': `Bearer ${this.STEDI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
  }

  /**
   * Check patient insurance eligibility
   * X12 270/271 transaction
   * 
   * @param {Object} eligibilityData - Patient and insurance info
   * @param {string} eligibilityData.patientName - Patient full name
   * @param {string} eligibilityData.dateOfBirth - DOB (YYYY-MM-DD)
   * @param {string} eligibilityData.memberId - Insurance member ID
   * @param {string} eligibilityData.payerId - Insurance payer ID (e.g., "BCBS")
   * @param {string} eligibilityData.serviceCode - CPT code (e.g., "90834")
   * @param {string} eligibilityData.dateOfService - Service date (YYYY-MM-DD)
   * @returns {Object} Eligibility response
   */
  static async checkEligibility(eligibilityData) {
    try {
      console.log('\n🏥 INSURANCE: Checking Eligibility');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Patient:', eligibilityData.patientName);
      console.log('Member ID:', eligibilityData.memberId);
      console.log('Payer ID:', eligibilityData.payerId);
      console.log('Service Code:', eligibilityData.serviceCode);
      console.log('Date of Service:', eligibilityData.dateOfService);

      // Build X12 270 eligibility inquiry
      const x12Request = this._buildEligibilityRequest(eligibilityData);

      // Call Stedi API to translate to EDI format
      const stediClient = this.getStediClient();
      
      try {
        // Option 1: Use Stedi's X12 translation API
        // POST /x12/translate/270-to-edi
        const translateResponse = await stediClient.post('/x12/translate/270-to-edi', {
          json: x12Request
        });

        console.log('✅ Stedi API response received');
        console.log('   EDI Request generated:', translateResponse.data?.edi ? 'Yes' : 'No');
      } catch (apiError) {
        // If Stedi API fails, log and continue with simulation
        console.warn('⚠️  Stedi API call failed, using simulation:', apiError.message);
        try {
          const Metrics = require('./metrics');
          Metrics.increment('stedi_eligibility_error_rate');
        } catch (_) {}
        if (apiError.response) {
          console.warn('   Status:', apiError.response.status);
          console.warn('   Response:', apiError.response.data);
        }
      }

      // Simulate or parse eligibility check (replace with real API call when ready)
      const eligibilityResponse = await this._simulateEligibilityCheck(eligibilityData);

      // Attempt to parse 271-style benefit details if present on response
      const planSummary = eligibilityResponse.planSummary || null;
      const deductibleTotal = eligibilityResponse.deductibleTotal ?? null;
      const deductibleRemaining = eligibilityResponse.deductibleRemaining ?? null;
      const coinsurancePercent = eligibilityResponse.coinsurancePercent ?? null;

      // Store eligibility check in database
      const eligibilityRecord = {
        id: `elig_${uuidv4()}`,
        patient_id: eligibilityData.patientId || null,
        member_id: eligibilityData.memberId,
        payer_id: eligibilityData.payerId,
        service_code: eligibilityData.serviceCode,
        date_of_service: eligibilityData.dateOfService,
        eligible: eligibilityResponse.eligible,
        copay_amount: eligibilityResponse.copay || 0,
        allowed_amount: eligibilityResponse.allowedAmount || 0,
        insurance_pays: eligibilityResponse.insurancePays || 0,
        deductible_total: deductibleTotal,
        deductible_remaining: deductibleRemaining,
        coinsurance_percent: coinsurancePercent,
        plan_summary: planSummary,
        response_data: JSON.stringify(eligibilityResponse),
        created_at: new Date().toISOString()
      };

      db.createEligibilityCheck(eligibilityRecord);

      console.log('✅ Eligibility check completed');
      console.log('   Eligible:', eligibilityResponse.eligible);
      if (eligibilityResponse.eligible) {
        console.log('   Copay: $' + eligibilityResponse.copay);
        console.log('   Insurance Pays: $' + eligibilityResponse.insurancePays);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        eligible: eligibilityResponse.eligible,
        copay: eligibilityResponse.copay || 0,
        allowedAmount: eligibilityResponse.allowedAmount || 0,
        insurancePays: eligibilityResponse.insurancePays || 0,
        deductibleTotal: deductibleTotal,
        deductibleRemaining: deductibleRemaining,
        coinsurancePercent: coinsurancePercent,
        planSummary: planSummary,
        patientResponsibility: eligibilityResponse.copay || 0,
        eligibilityId: eligibilityRecord.id,
        message: eligibilityResponse.eligible 
          ? `Eligible - Copay: $${eligibilityResponse.copay}, Insurance pays: $${eligibilityResponse.insurancePays}`
          : 'Not eligible for this service'
      };

    } catch (error) {
      console.error('❌ Error checking eligibility:', error.message);
      return {
        success: false,
        eligible: false,
        error: error.message
      };
    }
  }

  /**
   * Submit insurance claim
   * X12 837 transaction
   * 
   * @param {Object} claimData - Claim information
   * @param {string} claimData.appointmentId - Appointment ID
   * @param {string} claimData.patientId - FHIR patient ID
   * @param {string} claimData.memberId - Insurance member ID
   * @param {string} claimData.payerId - Insurance payer ID
   * @param {string} claimData.serviceCode - CPT code
   * @param {string} claimData.diagnosisCode - ICD-10 code
   * @param {number} claimData.totalAmount - Total charge amount
   * @param {number} claimData.copayPaid - Amount patient paid (copay)
   * @param {string} claimData.dateOfService - Service date
   * @param {string} claimData.blockchainProof - Blockchain transaction ID (optional)
   * @returns {Object} Claim submission result
   */
  static async submitClaim(claimData) {
    try {
      console.log('\n📋 INSURANCE: Submitting Claim');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Appointment ID:', claimData.appointmentId);
      console.log('Member ID:', claimData.memberId);
      console.log('Service Code:', claimData.serviceCode);
      console.log('Total Amount: $' + claimData.totalAmount);
      console.log('Copay Paid: $' + claimData.copayPaid);

      // Idempotency: avoid duplicate submissions within a time window
      const idemKey = claimData.idempotency_key ||
        (claimData.patientId && claimData.memberId && claimData.serviceCode && claimData.dateOfService
          ? `idem_${claimData.patientId}_${claimData.memberId}_${claimData.serviceCode}_${claimData.dateOfService}`
          : null);

      if (idemKey) {
        const existing = db.getInsuranceClaimByIdempotency ? db.getInsuranceClaimByIdempotency(idemKey) : null;
        if (existing) {
          console.log('🔁 Idempotent submit detected, returning existing claim:', existing.id);
          return {
            success: true,
            claimId: existing.id,
            x12ClaimId: existing.x12_claim_id || null,
            status: existing.status,
            idempotent: true,
            message: 'Duplicate submission ignored (idempotent)'
          };
        }
      }

      // Build X12 837 claim
      const x12Claim = this._buildClaimRequest(claimData);

      // Call Stedi API to translate to EDI format
      const stediClient = this.getStediClient();
      
      try {
        // POST /x12/translate/837-to-edi
        const translateResponse = await stediClient.post('/x12/translate/837-to-edi', {
          json: x12Claim
        });

        console.log('✅ Stedi API response received');
        console.log('   EDI Claim generated:', translateResponse.data?.edi ? 'Yes' : 'No');
      } catch (apiError) {
        // If Stedi API fails, log and continue with simulation
        console.warn('⚠️  Stedi API call failed, using simulation:', apiError.message);
        if (apiError.response) {
          console.warn('   Status:', apiError.response.status);
          console.warn('   Response:', apiError.response.data);
        }
      }

      // Simulate claim submission (replace with real API call when ready)
      const claimResponse = await this._simulateClaimSubmission(claimData);

      // Store claim in database
      const claimRecord = {
        id: `claim_${uuidv4()}`,
        appointment_id: claimData.appointmentId,
        patient_id: claimData.patientId,
        member_id: claimData.memberId,
        payer_id: claimData.payerId,
        service_code: claimData.serviceCode,
        diagnosis_code: claimData.diagnosisCode || null,
        total_amount: claimData.totalAmount,
        copay_amount: claimData.copayPaid,
        insurance_amount: claimData.totalAmount - claimData.copayPaid,
        status: 'submitted',
        x12_claim_id: claimResponse.claimId || null,
        idempotency_key: idemKey || null,
        blockchain_proof: claimData.blockchainProof || null,
        submitted_at: new Date().toISOString(),
        response_data: JSON.stringify(claimResponse)
      };

      db.createInsuranceClaim(claimRecord);

      console.log('✅ Claim submitted successfully');
      console.log('   Claim ID:', claimRecord.id);
      console.log('   X12 Claim ID:', claimResponse.claimId);
      console.log('   Status: Submitted - Pending approval');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        claimId: claimRecord.id,
        x12ClaimId: claimResponse.claimId,
        status: 'submitted',
        message: 'Claim submitted successfully'
      };

    } catch (error) {
      console.error('❌ Error submitting claim:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check claim status
   * X12 276/277 transaction
   * 
   * @param {string} claimId - Internal claim ID
   * @returns {Object} Claim status
   */
  static async checkClaimStatus(claimId) {
    try {
      const claim = db.getInsuranceClaim(claimId);
      if (!claim) {
        throw new Error('Claim not found');
      }

      console.log('\n🔍 INSURANCE: Checking Claim Status');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Claim ID:', claimId);
      console.log('Current Status:', claim.status);

      // Build X12 276 claim status inquiry
      const x12StatusRequest = this._buildStatusRequest(claim);

      // Call Stedi API
      const stediClient = this.getStediClient();
      
      try {
        // POST /x12/translate/276-to-edi
        const translateResponse = await stediClient.post('/x12/translate/276-to-edi', {
          json: x12StatusRequest
        });

        console.log('✅ Stedi API response received');
      } catch (apiError) {
        console.warn('⚠️  Stedi API call failed, using simulation:', apiError.message);
      }

      // Query insurance payer for status
      // For now, simulate response
      const statusResponse = await this._simulateStatusCheck(claim);

      // Update claim status in database
      if (statusResponse.status !== claim.status) {
        db.updateInsuranceClaim(claimId, {
          status: statusResponse.status,
          status_checked_at: new Date().toISOString(),
          response_data: JSON.stringify(statusResponse)
        });
      }

      console.log('✅ Status check completed');
      console.log('   Status:', statusResponse.status);
      if (statusResponse.status === 'approved' || statusResponse.status === 'paid') {
        console.log('   Payment Amount: $' + statusResponse.paymentAmount);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        claimId: claimId,
        status: statusResponse.status,
        paymentAmount: statusResponse.paymentAmount || null,
        paymentDate: statusResponse.paymentDate || null,
        message: statusResponse.message || `Claim status: ${statusResponse.status}`
      };

    } catch (error) {
      console.error('❌ Error checking claim status:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Build X12 270 eligibility inquiry
   * @private
   */
  static _buildEligibilityRequest(eligibilityData) {
    // X12 270 structure - simplified for now
    // Full X12 format would be more complex
    return {
      transactionType: '270', // Eligibility Inquiry
      patient: {
        name: eligibilityData.patientName,
        dateOfBirth: eligibilityData.dateOfBirth,
        memberId: eligibilityData.memberId
      },
      payer: {
        payerId: eligibilityData.payerId
      },
      service: {
        serviceCode: eligibilityData.serviceCode,
        dateOfService: eligibilityData.dateOfService
      }
    };
  }

  /**
   * Build X12 837 claim
   * @private
   */
  static _buildClaimRequest(claimData) {
    return {
      transactionType: '837', // Healthcare Claim
      patient: {
        patientId: claimData.patientId,
        memberId: claimData.memberId,
        name: claimData.patientName,
        dateOfBirth: claimData.dateOfBirth
      },
      provider: {
        providerId: claimData.providerId || 'Doclittle-Provider-001',
        npi: claimData.npi || null
      },
      payer: {
        payerId: claimData.payerId
      },
      service: {
        serviceCode: claimData.serviceCode,
        diagnosisCode: claimData.diagnosisCode,
        dateOfService: claimData.dateOfService,
        totalAmount: claimData.totalAmount,
        copayPaid: claimData.copayPaid,
        amountOwed: claimData.totalAmount - claimData.copayPaid
      },
      blockchainProof: claimData.blockchainProof || null
    };
  }

  /**
   * Build X12 276 claim status inquiry
   * @private
   */
  static _buildStatusRequest(claim) {
    return {
      transactionType: '276', // Claim Status Inquiry
      claimId: claim.x12_claim_id || claim.id,
      memberId: claim.member_id,
      payerId: claim.payer_id
    };
  }

  /**
   * Simulate eligibility check (replace with real API call)
   * @private
   */
  static async _simulateEligibilityCheck(eligibilityData) {
    // TODO: Replace with real Stedi/insurance API call
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock response - in production, this comes from insurance payer
    const mockResponses = {
      'BCBS': {
        eligible: true,
        copay: 20,
        allowedAmount: 150,
        insurancePays: 130,
        deductibleTotal: 500,
        deductibleRemaining: 200,
        coinsurancePercent: 20,
        planSummary: 'Covers outpatient mental health visits; prior auth not required for first 6 visits.',
        message: 'Eligible - Copay $20'
      },
      'AETNA': {
        eligible: true,
        copay: 25,
        allowedAmount: 150,
        insurancePays: 125,
        deductibleTotal: 1000,
        deductibleRemaining: 600,
        coinsurancePercent: 20,
        planSummary: 'Standard PPO: outpatient mental health covered after copay; deductible applies to labs only.',
        message: 'Eligible - Copay $25'
      },
      'UHC': {
        eligible: true,
        copay: 30,
        allowedAmount: 150,
        insurancePays: 120,
        deductibleTotal: 750,
        deductibleRemaining: 300,
        coinsurancePercent: 20,
        planSummary: 'Outpatient behavioral health in-network covered; 30$ copay; 20% coinsurance after deductible for some services.',
        message: 'Eligible - Copay $30'
      }
    };

    // Default response
    const payerId = eligibilityData.payerId?.toUpperCase() || 'BCBS';
    return mockResponses[payerId] || {
      eligible: true,
      copay: 20,
      allowedAmount: 150,
      insurancePays: 130,
      message: 'Eligible - Copay $20 (default)'
    };
  }

  /**
   * Simulate claim submission (replace with real API call)
   * @private
   */
  static async _simulateClaimSubmission(claimData) {
    // TODO: Replace with real Stedi/insurance API call
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock response
    return {
      claimId: `X12_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'submitted',
      message: 'Claim submitted successfully',
      estimatedProcessingDays: 1
    };
  }

  /**
   * Simulate status check (replace with real API call)
   * @private
   */
  static async _simulateStatusCheck(claim) {
    // TODO: Replace with real Stedi/insurance API call
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock status progression
    const statuses = ['submitted', 'processing', 'approved', 'paid'];
    const currentIndex = statuses.indexOf(claim.status);
    
    // If claim was just submitted, move to processing
    // If processing for >1 day, move to approved
    const submittedDate = new Date(claim.submitted_at);
    const daysSinceSubmission = (Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24);

    let newStatus = claim.status;
    if (claim.status === 'submitted' && daysSinceSubmission > 0.1) {
      newStatus = 'processing';
    } else if (claim.status === 'processing' && daysSinceSubmission > 1) {
      newStatus = 'approved';
    } else if (claim.status === 'approved' && daysSinceSubmission > 1.5) {
      newStatus = 'paid';
    }

    return {
      status: newStatus,
      paymentAmount: newStatus === 'paid' ? (claim.total_amount - claim.copay_amount) : null,
      paymentDate: newStatus === 'paid' ? new Date().toISOString() : null,
      message: `Claim ${newStatus}`
    };
  }

  /**
   * Map appointment type to CPT code
   */
  static mapAppointmentTypeToCPT(appointmentType) {
    const cptMapping = {
      'Mental Health Consultation': '90834', // Psychotherapy 45 min
      'Crisis Intervention': '90839', // Psychotherapy crisis
      'Follow-up Session': '90834', // Psychotherapy 45 min
      'Initial Assessment': '90837', // Psychotherapy 60 min
      'Group Therapy': '90853', // Group psychotherapy
      'Medication Review': '90863' // Pharmacologic management
    };

    return cptMapping[appointmentType] || '90834'; // Default
  }

  /**
   * Map appointment type to ICD-10 code
   */
  static mapAppointmentTypeToICD10(appointmentType) {
    const icd10Mapping = {
      'Mental Health Consultation': 'F41.9', // Unspecified anxiety disorder
      'Crisis Intervention': 'F41.0', // Panic disorder
      'Follow-up Session': 'F41.9', // Unspecified anxiety disorder
      'Initial Assessment': 'Z00.4', // General psychiatric examination
      'Group Therapy': 'F41.9', // Unspecified anxiety disorder
      'Medication Review': 'F41.9' // Unspecified anxiety disorder
    };

    return icd10Mapping[appointmentType] || 'F41.9'; // Default
  }

  /**
   * Fetch list of insurance payers from Stedi
   * GET /payers or /payers/search
   * 
   * @param {Object} options - Search options
   * @param {string} options.search - Search term (payer name)
   * @param {number} options.limit - Maximum number of results
   * @param {string} options.transactionType - Filter by supported transaction type (e.g., '270', '837')
   * @returns {Object} List of payers
   */
  static async fetchPayers(options = {}) {
    try {
      console.log('\n🏥 INSURANCE: Fetching Payer List from Stedi');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const stediClient = this.getStediClient();
      
      // Try different endpoint variations
      let endpoint = '/payers';
      const params = {};

      // If search term provided, use search endpoint
      if (options.search) {
        endpoint = '/payers/search';
        params.q = options.search;
      }

      // Add pagination if limit provided
      if (options.limit) {
        params.limit = options.limit;
      }

      // Filter by transaction type if provided
      if (options.transactionType) {
        params.transactionType = options.transactionType;
      }

      // Build query string
      const queryString = Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params).toString()
        : '';

      console.log(`   Endpoint: ${endpoint}${queryString}`);

      try {
        const response = await stediClient.get(`${endpoint}${queryString}`);
        
        console.log('✅ Successfully fetched payers from Stedi');
        console.log(`   Response status: ${response.status}`);
        
        // Handle different response formats
        const payers = response.data?.payers || response.data?.data || response.data || [];
        
        console.log(`   Total payers found: ${Array.isArray(payers) ? payers.length : 'N/A'}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return {
          success: true,
          payers: Array.isArray(payers) ? payers : [],
          count: Array.isArray(payers) ? payers.length : 0,
          data: response.data
        };

      } catch (apiError) {
        // If Stedi API fails, try alternative endpoints or return error
        console.warn('⚠️  Stedi Payers API call failed:', apiError.message);
        
        if (apiError.response) {
          console.warn('   Status:', apiError.response.status);
          console.warn('   Response:', JSON.stringify(apiError.response.data, null, 2));
          
          // Try alternative endpoint format
          if (apiError.response.status === 404) {
            console.log('   Trying alternative endpoint format...');
            try {
              const altResponse = await stediClient.get('/v1/payers' + queryString);
              const payers = altResponse.data?.payers || altResponse.data?.data || altResponse.data || [];
              
              return {
                success: true,
                payers: Array.isArray(payers) ? payers : [],
                count: Array.isArray(payers) ? payers.length : 0,
                data: altResponse.data
              };
            } catch (altError) {
              console.warn('   Alternative endpoint also failed');
            }
          }
        }

        // Return error but don't throw
        return {
          success: false,
          payers: [],
          count: 0,
          error: apiError.message,
          details: apiError.response?.data
        };
      }

    } catch (error) {
      console.error('❌ Error fetching payers:', error.message);
      return {
        success: false,
        payers: [],
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Search for a specific payer by name or ID
   * 
   * @param {string} searchTerm - Payer name or ID to search for
   * @returns {Object} Search results
   */
  static async searchPayer(searchTerm) {
    return this.fetchPayers({ search: searchTerm, limit: 50 });
  }

  /**
   * Get all payers (paginated)
   * 
   * @param {number} limit - Maximum number of results (default: 100)
   * @returns {Object} List of payers
   */
  static async getAllPayers(limit = 100) {
    return this.fetchPayers({ limit });
  }
}

module.exports = InsuranceService;


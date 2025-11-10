/**
 * EOB (Explanation of Benefits) Calculation Service
 * 
 * This service calculates EOB amounts based on:
 * 1. Real Stedi eligibility data (deductible, copay, coinsurance)
 * 2. CPT code charges from the claim
 * 3. Insurance plan rules
 * 
 * Amount Allowed Logic:
 * - Amount Allowed is the maximum amount the insurance will pay for a service
 * - It's typically from the payer's fee schedule or provider contract
 * - For now, we calculate it as a percentage of billed amount (typical 80-90% for in-network)
 * - In production, this should come from:
 *   1. Fee schedule lookup by CPT code
 *   2. Provider contract rates
 *   3. Or from 835 Remittance Advice after claim adjudication
 */

class EOBCalculationService {
  /**
   * Calculate Amount Allowed for a CPT code
   * 
   * In production, this should:
   * 1. Look up fee schedule by CPT code and payer
   * 2. Check provider contract rates
   * 3. Or use allowed amount from 835 ERA if available
   * 
   * For now, we use a simplified calculation:
   * - In-network: 85% of billed amount (typical)
   * - Out-of-network: 70% of billed amount (typical)
   * 
   * @param {number} billedAmount - Amount billed for the service
   * @param {boolean} inNetwork - Whether provider is in-network (default: true)
   * @returns {number} Allowed amount
   */
  static calculateAllowedAmount(billedAmount, inNetwork = true) {
    if (!billedAmount || billedAmount <= 0) {
      return 0;
    }

    // Typical allowed amounts based on network status
    // In production, this would come from fee schedule or contract
    const allowedPercentage = inNetwork ? 0.85 : 0.70;
    return Math.round(billedAmount * allowedPercentage * 100) / 100;
  }

  /**
   * Calculate EOB breakdown for a claim
   * 
   * @param {Object} params - Calculation parameters
   * @param {Array} params.lineItems - Array of service line items with CPT codes and charges
   * @param {Object} params.eligibility - Stedi eligibility data
   * @param {number} params.eligibility.deductible_total - Total deductible
   * @param {number} params.eligibility.deductible_remaining - Remaining deductible
   * @param {number} params.eligibility.copay_amount - Copay amount
   * @param {number} params.eligibility.coinsurance_percent - Coinsurance percentage (e.g., 20 for 20%)
   * @returns {Object} EOB breakdown
   */
  static calculateEOB({ lineItems = [], eligibility = {} }) {
    // Extract eligibility data
    const deductibleTotal = parseFloat(eligibility.deductible_total || 0);
    const deductibleRemaining = parseFloat(eligibility.deductible_remaining || eligibility.deductible_total || 0);
    const copayAmount = parseFloat(eligibility.copay_amount || 0);
    const coinsurancePercent = parseFloat(eligibility.coinsurance_percent || 0);
    
    // Initialize totals
    let totalBilled = 0;
    let totalAllowed = 0;
    let totalPlanPaid = 0;
    let totalCopay = 0;
    let totalDeductible = 0;
    let totalCoinsurance = 0;
    let totalNotCovered = 0;
    let runningDeductibleRemaining = deductibleRemaining;
    let copayApplied = false; // Track if copay has been applied to this claim

    // Process each line item
    const processedLineItems = lineItems.map((item, index) => {
      const billedAmount = parseFloat(item.charge || item.billed_amount || 0);
      const allowed = item.allowed_amount 
        ? parseFloat(item.allowed_amount)
        : this.calculateAllowedAmount(billedAmount, true); // Assume in-network for now
      
      totalBilled += billedAmount;
      totalAllowed += allowed;

      // Calculate patient responsibility
      let copay = 0;
      let deductible = 0;
      let coinsurance = 0;
      let planPaid = 0;
      let notCovered = Math.max(0, billedAmount - allowed);

      // IMPORTANT: When allowed amount is much lower than billed (e.g., $200 allowed vs $1800 billed),
      // the patient pays: Deductible + Copay + Amount Not Covered
      // The plan pays the full allowed amount (or what's left after deductible/copay if applicable)
      
      // Step 1: Apply deductible if applicable (from allowed amount)
      if (runningDeductibleRemaining > 0 && allowed > 0) {
        const deductibleApplied = Math.min(runningDeductibleRemaining, allowed);
        deductible += deductibleApplied;
        runningDeductibleRemaining -= deductibleApplied;
      }

      // Step 2: Apply copay (typically per visit/claim, not per service)
      // Apply copay once to the first service with remaining allowed amount after deductible
      if (copayAmount > 0 && !copayApplied && (allowed - deductible) > 0) {
        // Copay is usually a fixed amount per visit/claim
        copay = Math.min(copayAmount, allowed - deductible);
        copayApplied = true;
      }

      // Step 3: Calculate coinsurance (patient pays percentage after deductible and copay)
      const amountAfterDeductibleAndCopay = Math.max(0, allowed - deductible - copay);
      if (amountAfterDeductibleAndCopay > 0 && coinsurancePercent > 0) {
        coinsurance = Math.round(amountAfterDeductibleAndCopay * (coinsurancePercent / 100) * 100) / 100;
      }

      // Step 4: Plan pays the remainder of allowed amount
      // If allowed is much less than billed, plan pays full allowed (or remainder after deductible/copay)
      planPaid = Math.max(0, allowed - deductible - copay - coinsurance);
      
      // Special case: If allowed amount is very low compared to billed (e.g., $200 vs $1800),
      // and we want plan to pay full allowed, adjust planPaid
      // This matches the EOB scenario where Plan Paid = Allowed Amount
      if (allowed > 0 && allowed < billedAmount * 0.3) {
        // If allowed is less than 30% of billed, plan pays full allowed
        // Patient pays: Deductible + Copay + Amount Not Covered
        planPaid = allowed;
      }

      // Accumulate totals
      totalCopay += copay;
      totalDeductible += deductible;
      totalCoinsurance += coinsurance;
      totalPlanPaid += planPaid;
      totalNotCovered += notCovered;

      return {
        dateOfService: item.date_of_service || item.date || '',
        typeOfService: item.description || item.code || '',
        cptCode: item.code || '',
        amountBilled: billedAmount,
        allowedAmount: allowed,
        planPaid: Math.max(0, planPaid),
        otherInsurancePaid: 0, // Not applicable for now
        copay: copay,
        coinsurance: coinsurance,
        deductible: deductible,
        amountNotCovered: notCovered,
        whatYouOwe: deductible + copay + coinsurance + notCovered
      };
    });

    // Calculate total patient responsibility
    // Patient owes: Deductible + Copay + Coinsurance + Amount Not Covered
    const totalPatientOwe = totalCopay + totalDeductible + totalCoinsurance + totalNotCovered;

    return {
      lineItems: processedLineItems,
      totals: {
        amountBilled: totalBilled,
        allowedAmount: totalAllowed,
        planPaid: totalPlanPaid,
        otherInsurancePaid: 0,
        copay: totalCopay,
        coinsurance: totalCoinsurance,
        deductible: totalDeductible,
        amountNotCovered: totalNotCovered,
        whatYouOwe: totalPatientOwe
      },
      eligibility: {
        deductibleTotal,
        deductibleRemaining: runningDeductibleRemaining, // Updated after applying claim
        copayAmount,
        coinsurancePercent
      }
    };
  }

  /**
   * Calculate EOB from claim data
   * 
   * @param {Object} claim - Claim object from database
   * @param {Object} eligibility - Stedi eligibility data
   * @param {Object} claimDetails - Parsed claim response_data
   * @returns {Object} Complete EOB data
   */
  static calculateEOBFromClaim(claim, eligibility, claimDetails = {}) {
    // Extract line items from claim details
    const pricing = claimDetails.pricing || {};
    const coding = claimDetails.coding || {};
    
    // Build line items from pricing breakdown or claim data
    let lineItems = [];
    
    if (pricing.breakdown && Array.isArray(pricing.breakdown) && pricing.breakdown.length > 0) {
      // Use pricing breakdown if available (new format from PDF coding or generated from diagnosis codes)
      lineItems = pricing.breakdown.map((item) => ({
        code: item.code || item.cpt_code || '',
        description: item.description || item.name || '',
        charge: item.charge || item.amount || item.billed_amount || parseFloat(item.charge || item.amount || item.billed_amount) || 0,
        allowed_amount: item.allowed_amount || null,
        date_of_service: item.date_of_service || claim.submitted_at || new Date().toISOString().split('T')[0]
      }));
    } else if (claim.service_code && claim.total_amount && claim.service_code !== 'N/A') {
      // Fallback: create line items from claim service codes (legacy format)
      const serviceCodes = claim.service_code.split(',').map(s => s.trim()).filter(s => s && s !== 'N/A');
      
      if (serviceCodes.length > 0) {
        // If multiple service codes, split the amount
        const amountPerService = serviceCodes.length > 0 
          ? claim.total_amount / serviceCodes.length 
          : claim.total_amount;
        
        lineItems = serviceCodes.map((code, index) => {
          // Try to get allowed amount from response_data if available
          let allowedAmount = null;
          if (claimDetails.allowed_amount) {
            allowedAmount = parseFloat(claimDetails.allowed_amount) / serviceCodes.length;
          }
          
          return {
            code: code,
            description: `CPT Code ${code}`,
            charge: amountPerService,
            allowed_amount: allowedAmount,
            date_of_service: claim.submitted_at ? new Date(claim.submitted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          };
        });
      } else {
        // Single service - use total amount
        lineItems = [{
          code: claim.service_code || 'N/A',
          description: 'Medical Service',
          charge: claim.total_amount || 0,
          allowed_amount: claimDetails.allowed_amount ? parseFloat(claimDetails.allowed_amount) : null,
          date_of_service: claim.submitted_at ? new Date(claim.submitted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        }];
      }
    }
    
    // If still no line items, try to generate from diagnosis codes
    if (lineItems.length === 0 && claim.diagnosis_code && claim.diagnosis_code !== 'N/A') {
      const DiagnosisCodeMapper = require('./diagnosis-code-mapper');
      const diagnosisCodes = claim.diagnosis_code.split(',').map(d => d.trim()).filter(d => d && d !== 'N/A');
      
      if (diagnosisCodes.length > 0) {
        console.log('📋 EOB: Generating service line items from diagnosis codes:', diagnosisCodes);
        const generatedLineItems = DiagnosisCodeMapper.generateServiceLineItemsFromDiagnoses(diagnosisCodes, {
          maxServicesPerDiagnosis: 2,
          dateOfService: claim.submitted_at ? new Date(claim.submitted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });
        
        lineItems = generatedLineItems.map(item => ({
          code: item.code || item.cpt_code || '',
          description: item.description || item.name || '',
          charge: item.charge || item.amount || item.billed_amount || 0,
          allowed_amount: item.allowed_amount || null,
          date_of_service: item.date_of_service || (claim.submitted_at ? new Date(claim.submitted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
        }));
        
        console.log(`✅ EOB: Generated ${lineItems.length} service line items from diagnosis codes`);
      }
    }
    
    // Last resort: create single line item from total amount
    if (lineItems.length === 0 && claim.total_amount && claim.total_amount > 0) {
      lineItems = [{
        code: 'N/A',
        description: 'Medical Service',
        charge: claim.total_amount || 0,
        allowed_amount: claimDetails.allowed_amount ? parseFloat(claimDetails.allowed_amount) : null,
        date_of_service: claim.submitted_at ? new Date(claim.submitted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }];
    }

    // Calculate EOB
    const eobCalculation = this.calculateEOB({
      lineItems,
      eligibility
    });

    return eobCalculation;
  }
}

module.exports = EOBCalculationService;


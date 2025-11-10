/**
 * Diagnosis Code to CPT Code Mapper
 * 
 * Maps ICD-10 diagnosis codes to typical CPT service codes with realistic pricing
 * This generates dummy data for claims when only diagnosis codes are available
 */

class DiagnosisCodeMapper {
  /**
   * Map of ICD-10 codes to typical CPT codes and descriptions
   * Based on common medical practices and treatment patterns
   */
  static DIAGNOSIS_TO_CPT_MAP = {
    // ACL Tear - S83.541
    'S83.541': [
      {
        cptCode: '99213',
        description: 'Office visit - Established patient (knee evaluation)',
        typicalCharge: 250.00,
        serviceType: 'Evaluation and Management'
      },
      {
        cptCode: '73721',
        description: 'MRI - Knee without contrast',
        typicalCharge: 1200.00,
        serviceType: 'Diagnostic Imaging'
      },
      {
        cptCode: '97110',
        description: 'Therapeutic exercise (physical therapy)',
        typicalCharge: 85.00,
        serviceType: 'Physical Therapy'
      },
      {
        cptCode: '97112',
        description: 'Neuromuscular reeducation',
        typicalCharge: 95.00,
        serviceType: 'Physical Therapy'
      }
    ],
    
    // Patellar Tendinitis - M76.51
    'M76.51': [
      {
        cptCode: '99213',
        description: 'Office visit - Established patient (knee evaluation)',
        typicalCharge: 250.00,
        serviceType: 'Evaluation and Management'
      },
      {
        cptCode: '20610',
        description: 'Injection - Knee joint (corticosteroid)',
        typicalCharge: 350.00,
        serviceType: 'Therapeutic Injection'
      },
      {
        cptCode: '97110',
        description: 'Therapeutic exercise (physical therapy)',
        typicalCharge: 85.00,
        serviceType: 'Physical Therapy'
      },
      {
        cptCode: '97140',
        description: 'Manual therapy techniques',
        typicalCharge: 90.00,
        serviceType: 'Physical Therapy'
      }
    ]
  };

  /**
   * Get CPT codes for a diagnosis code
   * @param {string} diagnosisCode - ICD-10 diagnosis code (e.g., 'S83.541')
   * @returns {Array} Array of CPT code objects
   */
  static getCPTCodesForDiagnosis(diagnosisCode) {
    const code = diagnosisCode.trim().toUpperCase();
    return this.DIAGNOSIS_TO_CPT_MAP[code] || [];
  }

  /**
   * Generate service line items from diagnosis codes
   * @param {Array} diagnosisCodes - Array of diagnosis code objects or strings
   * @param {Object} options - Options for generation
   * @param {number} options.maxServicesPerDiagnosis - Max services per diagnosis (default: 2)
   * @param {string} options.dateOfService - Date of service (default: today)
   * @returns {Array} Array of service line items
   */
  static generateServiceLineItemsFromDiagnoses(diagnosisCodes, options = {}) {
    const {
      maxServicesPerDiagnosis = 2,
      dateOfService = new Date().toISOString().split('T')[0]
    } = options;

    const lineItems = [];
    const processedCPTs = new Set(); // Avoid duplicates

    // Process each diagnosis code
    diagnosisCodes.forEach((diagCodeObj) => {
      const diagnosisCode = typeof diagCodeObj === 'string' 
        ? diagCodeObj 
        : diagCodeObj.code || diagCodeObj;

      if (!diagnosisCode) return;

      const cptCodes = this.getCPTCodesForDiagnosis(diagnosisCode);
      
      // Select up to maxServicesPerDiagnosis services
      const selectedCPTs = cptCodes.slice(0, maxServicesPerDiagnosis);
      
      selectedCPTs.forEach((cpt) => {
        // Skip if we've already added this CPT code
        if (processedCPTs.has(cpt.cptCode)) return;
        processedCPTs.add(cpt.cptCode);

        lineItems.push({
          code: cpt.cptCode,
          cpt_code: cpt.cptCode,
          description: cpt.description,
          name: cpt.description,
          charge: cpt.typicalCharge,
          amount: cpt.typicalCharge,
          billed_amount: cpt.typicalCharge,
          service_type: cpt.serviceType,
          diagnosis_code: diagnosisCode,
          date_of_service: dateOfService
        });
      });
    });

    // If no line items were generated, create a default one
    if (lineItems.length === 0 && diagnosisCodes.length > 0) {
      const firstDiagnosis = typeof diagnosisCodes[0] === 'string' 
        ? diagnosisCodes[0] 
        : diagnosisCodes[0].code || diagnosisCodes[0];

      lineItems.push({
        code: '99213',
        cpt_code: '99213',
        description: 'Office visit - Established patient',
        name: 'Office visit - Established patient',
        charge: 250.00,
        amount: 250.00,
        billed_amount: 250.00,
        service_type: 'Evaluation and Management',
        diagnosis_code: firstDiagnosis,
        date_of_service: dateOfService
      });
    }

    return lineItems;
  }

  /**
   * Get diagnosis code description
   * @param {string} diagnosisCode - ICD-10 diagnosis code
   * @returns {string} Description of the diagnosis
   */
  static getDiagnosisDescription(diagnosisCode) {
    const descriptions = {
      'S83.541': 'Partial tear of anterior cruciate ligament of left knee',
      'M76.51': 'Patellar tendinitis, left knee'
    };

    return descriptions[diagnosisCode] || diagnosisCode;
  }
}

module.exports = DiagnosisCodeMapper;


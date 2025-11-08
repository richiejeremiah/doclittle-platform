/**
 * PDF Medical Coding Service
 * 
 * Extracts text from PDF, runs medical coding, and returns codes with pricing
 */

const pdfParse = require('pdf-parse');
const { runCodingPipeline } = require('./coding-orchestrator');
const db = require('../database');

// CPT Code Pricing (simplified - in production, use CMS data)
const CPT_PRICING = {
  '90837': { description: 'Psychotherapy, 60 minutes', price: 150.00 },
  '90834': { description: 'Psychotherapy, 45 minutes', price: 120.00 },
  '90833': { description: 'Psychotherapy, 30 minutes', price: 90.00 },
  '90832': { description: 'Psychotherapy, 30 minutes', price: 90.00 },
  '99213': { description: 'Office visit, established patient, low complexity', price: 100.00 },
  '99214': { description: 'Office visit, established patient, moderate complexity', price: 150.00 },
  '99215': { description: 'Office visit, established patient, high complexity', price: 200.00 },
  '99203': { description: 'Office visit, new patient, low complexity', price: 150.00 },
  '99204': { description: 'Office visit, new patient, moderate complexity', price: 250.00 },
  '99205': { description: 'Office visit, new patient, high complexity', price: 350.00 }
};

class PDFCodingService {
  /**
   * Extract text from PDF buffer
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<string>} Extracted text
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  /**
   * Get pricing for CPT codes
   * @param {Array} cptCodes - Array of CPT code objects
   * @returns {Array} CPT codes with pricing
   */
  getCPTPricing(cptCodes) {
    return cptCodes.map(cpt => {
      const code = cpt.code || cpt;
      const pricing = CPT_PRICING[code] || { description: cpt.description || 'Unknown', price: 0 };
      
      return {
        code: code,
        description: pricing.description || cpt.description || 'Unknown',
        price: pricing.price,
        modifier: cpt.modifier || null
      };
    });
  }

  /**
   * Calculate total charge
   * @param {Array} cptCodesWithPricing - CPT codes with pricing
   * @returns {number} Total charge
   */
  calculateTotalCharge(cptCodesWithPricing) {
    return cptCodesWithPricing.reduce((total, cpt) => total + (cpt.price || 0), 0);
  }

  /**
   * Process PDF and extract medical codes
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Coding results with pricing
   */
  async processPDF(pdfBuffer, options = {}) {
    try {
      // Step 1: Extract text from PDF
      console.log('📄 Extracting text from PDF...');
      const extractedText = await this.extractTextFromPDF(pdfBuffer);
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text found in PDF');
      }

      // Step 2: Run medical coding pipeline
      console.log('🔍 Running medical coding pipeline...');
      const codingResult = await runCodingPipeline({
        clinicalNote: extractedText,
        appointmentType: options.appointmentType || 'Unknown',
        durationMinutes: options.durationMinutes || 60,
        patientContext: options.patientContext || {}
      });

      // Step 3: Get CPT pricing
      const cptCodesWithPricing = this.getCPTPricing(codingResult.cpt || []);
      
      // Step 4: Calculate total charge
      const totalCharge = this.calculateTotalCharge(cptCodesWithPricing);

      // Step 5: Extract text positions for overlay (simplified - returns line numbers)
      const textLines = extractedText.split('\n').map((line, index) => ({
        line: index + 1,
        text: line.trim(),
        matches: this.findCodeMatches(line, codingResult)
      })).filter(item => item.text.length > 0);

      return {
        success: true,
        extractedText: extractedText,
        textLines: textLines,
        coding: {
          band: codingResult.band, // SIMPLE, MODERATE, COMPLEX
          icd10: codingResult.icd10 || [],
          cpt: cptCodesWithPricing,
          rationale: codingResult.rationale || ''
        },
        pricing: {
          totalCharge: totalCharge,
          breakdown: cptCodesWithPricing.map(cpt => ({
            code: cpt.code,
            description: cpt.description,
            price: cpt.price,
            modifier: cpt.modifier
          }))
        }
      };
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    }
  }

  /**
   * Find code matches in text line (for highlighting)
   * @param {string} line - Text line
   * @param {Object} codingResult - Coding result
   * @returns {Array} Matches found in line
   */
  findCodeMatches(line, codingResult) {
    const matches = [];
    const lineLower = line.toLowerCase();

    // Check for ICD-10 codes
    if (codingResult.icd10) {
      codingResult.icd10.forEach(icd => {
        const code = icd.code || icd;
        if (lineLower.includes(code.toLowerCase()) || 
            (icd.description && lineLower.includes(icd.description.toLowerCase()))) {
          matches.push({ type: 'icd10', code: code, description: icd.description });
        }
      });
    }

    // Check for CPT codes
    if (codingResult.cpt) {
      codingResult.cpt.forEach(cpt => {
        const code = cpt.code || cpt;
        if (line.includes(code) || 
            (cpt.description && lineLower.includes(cpt.description.toLowerCase()))) {
          matches.push({ type: 'cpt', code: code, description: cpt.description });
        }
      });
    }

    return matches;
  }
}

module.exports = new PDFCodingService();


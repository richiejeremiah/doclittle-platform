/**
 * FHIR Adapter - DocLittle Telehealth Platform
 *
 * Converts between internal platform formats and FHIR resources
 * Handles data transformation for voice calls, transcripts, and orders
 */

class FHIRAdapter {
  /**
   * Convert Retell call data to FHIR-compatible format
   * @param {Object} retellCall - Retell API call data
   * @returns {Object} FHIR-compatible call data
   */
  static retellCallToFHIR(retellCall) {
    return {
      callId: retellCall.call_id,
      customerPhone: retellCall.from_number || retellCall.to_number,
      customerName: retellCall.metadata?.customer_name || 'Unknown',
      customerEmail: retellCall.metadata?.customer_email,
      startTime: retellCall.start_timestamp,
      endTime: retellCall.end_timestamp,
      duration: retellCall.call_analysis?.call_duration,
      merchantId: retellCall.metadata?.merchant_id,
      agentVersion: 'retell-v1'
    };
  }

  /**
   * Convert Retell transcript to FHIR Communication format
   * @param {Array} retellTranscript - Retell transcript array
   * @returns {Array} FHIR-compatible messages
   */
  static retellTranscriptToFHIR(retellTranscript) {
    if (!Array.isArray(retellTranscript)) {
      return [];
    }

    return retellTranscript.map(msg => ({
      text: msg.content || msg.text,
      speaker: msg.role === 'agent' ? 'agent' : 'patient',
      timestamp: msg.timestamp || new Date().toISOString(),
      sentiment: msg.sentiment || this.analyzeSentiment(msg.content)
    }));
  }

  /**
   * Convert voice checkout to FHIR MedicationRequest
   * @param {Object} checkout - Voice checkout data
   * @returns {Object} FHIR-compatible medication request data
   */
  static checkoutToFHIRMedication(checkout) {
    return {
      patientId: checkout.fhir_patient_id,
      patientName: checkout.customer_name,
      encounterId: checkout.fhir_encounter_id,
      productName: checkout.product_name,
      orderId: checkout.id,
      productId: checkout.product_id,
      price: checkout.amount,
      currency: 'USD',
      status: checkout.status === 'completed' ? 'completed' : 'active',
      dosageInstructions: checkout.dosage_instructions ?
        JSON.parse(checkout.dosage_instructions) : []
    };
  }

  /**
   * Convert platform customer to FHIR Patient format
   * @param {Object} customer - Platform customer data
   * @returns {Object} FHIR-compatible patient data
   */
  static customerToFHIRPatient(customer) {
    // Parse name
    let firstName = '';
    let lastName = '';
    if (customer.name) {
      const nameParts = customer.name.trim().split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }

    return {
      firstName,
      lastName,
      phone: this.formatPhone(customer.phone),
      email: customer.email,
      name: customer.name
    };
  }

  /**
   * Convert mental health assessment to FHIR Observation
   * @param {Object} assessment - Assessment data
   * @returns {Object} FHIR-compatible observation data
   */
  static assessmentToFHIRObservation(assessment) {
    // Map assessment types
    const typeMapping = {
      'depression': 'PHQ-9',
      'anxiety': 'GAD-7',
      'mood': 'MOOD',
      'stress': 'STRESS'
    };

    // Map interpretation codes
    const interpretationMapping = {
      'normal': { code: 'N', display: 'Normal' },
      'low': { code: 'L', display: 'Low' },
      'high': { code: 'H', display: 'High' },
      'critical': { code: 'HH', display: 'Critical High' }
    };

    return {
      patientId: assessment.patient_id,
      encounterId: assessment.encounter_id,
      assessmentType: typeMapping[assessment.type] || 'PHQ-9',
      score: assessment.score,
      interpretation: interpretationMapping[assessment.level] || interpretationMapping['normal'],
      effectiveDateTime: assessment.timestamp || new Date().toISOString(),
      notes: assessment.notes ? [{ text: assessment.notes }] : []
    };
  }

  /**
   * Convert FHIR Patient to platform customer format
   * @param {Object} fhirPatient - FHIR Patient resource
   * @returns {Object} Platform customer data
   */
  static fhirPatientToCustomer(fhirPatient) {
    const name = fhirPatient.name?.[0];
    const phone = fhirPatient.telecom?.find(t => t.system === 'phone')?.value;
    const email = fhirPatient.telecom?.find(t => t.system === 'email')?.value;

    return {
      id: fhirPatient.id,
      name: name ? `${name.given?.join(' ')} ${name.family}`.trim() : 'Unknown',
      phone: phone || '',
      email: email || '',
      fhir_id: fhirPatient.id
    };
  }

  /**
   * Convert FHIR Encounter to platform call record
   * @param {Object} fhirEncounter - FHIR Encounter resource
   * @returns {Object} Platform call data
   */
  static fhirEncounterToCall(fhirEncounter) {
    const callId = fhirEncounter.extension?.find(
      e => e.url === 'https://doclittle.health/extension/voice-call-id'
    )?.valueString;

    return {
      id: fhirEncounter.id,
      call_id: callId,
      patient_id: fhirEncounter.subject?.reference?.replace('Patient/', ''),
      status: fhirEncounter.status,
      start_time: fhirEncounter.period?.start,
      end_time: fhirEncounter.period?.end,
      duration: fhirEncounter.length?.value,
      type: fhirEncounter.type?.[0]?.text || 'Mental health support'
    };
  }

  /**
   * Convert FHIR Communication to platform transcript
   * @param {Object} fhirCommunication - FHIR Communication resource
   * @returns {Object} Platform transcript data
   */
  static fhirCommunicationToTranscript(fhirCommunication) {
    const messages = fhirCommunication.payload?.map(p => {
      const speaker = p.extension?.find(
        e => e.url === 'https://doclittle.health/extension/speaker'
      )?.valueString;

      const timestamp = p.extension?.find(
        e => e.url === 'https://doclittle.health/extension/timestamp'
      )?.valueDateTime;

      return {
        text: p.contentString,
        speaker: speaker || 'unknown',
        timestamp: timestamp || fhirCommunication.sent
      };
    }) || [];

    return {
      id: fhirCommunication.id,
      encounter_id: fhirCommunication.encounter?.reference?.replace('Encounter/', ''),
      patient_id: fhirCommunication.subject?.reference?.replace('Patient/', ''),
      messages,
      sent_time: fhirCommunication.sent
    };
  }

  /**
   * Create FHIR Bundle from multiple resources
   * @param {Array} resources - Array of FHIR resources
   * @param {string} type - Bundle type (collection, searchset, transaction)
   * @returns {Object} FHIR Bundle resource
   */
  static createBundle(resources, type = 'collection') {
    return {
      resourceType: 'Bundle',
      type,
      total: resources.length,
      timestamp: new Date().toISOString(),
      entry: resources.map(resource => ({
        fullUrl: `https://doclittle.health/fhir/${resource.resourceType}/${resource.id}`,
        resource
      }))
    };
  }

  /**
   * Extract patient ID from FHIR reference
   * @param {string} reference - FHIR reference (e.g., "Patient/patient-123")
   * @returns {string} Patient ID
   */
  static extractPatientId(reference) {
    if (!reference) return null;
    return reference.replace('Patient/', '');
  }

  /**
   * Extract encounter ID from FHIR reference
   * @param {string} reference - FHIR reference (e.g., "Encounter/encounter-123")
   * @returns {string} Encounter ID
   */
  static extractEncounterId(reference) {
    if (!reference) return null;
    return reference.replace('Encounter/', '');
  }

  /**
   * Format phone number to E.164 standard
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number
   */
  static formatPhone(phone) {
    if (!phone) return null;

    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Add +1 if US number without country code
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }

    // Add + prefix
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Simple sentiment analysis
   * @param {string} text - Text to analyze
   * @returns {string} Sentiment (positive, negative, neutral)
   */
  static analyzeSentiment(text) {
    if (!text) return 'neutral';

    const positiveWords = ['good', 'great', 'happy', 'better', 'thanks', 'thank you', 'helpful', 'wonderful'];
    const negativeWords = ['bad', 'sad', 'angry', 'worse', 'terrible', 'awful', 'depressed', 'anxious'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Validate E.164 phone number format
   * @param {string} phone - Phone number
   * @returns {boolean} Valid or not
   */
  static isValidPhone(phone) {
    if (!phone) return false;
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Sanitize text for FHIR storage
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  static sanitizeText(text) {
    if (!text) return '';
    // Remove control characters and normalize whitespace
    return text.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Parse FHIR search parameters
   * @param {Object} queryParams - Query string parameters
   * @returns {Object} Parsed search parameters
   */
  static parseSearchParams(queryParams) {
    const searchParams = {};

    if (queryParams.name) searchParams.name = queryParams.name;
    if (queryParams.phone) searchParams.phone = this.formatPhone(queryParams.phone);
    if (queryParams.email) searchParams.email = queryParams.email;
    if (queryParams._count) searchParams.limit = parseInt(queryParams._count) || 50;
    if (queryParams.patient) searchParams.patientId = queryParams.patient;
    if (queryParams.encounter) searchParams.encounterId = queryParams.encounter;
    if (queryParams.date) searchParams.date = queryParams.date;

    return searchParams;
  }
}

module.exports = FHIRAdapter;

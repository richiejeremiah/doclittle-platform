/**
 * FHIR Service - DocLittle Telehealth Platform
 *
 * Business logic layer for FHIR resource operations
 * Handles all FHIR resource creation, retrieval, updates, and searches
 */

const db = require('../database');
const FHIRResources = require('../models/fhir-resources');
const { v4: uuidv4 } = require('uuid');

class FHIRService {
  /**
   * Create or get existing patient from phone number
   * @param {Object} patientData - Patient information
   * @returns {Object} FHIR Patient resource
   */
  static async getOrCreatePatient(patientData) {
    try {
      // Check if patient already exists by phone
      if (patientData.phone) {
        const existingPatient = db.getFHIRPatientByPhone(patientData.phone);
        if (existingPatient) {
          console.log(`[FHIR] Found existing patient: ${existingPatient.resource_id}`);
          return existingPatient.resource_data;
        }
      }

      // Create new patient
      // Parse name if provided as string
      let firstName = patientData.firstName;
      let lastName = patientData.lastName;

      if (!firstName && patientData.name) {
        const nameParts = patientData.name.split(' ');
        firstName = nameParts[0] || 'Unknown';
        lastName = nameParts.slice(1).join(' ') || '';
      }

      // Ensure we have at least a first name
      if (!firstName) {
        firstName = 'Unknown';
      }

      const patientResource = FHIRResources.createPatient({
        id: `patient-${uuidv4()}`,
        firstName: firstName,
        lastName: lastName || '',
        phone: patientData.phone,
        email: patientData.email,
        gender: patientData.gender,
        birthDate: patientData.birthDate,
        address: patientData.address,
        consentVoiceRecording: true,
        preferredLanguage: patientData.language || 'en-US',
        timezone: patientData.timezone
      });

      // Validate
      const validation = FHIRResources.validate(patientResource);
      if (!validation.valid) {
        throw new Error(`Patient validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to database
      db.createFHIRPatient(patientResource);

      console.log(`[FHIR] Created new patient: ${patientResource.id}`);
      
      // Optionally create Circle wallet for patient (can be done on-demand later)
      // Wallet will be created when needed via /api/circle/wallets endpoint
      // with entityType='patient' and entityId=patientResource.id
      
      return patientResource;
    } catch (error) {
      console.error('[FHIR] Error in getOrCreatePatient:', error);
      throw error;
    }
  }

  /**
   * Create a new encounter for a voice call
   * @param {Object} encounterData - Encounter information
   * @returns {Object} FHIR Encounter resource
   */
  static async createEncounter(encounterData) {
    try {
      const encounterResource = FHIRResources.createEncounter({
        id: `encounter-${uuidv4()}`,
        patientId: encounterData.patientId,
        patientName: encounterData.patientName,
        callId: encounterData.callId,
        status: encounterData.status || 'in-progress',
        type: encounterData.type || 'Mental health support call',
        startTime: encounterData.startTime || new Date().toISOString(),
        reasonCode: encounterData.reasonCode,
        reasonText: encounterData.reasonText,
        agentVersion: encounterData.agentVersion,
        merchantId: encounterData.merchantId
      });

      // Validate
      const validation = FHIRResources.validate(encounterResource);
      if (!validation.valid) {
        throw new Error(`Encounter validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to database
      db.createFHIREncounter(encounterResource);

      console.log(`[FHIR] Created encounter: ${encounterResource.id} for call: ${encounterData.callId}`);
      return encounterResource;
    } catch (error) {
      console.error('[FHIR] Error in createEncounter:', error);
      throw error;
    }
  }

  /**
   * Update an existing encounter
   * @param {string} encounterId - Encounter resource ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated FHIR Encounter resource
   */
  static async updateEncounter(encounterId, updates) {
    try {
      const existing = db.getFHIREncounter(encounterId);
      if (!existing) {
        throw new Error(`Encounter not found: ${encounterId}`);
      }

      const encounterResource = existing.resource_data;

      // Update fields
      if (updates.status) encounterResource.status = updates.status;
      if (updates.endTime) encounterResource.period.end = updates.endTime;
      if (updates.duration) {
        encounterResource.length = {
          value: updates.duration,
          unit: 'minutes',
          system: 'http://unitsofmeasure.org',
          code: 'min'
        };
      }

      // Update metadata
      encounterResource.meta.lastUpdated = new Date().toISOString();
      encounterResource.meta.versionId = String(parseInt(encounterResource.meta.versionId) + 1);

      // Save to database
      db.updateFHIREncounter(encounterId, encounterResource);

      console.log(`[FHIR] Updated encounter: ${encounterId}`);
      return encounterResource;
    } catch (error) {
      console.error('[FHIR] Error in updateEncounter:', error);
      throw error;
    }
  }

  /**
   * Store voice call transcript as Communication resource
   * @param {Object} transcriptData - Transcript information
   * @returns {Object} FHIR Communication resource
   */
  static async storeTranscript(transcriptData) {
    try {
      const communicationResource = FHIRResources.createCommunication({
        id: `communication-${uuidv4()}`,
        patientId: transcriptData.patientId,
        patientName: transcriptData.patientName,
        encounterId: transcriptData.encounterId,
        messages: transcriptData.messages, // Array of { text, speaker, timestamp, sentiment }
        sentTime: transcriptData.sentTime || new Date().toISOString(),
        category: 'instruction',
        notes: transcriptData.notes
      });

      // Validate
      const validation = FHIRResources.validate(communicationResource);
      if (!validation.valid) {
        throw new Error(`Communication validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to database
      db.createFHIRCommunication(communicationResource);

      console.log(`[FHIR] Stored transcript: ${communicationResource.id} for encounter: ${transcriptData.encounterId}`);
      return communicationResource;
    } catch (error) {
      console.error('[FHIR] Error in storeTranscript:', error);
      throw error;
    }
  }

  /**
   * Create a mental health observation/assessment
   * @param {Object} observationData - Observation information
   * @returns {Object} FHIR Observation resource
   */
  static async createObservation(observationData) {
    try {
      const observationResource = FHIRResources.createObservation({
        id: `observation-${uuidv4()}`,
        patientId: observationData.patientId,
        patientName: observationData.patientName,
        encounterId: observationData.encounterId,
        assessmentType: observationData.assessmentType, // PHQ-9, GAD-7, MOOD, STRESS
        valueInteger: observationData.score,
        valueString: observationData.valueString,
        interpretation: observationData.interpretation,
        effectiveDateTime: observationData.effectiveDateTime || new Date().toISOString(),
        notes: observationData.notes
      });

      // Validate
      const validation = FHIRResources.validate(observationResource);
      if (!validation.valid) {
        throw new Error(`Observation validation failed: ${validation.errors.join(', ')}`);
      }

      // Save to database
      db.createFHIRObservation(observationResource);

      console.log(`[FHIR] Created observation: ${observationResource.id}`);
      return observationResource;
    } catch (error) {
      console.error('[FHIR] Error in createObservation:', error);
      throw error;
    }
  }

  /**
   * Create a medication request (product order)
   * @param {Object} medicationData - Medication request information
   * @returns {Object} FHIR MedicationRequest resource
   */
  static async createMedicationRequest(medicationData) {
    try {
      const medicationResource = FHIRResources.createMedicationRequest({
        id: `medication-request-${uuidv4()}`,
        patientId: medicationData.patientId,
        patientName: medicationData.patientName,
        encounterId: medicationData.encounterId,
        productName: medicationData.productName,
        orderId: medicationData.orderId,
        productId: medicationData.productId,
        price: medicationData.price,
        currency: medicationData.currency || 'USD',
        dosageInstructions: medicationData.dosageInstructions,
        status: medicationData.status || 'active'
      });

      // Save to database (using Observation table for now, can extend later)
      db.createFHIRObservation({
        ...medicationResource,
        code: { coding: [{ code: 'MEDICATION_ORDER' }] },
        subject: { reference: `Patient/${medicationData.patientId}` },
        effectiveDateTime: new Date().toISOString()
      });

      console.log(`[FHIR] Created medication request: ${medicationResource.id}`);
      return medicationResource;
    } catch (error) {
      console.error('[FHIR] Error in createMedicationRequest:', error);
      throw error;
    }
  }

  /**
   * Get patient by ID
   * @param {string} patientId - Patient resource ID
   * @returns {Object} FHIR Patient resource
   */
  static async getPatient(patientId) {
    try {
      const patient = db.getFHIRPatient(patientId);
      if (!patient) {
        throw new Error(`Patient not found: ${patientId}`);
      }
      return patient.resource_data;
    } catch (error) {
      console.error('[FHIR] Error in getPatient:', error);
      throw error;
    }
  }

  /**
   * Search patients
   * @param {Object} searchParams - Search parameters
   * @returns {Array} Array of FHIR Patient resources
   */
  static async searchPatients(searchParams) {
    try {
      const patients = db.searchFHIRPatients(searchParams);
      return patients.map(p => p.resource_data);
    } catch (error) {
      console.error('[FHIR] Error in searchPatients:', error);
      throw error;
    }
  }

  /**
   * Get encounter by ID
   * @param {string} encounterId - Encounter resource ID
   * @returns {Object} FHIR Encounter resource
   */
  static async getEncounter(encounterId) {
    try {
      const encounter = db.getFHIREncounter(encounterId);
      if (!encounter) {
        throw new Error(`Encounter not found: ${encounterId}`);
      }
      return encounter.resource_data;
    } catch (error) {
      console.error('[FHIR] Error in getEncounter:', error);
      throw error;
    }
  }

  /**
   * Get encounter by call ID
   * @param {string} callId - Voice call ID
   * @returns {Object} FHIR Encounter resource
   */
  static async getEncounterByCallId(callId) {
    try {
      const encounter = db.getFHIREncounterByCallId(callId);
      if (!encounter) {
        return null;
      }
      return encounter.resource_data;
    } catch (error) {
      console.error('[FHIR] Error in getEncounterByCallId:', error);
      throw error;
    }
  }

  /**
   * Get all encounters for a patient
   * @param {string} patientId - Patient resource ID
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of FHIR Encounter resources
   */
  static async getPatientEncounters(patientId, limit = 20) {
    try {
      const encounters = db.getPatientEncounters(patientId, limit);
      return encounters.map(e => e.resource_data);
    } catch (error) {
      console.error('[FHIR] Error in getPatientEncounters:', error);
      throw error;
    }
  }

  /**
   * Get encounter transcript (communications)
   * @param {string} encounterId - Encounter resource ID
   * @returns {Array} Array of FHIR Communication resources
   */
  static async getEncounterTranscript(encounterId) {
    try {
      const communications = db.getEncounterCommunications(encounterId);
      return communications.map(c => c.resource_data);
    } catch (error) {
      console.error('[FHIR] Error in getEncounterTranscript:', error);
      throw error;
    }
  }

  /**
   * Get patient observations (assessments)
   * @param {string} patientId - Patient resource ID
   * @param {number} limit - Maximum number of results
   * @returns {Array} Array of FHIR Observation resources
   */
  static async getPatientObservations(patientId, limit = 50) {
    try {
      const observations = db.getPatientObservations(patientId, limit);
      return observations.map(o => o.resource_data);
    } catch (error) {
      console.error('[FHIR] Error in getPatientObservations:', error);
      throw error;
    }
  }

  /**
   * Get patient everything (all resources)
   * @param {string} patientId - Patient resource ID
   * @returns {Object} Bundle of all patient resources
   */
  static async getPatientEverything(patientId) {
    try {
      const patient = await this.getPatient(patientId);
      const encounters = await this.getPatientEncounters(patientId, 100);
      const observations = await this.getPatientObservations(patientId, 100);

      // Get all communications for patient encounters
      const communications = [];
      for (const encounter of encounters) {
        const encounterComms = await this.getEncounterTranscript(encounter.id);
        communications.push(...encounterComms);
      }

      return {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 1 + encounters.length + observations.length + communications.length,
        entry: [
          { resource: patient },
          ...encounters.map(e => ({ resource: e })),
          ...observations.map(o => ({ resource: o })),
          ...communications.map(c => ({ resource: c }))
        ]
      };
    } catch (error) {
      console.error('[FHIR] Error in getPatientEverything:', error);
      throw error;
    }
  }

  /**
   * Log FHIR audit event
   * @param {string} action - Action performed (CREATE, READ, UPDATE, DELETE)
   * @param {string} resourceType - FHIR resource type
   * @param {string} resourceId - Resource ID
   * @param {string} userId - User performing the action
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent string
   */
  static async auditLog(action, resourceType, resourceId, userId, ipAddress, userAgent) {
    try {
      db.createFHIRAuditLog(action, resourceType, resourceId, userId, ipAddress, userAgent);
      console.log(`[FHIR Audit] ${action} ${resourceType}/${resourceId} by ${userId || 'system'}`);
    } catch (error) {
      console.error('[FHIR] Error in auditLog:', error);
      // Don't throw - audit failures shouldn't break the main operation
    }
  }

  /**
   * Process voice call and create all FHIR resources
   * @param {Object} callData - Voice call information
   * @returns {Object} Created FHIR resources
   */
  static async processVoiceCall(callData) {
    try {
      console.log('[FHIR] Processing voice call:', callData.callId);

      // 1. Get or create patient
      const patient = await this.getOrCreatePatient({
        phone: callData.customerPhone,
        email: callData.customerEmail,
        name: callData.customerName
      });

      // 2. Create encounter for this call
      const encounter = await this.createEncounter({
        patientId: patient.id,
        patientName: callData.customerName,
        callId: callData.callId,
        status: 'in-progress',
        startTime: new Date().toISOString(),
        merchantId: callData.merchantId,
        agentVersion: callData.agentVersion
      });

      console.log(`[FHIR] Voice call processed: Patient ${patient.id}, Encounter ${encounter.id}`);

      return {
        patient,
        encounter
      };
    } catch (error) {
      console.error('[FHIR] Error in processVoiceCall:', error);
      throw error;
    }
  }

  /**
   * Complete voice call and finalize FHIR resources
   * @param {string} callId - Voice call ID
   * @param {Object} callSummary - Call completion data
   * @returns {Object} Updated FHIR resources
   */
  static async completeVoiceCall(callId, callSummary) {
    try {
      console.log('[FHIR] Completing voice call:', callId);

      // 1. Get encounter by call ID
      const encounter = await this.getEncounterByCallId(callId);
      if (!encounter) {
        throw new Error(`Encounter not found for call: ${callId}`);
      }

      // 2. Update encounter status
      const updatedEncounter = await this.updateEncounter(encounter.id, {
        status: 'finished',
        endTime: new Date().toISOString(),
        duration: callSummary.duration
      });

      // 3. Store transcript if provided
      let communication = null;
      if (callSummary.transcript && callSummary.transcript.length > 0) {
        communication = await this.storeTranscript({
          patientId: encounter.subject.reference.replace('Patient/', ''),
          encounterId: encounter.id,
          messages: callSummary.transcript
        });
      }

      // 4. Store assessment if provided
      let observation = null;
      if (callSummary.assessment) {
        observation = await this.createObservation({
          patientId: encounter.subject.reference.replace('Patient/', ''),
          encounterId: encounter.id,
          assessmentType: callSummary.assessment.type,
          score: callSummary.assessment.score,
          interpretation: callSummary.assessment.interpretation
        });
      }

      console.log(`[FHIR] Voice call completed: ${callId}`);

      return {
        encounter: updatedEncounter,
        communication,
        observation
      };
    } catch (error) {
      console.error('[FHIR] Error in completeVoiceCall:', error);
      throw error;
    }
  }
}

module.exports = FHIRService;

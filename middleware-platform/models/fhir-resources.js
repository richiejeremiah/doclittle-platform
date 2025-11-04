/**
 * FHIR Resource Templates - DocLittle Telehealth Platform
 *
 * FHIR R4 compliant resource templates for:
 * - Patient (demographics)
 * - Encounter (voice call sessions)
 * - Communication (call transcripts)
 * - Observation (mental health assessments)
 *
 * These templates follow HL7 FHIR R4 specification
 */

const { v4: uuidv4 } = require('uuid');

class FHIRResources {
  /**
   * Create a FHIR Patient resource
   * @param {Object} data - Patient data
   * @returns {Object} FHIR Patient resource
   */
  static createPatient(data) {
    const patientId = data.id || `patient-${uuidv4()}`;

    return {
      resourceType: 'Patient',
      id: patientId,
      identifier: [
        {
          system: 'https://doclittle.health/patient-id',
          value: data.patientNumber || patientId
        }
      ],
      active: data.active !== undefined ? data.active : true,
      name: (data.name || data.firstName || data.lastName) ? [{
        use: 'official',
        family: data.name?.family || data.lastName || '',
        given: data.name?.given || (data.firstName ? [data.firstName] : [])
      }] : [],
      telecom: [
        ...(data.phone ? [{
          system: 'phone',
          value: data.phone,
          use: 'mobile'
        }] : []),
        ...(data.email ? [{
          system: 'email',
          value: data.email
        }] : [])
      ],
      gender: data.gender,
      birthDate: data.birthDate,
      address: data.address ? [{
        use: 'home',
        line: [data.address.line || data.address.street],
        city: data.address.city,
        state: data.address.state,
        postalCode: data.address.postalCode || data.address.zip,
        country: data.address.country || 'US'
      }] : [],
      extension: [
        {
          url: 'https://doclittle.health/extension/consent-voice-recording',
          valueBoolean: data.consentVoiceRecording !== undefined ? data.consentVoiceRecording : true
        },
        {
          url: 'https://doclittle.health/extension/preferred-language',
          valueCode: data.preferredLanguage || 'en-US'
        },
        ...(data.timezone ? [{
          url: 'https://doclittle.health/extension/timezone',
          valueString: data.timezone
        }] : [])
      ],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Create a FHIR Encounter resource (Voice Call Session)
   * @param {Object} data - Encounter data
   * @returns {Object} FHIR Encounter resource
   */
  static createEncounter(data) {
    const encounterId = data.id || `encounter-${uuidv4()}`;

    return {
      resourceType: 'Encounter',
      id: encounterId,
      status: data.status || 'in-progress', // planned | in-progress | finished | cancelled
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'VR',
        display: 'virtual'
      },
      type: [{
        coding: [{
          system: 'http://snomed.info/sct',
          code: '185389009',
          display: 'Mental health counseling'
        }],
        text: data.type || 'Mental health support call'
      }],
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      period: {
        start: data.startTime || new Date().toISOString(),
        ...(data.endTime && { end: data.endTime })
      },
      ...(data.duration && {
        length: {
          value: data.duration,
          unit: 'minutes',
          system: 'http://unitsofmeasure.org',
          code: 'min'
        }
      }),
      reasonCode: data.reasonCode ? [{
        coding: [{
          system: 'http://snomed.info/sct',
          code: data.reasonCode.code || '35489007',
          display: data.reasonCode.display || 'Depressive disorder'
        }],
        text: data.reasonText || 'Mental health support'
      }] : [],
      extension: [
        {
          url: 'https://doclittle.health/extension/voice-call-id',
          valueString: data.callId || encounterId
        },
        {
          url: 'https://doclittle.health/extension/ai-agent-version',
          valueString: data.agentVersion || 'v1.0.0'
        },
        ...(data.callQuality ? [{
          url: 'https://doclittle.health/extension/call-quality',
          valueInteger: data.callQuality // 1-5 rating
        }] : []),
        ...(data.merchantId ? [{
          url: 'https://doclittle.health/extension/merchant-id',
          valueString: data.merchantId
        }] : [])
      ],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Create a FHIR Communication resource (Voice Transcript)
   * @param {Object} data - Communication data
   * @returns {Object} FHIR Communication resource
   */
  static createCommunication(data) {
    const communicationId = data.id || `communication-${uuidv4()}`;

    return {
      resourceType: 'Communication',
      id: communicationId,
      status: data.status || 'completed', // preparation | in-progress | completed
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/communication-category',
          code: data.category || 'instruction',
          display: 'Instruction'
        }]
      }],
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      ...(data.encounterId && {
        encounter: {
          reference: `Encounter/${data.encounterId}`
        }
      }),
      sent: data.sentTime || new Date().toISOString(),
      ...(data.receivedTime && { received: data.receivedTime }),
      recipient: [{
        reference: data.recipientReference || 'Device/voice-agent-001',
        display: 'DocLittle Voice Agent'
      }],
      sender: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      payload: data.messages ? data.messages.map(msg => ({
        contentString: msg.text,
        extension: [
          {
            url: 'https://doclittle.health/extension/speaker',
            valueString: msg.speaker // 'patient' or 'agent'
          },
          {
            url: 'https://doclittle.health/extension/timestamp',
            valueDateTime: msg.timestamp || new Date().toISOString()
          },
          ...(msg.sentiment ? [{
            url: 'https://doclittle.health/extension/sentiment',
            valueString: msg.sentiment // 'positive', 'negative', 'neutral'
          }] : [])
        ]
      })) : [],
      note: data.notes ? data.notes.map(note => ({
        text: note.text,
        time: note.time || new Date().toISOString(),
        ...(note.author && { authorString: note.author })
      })) : [],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Create a FHIR Observation resource (Mental Health Assessment)
   * @param {Object} data - Observation data
   * @returns {Object} FHIR Observation resource
   */
  static createObservation(data) {
    const observationId = data.id || `observation-${uuidv4()}`;

    // Common assessment codes
    const assessmentCodes = {
      'PHQ-9': { system: 'http://loinc.org', code: '44261-6', display: 'PHQ-9 (Patient Health Questionnaire)' },
      'GAD-7': { system: 'http://loinc.org', code: '69737-5', display: 'GAD-7 (Generalized Anxiety Disorder)' },
      'MOOD': { system: 'http://snomed.info/sct', code: '285854004', display: 'Mood assessment' },
      'STRESS': { system: 'http://snomed.info/sct', code: '262188008', display: 'Stress level' }
    };

    const assessmentCode = assessmentCodes[data.assessmentType] || {
      system: 'http://loinc.org',
      code: data.code || '44261-6',
      display: data.display || 'Mental health assessment'
    };

    return {
      resourceType: 'Observation',
      id: observationId,
      status: 'final', // registered | preliminary | final | amended
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'survey',
          display: 'Survey'
        }]
      }],
      code: {
        coding: [assessmentCode],
        text: data.text || assessmentCode.display
      },
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      ...(data.encounterId && {
        encounter: {
          reference: `Encounter/${data.encounterId}`
        }
      }),
      effectiveDateTime: data.effectiveDateTime || new Date().toISOString(),
      ...(data.valueInteger !== undefined && { valueInteger: data.valueInteger }),
      ...(data.valueString && { valueString: data.valueString }),
      ...(data.valueBoolean !== undefined && { valueBoolean: data.valueBoolean }),
      ...(data.interpretation && {
        interpretation: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
            code: data.interpretation.code || 'N',
            display: data.interpretation.display || 'Normal'
          }],
          text: data.interpretation.text
        }]
      }),
      note: data.notes ? data.notes.map(note => ({
        text: note.text || note,
        time: note.time || new Date().toISOString()
      })) : [],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Create a FHIR MedicationRequest resource (Product Order)
   * @param {Object} data - Medication request data
   * @returns {Object} FHIR MedicationRequest resource
   */
  static createMedicationRequest(data) {
    const medicationRequestId = data.id || `medication-request-${uuidv4()}`;

    return {
      resourceType: 'MedicationRequest',
      id: medicationRequestId,
      status: data.status || 'active', // active | completed | cancelled
      intent: 'order',
      medicationCodeableConcept: {
        coding: data.coding || [],
        text: data.productName || data.medicationName
      },
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      ...(data.encounterId && {
        encounter: {
          reference: `Encounter/${data.encounterId}`
        }
      }),
      authoredOn: data.authoredOn || new Date().toISOString(),
      requester: {
        reference: data.requesterReference || 'Device/voice-agent-001',
        display: 'DocLittle Voice Agent'
      },
      dosageInstruction: data.dosageInstructions ? data.dosageInstructions.map(instruction => ({
        text: instruction.text,
        timing: instruction.timing || {
          repeat: {
            frequency: 1,
            period: 1,
            periodUnit: 'd'
          }
        }
      })) : [],
      extension: [
        ...(data.orderId ? [{
          url: 'https://doclittle.health/extension/order-id',
          valueString: data.orderId
        }] : []),
        ...(data.price ? [{
          url: 'https://doclittle.health/extension/purchase-price',
          valueMoney: {
            value: data.price,
            currency: data.currency || 'USD'
          }
        }] : []),
        ...(data.productId ? [{
          url: 'https://doclittle.health/extension/product-id',
          valueString: data.productId
        }] : [])
      ],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Create a FHIR CarePlan resource (Treatment Plan)
   * @param {Object} data - Care plan data
   * @returns {Object} FHIR CarePlan resource
   */
  static createCarePlan(data) {
    const carePlanId = data.id || `careplan-${uuidv4()}`;

    return {
      resourceType: 'CarePlan',
      id: carePlanId,
      status: data.status || 'active', // draft | active | completed | cancelled
      intent: 'plan',
      title: data.title || 'Mental Health Support Plan',
      description: data.description || 'Ongoing mental health support via voice sessions',
      subject: {
        reference: `Patient/${data.patientId}`,
        display: data.patientName
      },
      period: {
        start: data.startDate || new Date().toISOString(),
        ...(data.endDate && { end: data.endDate })
      },
      created: data.createdDate || new Date().toISOString(),
      activity: data.activities ? data.activities.map(activity => ({
        detail: {
          kind: 'ServiceRequest',
          code: {
            text: activity.description || activity.text
          },
          status: activity.status || 'in-progress',
          ...(activity.schedule && {
            scheduledTiming: {
              repeat: activity.schedule
            }
          })
        }
      })) : [],
      goal: data.goals ? data.goals.map(goal => ({
        reference: `Goal/${goal.id || uuidv4()}`,
        display: goal.text || goal.description
      })) : [],
      meta: {
        lastUpdated: new Date().toISOString(),
        versionId: '1',
        source: 'https://doclittle.health'
      }
    };
  }

  /**
   * Validate a FHIR resource
   * @param {Object} resource - FHIR resource to validate
   * @returns {Object} Validation result { valid: boolean, errors: [] }
   */
  static validate(resource) {
    const errors = [];

    if (!resource.resourceType) {
      errors.push('Missing required field: resourceType');
    }

    if (!resource.id) {
      errors.push('Missing required field: id');
    }

    // Resource-specific validation
    switch (resource.resourceType) {
      case 'Patient':
        if (!resource.name || resource.name.length === 0) {
          errors.push('Patient must have at least one name');
        }
        break;
      case 'Encounter':
        if (!resource.subject) {
          errors.push('Encounter must have a subject (patient reference)');
        }
        if (!resource.status) {
          errors.push('Encounter must have a status');
        }
        break;
      case 'Communication':
        if (!resource.subject) {
          errors.push('Communication must have a subject (patient reference)');
        }
        break;
      case 'Observation':
        if (!resource.subject) {
          errors.push('Observation must have a subject (patient reference)');
        }
        if (!resource.code) {
          errors.push('Observation must have a code');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = FHIRResources;

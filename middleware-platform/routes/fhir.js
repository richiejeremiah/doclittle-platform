/**
 * FHIR API Routes - DocLittle Telehealth Platform
 *
 * RESTful FHIR R4 compliant API endpoints
 * Implements standard FHIR operations: Create, Read, Update, Search
 */

const express = require('express');
const router = express.Router();
const FHIRService = require('../services/fhir-service');
const FHIRAdapter = require('../adapters/fhir-adapter');

/**
 * Middleware to log all FHIR API requests
 */
router.use((req, res, next) => {
  console.log(`[FHIR API] ${req.method} ${req.path}`);
  next();
});

/**
 * Middleware to set FHIR-compliant response headers
 */
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/fhir+json');
  next();
});

// ==========================================
// PATIENT ENDPOINTS
// ==========================================

/**
 * POST /fhir/Patient
 * Create a new patient
 */
router.post('/Patient', async (req, res) => {
  try {
    const patient = await FHIRService.getOrCreatePatient(req.body);

    // Audit log
    await FHIRService.auditLog(
      'CREATE',
      'Patient',
      patient.id,
      req.body.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json(patient);
  } catch (error) {
    console.error('[FHIR API] Error creating patient:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Patient/:id
 * Get patient by ID
 */
router.get('/Patient/:id', async (req, res) => {
  try {
    const patient = await FHIRService.getPatient(req.params.id);

    // Audit log
    await FHIRService.auditLog(
      'READ',
      'Patient',
      req.params.id,
      req.query.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.json(patient);
  } catch (error) {
    console.error('[FHIR API] Error getting patient:', error);
    res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Patient
 * Search patients
 * Query params: name, phone, email, _count
 */
router.get('/Patient', async (req, res) => {
  try {
    const searchParams = FHIRAdapter.parseSearchParams(req.query);
    const patients = await FHIRService.searchPatients(searchParams);

    const bundle = FHIRAdapter.createBundle(patients, 'searchset');
    res.json(bundle);
  } catch (error) {
    console.error('[FHIR API] Error searching patients:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Patient/:id/$everything
 * Get all resources for a patient
 */
router.get('/Patient/:id/$everything', async (req, res) => {
  try {
    const bundle = await FHIRService.getPatientEverything(req.params.id);

    // Audit log
    await FHIRService.auditLog(
      'READ',
      'Patient',
      req.params.id,
      req.query.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.json(bundle);
  } catch (error) {
    console.error('[FHIR API] Error getting patient everything:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

// ==========================================
// ENCOUNTER ENDPOINTS
// ==========================================

/**
 * POST /fhir/Encounter
 * Create a new encounter
 */
router.post('/Encounter', async (req, res) => {
  try {
    const encounter = await FHIRService.createEncounter(req.body);

    // Audit log
    await FHIRService.auditLog(
      'CREATE',
      'Encounter',
      encounter.id,
      req.body.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json(encounter);
  } catch (error) {
    console.error('[FHIR API] Error creating encounter:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Encounter/:id
 * Get encounter by ID
 */
router.get('/Encounter/:id', async (req, res) => {
  try {
    const encounter = await FHIRService.getEncounter(req.params.id);

    // Audit log
    await FHIRService.auditLog(
      'READ',
      'Encounter',
      req.params.id,
      req.query.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.json(encounter);
  } catch (error) {
    console.error('[FHIR API] Error getting encounter:', error);
    res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * PUT /fhir/Encounter/:id
 * Update an encounter
 */
router.put('/Encounter/:id', async (req, res) => {
  try {
    const encounter = await FHIRService.updateEncounter(req.params.id, req.body);

    // Audit log
    await FHIRService.auditLog(
      'UPDATE',
      'Encounter',
      req.params.id,
      req.body.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.json(encounter);
  } catch (error) {
    console.error('[FHIR API] Error updating encounter:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Encounter
 * Search encounters
 * Query params: patient, date, _count
 */
router.get('/Encounter', async (req, res) => {
  try {
    if (!req.query.patient) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'required',
          diagnostics: 'patient parameter is required'
        }]
      });
    }

    const encounters = await FHIRService.getPatientEncounters(
      req.query.patient,
      parseInt(req.query._count) || 20
    );

    const bundle = FHIRAdapter.createBundle(encounters, 'searchset');
    res.json(bundle);
  } catch (error) {
    console.error('[FHIR API] Error searching encounters:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

// ==========================================
// COMMUNICATION ENDPOINTS (Transcripts)
// ==========================================

/**
 * POST /fhir/Communication
 * Store a transcript
 */
router.post('/Communication', async (req, res) => {
  try {
    const communication = await FHIRService.storeTranscript(req.body);

    // Audit log
    await FHIRService.auditLog(
      'CREATE',
      'Communication',
      communication.id,
      req.body.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json(communication);
  } catch (error) {
    console.error('[FHIR API] Error creating communication:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Communication/:id
 * Get communication by ID
 */
router.get('/Communication/:id', async (req, res) => {
  try {
    const communication = await FHIRService.getEncounterTranscript(req.params.id);

    // Audit log
    await FHIRService.auditLog(
      'READ',
      'Communication',
      req.params.id,
      req.query.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.json(communication);
  } catch (error) {
    console.error('[FHIR API] Error getting communication:', error);
    res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Communication
 * Search communications
 * Query params: encounter, patient
 */
router.get('/Communication', async (req, res) => {
  try {
    if (!req.query.encounter) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'required',
          diagnostics: 'encounter parameter is required'
        }]
      });
    }

    const communications = await FHIRService.getEncounterTranscript(req.query.encounter);

    const bundle = FHIRAdapter.createBundle(communications, 'searchset');
    res.json(bundle);
  } catch (error) {
    console.error('[FHIR API] Error searching communications:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

// ==========================================
// OBSERVATION ENDPOINTS (Assessments)
// ==========================================

/**
 * POST /fhir/Observation
 * Create an observation (assessment)
 */
router.post('/Observation', async (req, res) => {
  try {
    const observation = await FHIRService.createObservation(req.body);

    // Audit log
    await FHIRService.auditLog(
      'CREATE',
      'Observation',
      observation.id,
      req.body.userId || 'system',
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json(observation);
  } catch (error) {
    console.error('[FHIR API] Error creating observation:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

/**
 * GET /fhir/Observation
 * Search observations
 * Query params: patient, encounter, _count
 */
router.get('/Observation', async (req, res) => {
  try {
    if (!req.query.patient) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'required',
          diagnostics: 'patient parameter is required'
        }]
      });
    }

    const observations = await FHIRService.getPatientObservations(
      req.query.patient,
      parseInt(req.query._count) || 50
    );

    const bundle = FHIRAdapter.createBundle(observations, 'searchset');
    res.json(bundle);
  } catch (error) {
    console.error('[FHIR API] Error searching observations:', error);
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        diagnostics: error.message
      }]
    });
  }
});

// ==========================================
// UTILITY ENDPOINTS
// ==========================================

/**
 * GET /fhir/metadata
 * Get FHIR capability statement
 */
router.get('/metadata', (req, res) => {
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: {
      name: 'DocLittle Telehealth Platform',
      version: '1.0.0'
    },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [{
      mode: 'server',
      resource: [
        {
          type: 'Patient',
          interaction: [
            { code: 'create' },
            { code: 'read' },
            { code: 'search-type' }
          ],
          searchParam: [
            { name: 'name', type: 'string' },
            { name: 'phone', type: 'string' },
            { name: 'email', type: 'string' }
          ]
        },
        {
          type: 'Encounter',
          interaction: [
            { code: 'create' },
            { code: 'read' },
            { code: 'update' },
            { code: 'search-type' }
          ],
          searchParam: [
            { name: 'patient', type: 'reference' },
            { name: 'date', type: 'date' }
          ]
        },
        {
          type: 'Communication',
          interaction: [
            { code: 'create' },
            { code: 'read' },
            { code: 'search-type' }
          ],
          searchParam: [
            { name: 'encounter', type: 'reference' },
            { name: 'patient', type: 'reference' }
          ]
        },
        {
          type: 'Observation',
          interaction: [
            { code: 'create' },
            { code: 'search-type' }
          ],
          searchParam: [
            { name: 'patient', type: 'reference' },
            { name: 'encounter', type: 'reference' }
          ]
        }
      ]
    }]
  });
});

/**
 * GET /fhir/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'FHIR API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

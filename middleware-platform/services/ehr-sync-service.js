/**
 * EHR Sync Service
 * 
 * Polls connected EHRs for completed encounters and syncs clinical data
 * (ICD-10, CPT codes, vitals, notes) to DocLittle database.
 */

const ehrAggregator = require('./ehr-aggregator-service');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class EHRSyncService {
  constructor() {
    this.syncInterval = null;
    this.syncIntervalMs = 2 * 60 * 1000; // 2 minutes
  }

  /**
   * Start automatic sync (polls every 2 minutes)
   */
  start() {
    if (this.syncInterval) {
      console.log('⚠️  EHR sync already running');
      return;
    }

    console.log('🔄 Starting EHR sync service (polling every 2 minutes)...');
    
    // Initial sync
    this.syncAllConnections().catch(err => {
      console.error('❌ Initial EHR sync failed:', err.message);
    });

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.syncAllConnections().catch(err => {
        console.error('❌ Periodic EHR sync failed:', err.message);
      });
    }, this.syncIntervalMs);
  }

  /**
   * Stop automatic sync
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️  EHR sync service stopped');
    }
  }

  /**
   * Sync all active EHR connections
   */
  async syncAllConnections() {
    try {
      const connections = db.prepare(`
        SELECT * FROM ehr_connections 
        WHERE access_token IS NOT NULL 
          AND (expires_at IS NULL OR expires_at > datetime('now'))
          AND connected_at IS NOT NULL
      `).all();

      if (connections.length === 0) {
        return { synced: 0, message: 'No active EHR connections' };
      }

      let totalSynced = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const connection of connections) {
        try {
          const result = await this.syncConnection(connection.id, today);
          totalSynced += result.synced || 0;
        } catch (error) {
          console.error(`❌ Failed to sync connection ${connection.id}:`, error.message);
        }
      }

      return { synced: totalSynced, connections: connections.length };
    } catch (error) {
      console.error('Error syncing EHR connections:', error);
      throw error;
    }
  }

  /**
   * Sync a specific EHR connection
   * @param {string} connectionId - Connection ID
   * @param {string} date - Date to sync (YYYY-MM-DD), defaults to today
   */
  async syncConnection(connectionId, date = null) {
    try {
      const connection = db.prepare(`
        SELECT * FROM ehr_connections WHERE id = ?
      `).get(connectionId);

      if (!connection) {
        throw new Error('Connection not found');
      }

      const syncDate = date || new Date().toISOString().split('T')[0];
      
      console.log(`🔄 Syncing EHR connection ${connectionId} for ${syncDate}...`);

      // Fetch encounters
      const encounterEntries = await ehrAggregator.fetchEncounters(connectionId, syncDate);
      
      let synced = 0;
      for (const entry of encounterEntries) {
        const encounter = entry.resource;
        
        // Only sync finished encounters
        if (encounter.status !== 'finished' && encounter.status !== 'completed') {
          continue;
        }

        // Check if already synced
        const existing = db.prepare(`
          SELECT id FROM ehr_encounters WHERE fhir_encounter_id = ?
        `).get(encounter.id);

        if (existing) {
          continue; // Already synced
        }

        // Match to appointment
        const patientId = encounter.subject?.reference?.replace('Patient/', '') || 
                         encounter.subject?.id;
        
        if (!patientId) {
          console.warn(`⚠️  Encounter ${encounter.id} has no patient reference`);
          continue;
        }

        // Get patient phone from FHIR patient
        const fhirPatient = db.prepare(`
          SELECT phone FROM fhir_patients WHERE resource_id = ?
        `).get(patientId);

        if (!fhirPatient) {
          console.warn(`⚠️  Patient ${patientId} not found in DocLittle`);
          continue;
        }

        // Match encounter to appointment
        const encounterDate = encounter.period?.start?.split('T')[0];
        const appointment = ehrAggregator.matchEncounterToAppointment(
          encounter,
          fhirPatient.phone,
          encounterDate
        );

        if (!appointment) {
          console.warn(`⚠️  Could not match encounter ${encounter.id} to appointment`);
          // Still sync the encounter, but without appointment link
        }

        // Sync encounter and clinical data
        await this.syncEncounterData(connectionId, encounter, appointment?.id || null, patientId);
        synced++;
      }

      console.log(`✅ Synced ${synced} encounters from connection ${connectionId}`);
      return { synced, date: syncDate };
    } catch (error) {
      console.error(`Error syncing connection ${connectionId}:`, error);
      throw error;
    }
  }

  /**
   * Sync encounter and all related clinical data
   * @param {string} connectionId - Connection ID
   * @param {Object} encounter - FHIR Encounter resource
   * @param {string|null} appointmentId - Matched appointment ID
   * @param {string} patientId - FHIR Patient ID
   */
  async syncEncounterData(connectionId, encounter, appointmentId, patientId) {
    const encounterId = encounter.id;
    const startTime = encounter.period?.start || null;
    const endTime = encounter.period?.end || null;
    const status = encounter.status;

    // Store encounter
    const ehrEncounterId = uuidv4();
    db.prepare(`
      INSERT INTO ehr_encounters 
      (id, fhir_encounter_id, patient_id, appointment_id, provider_id, 
       start_time, end_time, status, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      ehrEncounterId,
      encounterId,
      patientId,
      appointmentId,
      encounter.participant?.[0]?.individual?.reference?.replace('Practitioner/', '') || null,
      startTime,
      endTime,
      status,
      JSON.stringify(encounter)
    );

    // Fetch and store conditions (ICD-10 codes)
    try {
      const conditionEntries = await ehrAggregator.fetchConditions(connectionId, encounterId);
      const icdCodes = ehrAggregator.extractICDCodes(conditionEntries);
      
      for (const code of icdCodes) {
        db.prepare(`
          INSERT INTO ehr_conditions 
          (id, ehr_encounter_id, icd10_code, description, is_primary, raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          ehrEncounterId,
          code.code,
          code.display,
          code.primary ? 1 : 0,
          JSON.stringify(code)
        );
      }

      // Update appointment with primary ICD-10 if found
      if (appointmentId && icdCodes.length > 0) {
        const primaryCode = icdCodes.find(c => c.primary) || icdCodes[0];
        db.prepare(`
          UPDATE appointments 
          SET primary_icd10 = ?, ehr_synced = 1
          WHERE id = ?
        `).run(primaryCode.code, appointmentId);
      }
    } catch (error) {
      console.error(`Error syncing conditions for encounter ${encounterId}:`, error);
    }

    // Fetch and store procedures (CPT codes)
    try {
      const procedureEntries = await ehrAggregator.fetchProcedures(connectionId, encounterId);
      const cptCodes = ehrAggregator.extractCPTCodes(procedureEntries);
      
      for (const code of cptCodes) {
        db.prepare(`
          INSERT INTO ehr_procedures 
          (id, ehr_encounter_id, cpt_code, modifier, description, raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          ehrEncounterId,
          code.code,
          code.modifier,
          code.display,
          JSON.stringify(code)
        );
      }

      // Update appointment with primary CPT if found
      if (appointmentId && cptCodes.length > 0) {
        const primaryCPT = cptCodes[0];
        db.prepare(`
          UPDATE appointments 
          SET primary_cpt = ?, ehr_synced = 1
          WHERE id = ?
        `).run(primaryCPT.code, appointmentId);
      }
    } catch (error) {
      console.error(`Error syncing procedures for encounter ${encounterId}:`, error);
    }

    // Fetch and store observations (vitals, notes)
    try {
      const observationEntries = await ehrAggregator.fetchObservations(connectionId, encounterId);
      
      for (const entry of observationEntries) {
        const observation = entry.resource;
        const type = observation.code?.coding?.[0]?.display || observation.code?.text || 'unknown';
        const value = observation.valueQuantity?.value || 
                     observation.valueString || 
                     observation.valueCodeableConcept?.coding?.[0]?.display || 
                     null;
        const unit = observation.valueQuantity?.unit || null;

        db.prepare(`
          INSERT INTO ehr_observations 
          (id, ehr_encounter_id, type, value, unit, raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          uuidv4(),
          ehrEncounterId,
          type,
          value?.toString(),
          unit,
          JSON.stringify(observation)
        );
      }
    } catch (error) {
      console.error(`Error syncing observations for encounter ${encounterId}:`, error);
    }

    console.log(`✅ Synced encounter ${encounterId} with clinical data`);
  }

  /**
   * Manually sync a specific appointment
   * @param {string} appointmentId - Appointment ID
   */
  async syncAppointment(appointmentId) {
    try {
      const appointment = db.prepare(`
        SELECT * FROM appointments WHERE id = ?
      `).get(appointmentId);

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Find active EHR connection for this provider/patient
      const connection = db.prepare(`
        SELECT * FROM ehr_connections 
        WHERE provider_id = ? 
          AND access_token IS NOT NULL
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        LIMIT 1
      `).get(appointment.provider || 'default');

      if (!connection) {
        throw new Error('No active EHR connection found');
      }

      // Sync encounters for appointment date
      return await this.syncConnection(connection.id, appointment.date);
    } catch (error) {
      console.error(`Error syncing appointment ${appointmentId}:`, error);
      throw error;
    }
  }
}

module.exports = new EHRSyncService();


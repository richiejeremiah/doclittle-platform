/**
 * EHR Aggregator Service - 1upHealth Integration
 * 
 * Provides unified access to multiple EHRs (Epic, Cerner, Athena, etc.)
 * through 1upHealth's FHIR aggregator API.
 * 
 * Why 1upHealth:
 * - Single API for 50+ EHRs (Epic, Cerner, Athena, Allscripts, DrChrono, etc.)
 * - Free developer tier
 * - Handles OAuth automatically
 * - FHIR R4 compliant
 * - No per-EHR integration needed
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

class EHRAggregatorService {
  constructor() {
    // 1upHealth API configuration
    this.baseUrl = process.env.UPHEALTH_API_URL || 'https://api.1up.health';
    this.clientId = process.env.UPHEALTH_CLIENT_ID;
    this.clientSecret = process.env.UPHEALTH_CLIENT_SECRET;
    this.redirectUri = process.env.UPHEALTH_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:4000'}/api/ehr/oauth/callback`;
  }

  /**
   * Generate OAuth authorization URL for connecting to EHR
   * @param {string} ehrName - EHR name (epic, cerner, athena, etc.)
   * @param {string} providerId - Internal provider ID
   * @returns {Object} Authorization URL and state token
   */
  generateAuthUrl(ehrName, providerId) {
    if (!this.clientId) {
      throw new Error('1upHealth Client ID not configured. Set UPHEALTH_CLIENT_ID in .env');
    }

    const state = uuidv4();
    const authUrl = `${this.baseUrl}/connect/system/clinical?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;

    // Store state for verification
    db.prepare(`
      INSERT OR REPLACE INTO ehr_connections 
      (id, provider_id, ehr_name, state_token, auth_url, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), providerId, ehrName, state, authUrl);

    return {
      auth_url: authUrl,
      state: state
    };
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @param {string} state - State token for verification
   * @returns {Object} Access token and connection info
   */
  async exchangeCodeForToken(code, state) {
    try {
      // Verify state
      const connection = db.prepare(`
        SELECT * FROM ehr_connections WHERE state_token = ?
      `).get(state);

      if (!connection) {
        throw new Error('Invalid state token');
      }

      // Exchange code for token via 1upHealth
      const tokenResponse = await axios.post(`${this.baseUrl}/oauth2/token`, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code'
      });

      const { access_token, refresh_token, expires_in, patient } = tokenResponse.data;

      // Store tokens
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      db.prepare(`
        UPDATE ehr_connections 
        SET access_token = ?,
            refresh_token = ?,
            expires_at = ?,
            patient_id = ?,
            connected_at = datetime('now'),
            updated_at = datetime('now')
        WHERE state_token = ?
      `).run(access_token, refresh_token, expiresAt.toISOString(), patient, state);

      return {
        success: true,
        connection_id: connection.id,
        patient_id: patient
      };
    } catch (error) {
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      throw new Error(`Failed to connect to EHR: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Refresh access token if expired
   * @param {string} connectionId - Connection ID
   * @returns {Object} New access token
   */
  async refreshToken(connectionId) {
    try {
      const connection = db.prepare(`
        SELECT * FROM ehr_connections WHERE id = ?
      `).get(connectionId);

      if (!connection || !connection.refresh_token) {
        throw new Error('Connection not found or no refresh token');
      }

      const tokenResponse = await axios.post(`${this.baseUrl}/oauth2/token`, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: 'refresh_token'
      });

      const { access_token, expires_in } = tokenResponse.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      db.prepare(`
        UPDATE ehr_connections 
        SET access_token = ?,
            expires_at = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(access_token, expiresAt.toISOString(), connectionId);

      return { access_token, expires_at: expiresAt };
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   * @param {string} connectionId - Connection ID
   * @returns {string} Valid access token
   */
  async getValidToken(connectionId) {
    const connection = db.prepare(`
      SELECT * FROM ehr_connections WHERE id = ?
    `).get(connectionId);

    if (!connection) {
      throw new Error('EHR connection not found');
    }

    // Check if token is expired
    if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
      const refreshed = await this.refreshToken(connectionId);
      return refreshed.access_token;
    }

    return connection.access_token;
  }

  /**
   * Fetch encounters from EHR
   * @param {string} connectionId - Connection ID
   * @param {string} date - Date to fetch (YYYY-MM-DD)
   * @returns {Array} FHIR Encounter resources
   */
  async fetchEncounters(connectionId, date = null) {
    try {
      const token = await this.getValidToken(connectionId);
      
      let url = `${this.baseUrl}/fhir/dstu2/Encounter`;
      if (date) {
        url += `?date=${date}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching encounters:', error.response?.data || error.message);
      throw new Error(`Failed to fetch encounters: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Fetch conditions (diagnoses/ICD-10 codes) for an encounter
   * @param {string} connectionId - Connection ID
   * @param {string} encounterId - FHIR Encounter ID
   * @returns {Array} FHIR Condition resources
   */
  async fetchConditions(connectionId, encounterId) {
    try {
      const token = await this.getValidToken(connectionId);
      
      const response = await axios.get(
        `${this.baseUrl}/fhir/dstu2/Condition?encounter=${encounterId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching conditions:', error.response?.data || error.message);
      return []; // Return empty array on error (conditions may not always be available)
    }
  }

  /**
   * Fetch procedures (CPT codes) for an encounter
   * @param {string} connectionId - Connection ID
   * @param {string} encounterId - FHIR Encounter ID
   * @returns {Array} FHIR Procedure resources
   */
  async fetchProcedures(connectionId, encounterId) {
    try {
      const token = await this.getValidToken(connectionId);
      
      const response = await axios.get(
        `${this.baseUrl}/fhir/dstu2/Procedure?encounter=${encounterId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching procedures:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch observations (vitals, notes) for an encounter
   * @param {string} connectionId - Connection ID
   * @param {string} encounterId - FHIR Encounter ID
   * @returns {Array} FHIR Observation resources
   */
  async fetchObservations(connectionId, encounterId) {
    try {
      const token = await this.getValidToken(connectionId);
      
      const response = await axios.get(
        `${this.baseUrl}/fhir/dstu2/Observation?encounter=${encounterId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching observations:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch practitioner (provider) information
   * @param {string} connectionId - Connection ID
   * @param {string} practitionerId - FHIR Practitioner ID
   * @returns {Object} FHIR Practitioner resource
   */
  async fetchPractitioner(connectionId, practitionerId) {
    try {
      const token = await this.getValidToken(connectionId);
      
      const response = await axios.get(
        `${this.baseUrl}/fhir/dstu2/Practitioner/${practitionerId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching practitioner:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Extract ICD-10 codes from Condition resources
   * @param {Array} conditions - FHIR Condition resources
   * @returns {Array} Extracted ICD-10 codes with descriptions
   */
  extractICDCodes(conditions) {
    const codes = [];
    
    conditions.forEach(entry => {
      const condition = entry.resource;
      if (condition.code && condition.code.coding) {
        condition.code.coding.forEach(coding => {
          if (coding.system === 'http://hl7.org/fhir/sid/icd-10' || 
              coding.system === 'http://hl7.org/fhir/sid/icd-10-cm' ||
              coding.code?.match(/^[A-Z][0-9]{2}/)) { // ICD-10 pattern
            codes.push({
              code: coding.code,
              display: coding.display || condition.code.text,
              system: coding.system,
              primary: condition.severity?.text === 'primary' || codes.length === 0
            });
          }
        });
      }
    });

    return codes;
  }

  /**
   * Extract CPT codes from Procedure resources
   * @param {Array} procedures - FHIR Procedure resources
   * @returns {Array} Extracted CPT codes with descriptions
   */
  extractCPTCodes(procedures) {
    const codes = [];
    
    procedures.forEach(entry => {
      const procedure = entry.resource;
      if (procedure.code && procedure.code.coding) {
        procedure.code.coding.forEach(coding => {
          if (coding.system === 'http://www.ama-assn.org/go/cpt' ||
              coding.code?.match(/^[0-9]{5}/)) { // CPT pattern
            codes.push({
              code: coding.code,
              display: coding.display || procedure.code.text,
              system: coding.system,
              modifier: procedure.modifier?.map(m => m.coding?.[0]?.code).filter(Boolean).join(',') || null
            });
          }
        });
      }
    });

    return codes;
  }

  /**
   * Match EHR encounter to DocLittle appointment
   * @param {Object} encounter - FHIR Encounter resource
   * @param {string} patientPhone - Patient phone number
   * @param {string} appointmentDate - Appointment date (YYYY-MM-DD)
   * @returns {Object|null} Matched appointment or null
   */
  matchEncounterToAppointment(encounter, patientPhone, appointmentDate) {
    try {
      const encounterDate = encounter.period?.start?.split('T')[0];
      const encounterTime = encounter.period?.start?.split('T')[1]?.substring(0, 5); // HH:MM
      
      // Find appointment by phone and date/time window (±2 hours)
      const appointments = db.prepare(`
        SELECT * FROM appointments 
        WHERE patient_phone = ? 
          AND date = ?
          AND status IN ('confirmed', 'completed')
        ORDER BY time
      `).all(patientPhone, appointmentDate || encounterDate);

      if (appointments.length === 0) {
        return null;
      }

      // Try to match by time (within 2 hours)
      if (encounterTime) {
        const [encounterHour, encounterMin] = encounterTime.split(':').map(Number);
        const encounterMinutes = encounterHour * 60 + encounterMin;

        for (const apt of appointments) {
          const [aptHour, aptMin] = apt.time.split(':').map(Number);
          const aptMinutes = aptHour * 60 + aptMin;
          
          // Match if within 2 hours
          if (Math.abs(encounterMinutes - aptMinutes) <= 120) {
            return apt;
          }
        }
      }

      // Return first appointment if time matching fails
      return appointments[0];
    } catch (error) {
      console.error('Error matching encounter:', error);
      return null;
    }
  }
}

module.exports = new EHRAggregatorService();


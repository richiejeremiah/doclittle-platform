/**
 * Epic FHIR Adapter - Direct Integration
 * 
 * Direct integration with Epic FHIR API (bypassing 1upHealth)
 * Uses SMART on FHIR OAuth2 for authentication
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');

class EpicAdapter {
  constructor() {
    // Epic FHIR API configuration
    // Epic sandbox uses: https://fhir.epic.com/interconnect-fhir-oauth
    // Each Epic instance has its own base URL, but sandbox is standard
    this.sandboxBaseUrl = process.env.EPIC_SANDBOX_BASE_URL || 'https://fhir.epic.com/interconnect-fhir-oauth';
    this.productionBaseUrl = process.env.EPIC_PRODUCTION_BASE_URL || 'https://fhir.epic.com/interconnect-fhir-oauth';
    this.clientId = process.env.EPIC_CLIENT_ID; // Non-Production Client ID for sandbox: 2f2d99a7-4ac1-4a82-8559-03e1e680bf91
    this.clientSecret = process.env.EPIC_CLIENT_SECRET; // Optional for confidential clients
    this.redirectUri = process.env.EPIC_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:4000'}/api/ehr/epic/callback`;
    this.useSandbox = process.env.EPIC_USE_SANDBOX !== 'false';
  }

  /**
   * Get the appropriate base URL (sandbox or production)
   * Epic sandbox uses: https://fhir.epic.com/interconnect-fhir-oauth
   */
  getBaseUrl() {
    return this.useSandbox ? this.sandboxBaseUrl : this.productionBaseUrl;
  }

  /**
   * Get the FHIR API base URL (for resource requests)
   * Epic uses: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
   */
  getFhirBaseUrl() {
    return `${this.getBaseUrl()}/api/FHIR/R4`;
  }

  /**
   * Generate OAuth authorization URL for Epic
   * @param {string} providerId - Internal provider ID
   * @param {string} patientId - Optional patient ID for patient context
   * @returns {Object} Authorization URL and state token
   */
  generateAuthUrl(providerId, patientId = null) {
    if (!this.clientId) {
      throw new Error('Epic Client ID not configured. Set EPIC_CLIENT_ID in .env');
    }

    const state = uuidv4();
    
    // Epic SMART on FHIR authorization endpoint
    // Epic sandbox: https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize
    const authUrl = `${this.getBaseUrl()}/oauth2/authorize`;

    // Build authorization URL with required parameters
    // Epic requires specific scopes and the 'aud' parameter
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: 'patient/Encounter.read patient/Condition.read patient/Procedure.read patient/Observation.read patient/Coverage.read patient/DocumentReference.read patient/DiagnosticReport.read offline_access',
      aud: this.getBaseUrl() // Audience must match the base URL
    });

    // Add patient context if provided
    if (patientId) {
      params.append('patient', patientId);
    }

    const fullAuthUrl = `${authUrl}?${params.toString()}`;

    // Store state for verification
    db.db.prepare(`
      INSERT OR REPLACE INTO ehr_connections 
      (id, provider_id, ehr_name, state_token, auth_url, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), providerId, 'epic', state, fullAuthUrl);

    return {
      auth_url: fullAuthUrl,
      state: state,
      ehr_name: 'epic'
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
      const connection = db.db.prepare(`
        SELECT * FROM ehr_connections WHERE state_token = ? AND ehr_name = 'epic'
      `).get(state);

      if (!connection) {
        throw new Error('Invalid state token');
      }

      // Epic token endpoint
      const tokenUrl = `${this.getBaseUrl()}/oauth2/token`;

      // Prepare token request
      const tokenData = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId
      });

      // Add client secret if configured (for confidential clients)
      if (this.clientSecret) {
        tokenData.append('client_secret', this.clientSecret);
      }

      // Exchange code for token
      const tokenResponse = await axios.post(tokenUrl, tokenData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in, patient, scope } = tokenResponse.data;

      // Store tokens
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      db.db.prepare(`
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
        patient_id: patient,
        scope: scope
      };
    } catch (error) {
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      throw new Error(`Failed to connect to Epic: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token if expired
   * @param {string} connectionId - Connection ID
   * @returns {Object} New access token
   */
  async refreshToken(connectionId) {
    try {
      const connection = db.db.prepare(`
        SELECT * FROM ehr_connections WHERE id = ? AND ehr_name = 'epic'
      `).get(connectionId);

      if (!connection || !connection.refresh_token) {
        throw new Error('Connection not found or no refresh token');
      }

      const tokenUrl = `${this.getBaseUrl()}/oauth2/token`;

      const tokenData = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        client_id: this.clientId
      });

      if (this.clientSecret) {
        tokenData.append('client_secret', this.clientSecret);
      }

      const tokenResponse = await axios.post(tokenUrl, tokenData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, expires_in } = tokenResponse.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      db.db.prepare(`
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
    const connection = db.db.prepare(`
      SELECT * FROM ehr_connections WHERE id = ? AND ehr_name = 'epic'
    `).get(connectionId);

    if (!connection) {
      throw new Error('Epic connection not found');
    }

    // Check if token is expired
    if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
      const refreshed = await this.refreshToken(connectionId);
      return refreshed.access_token;
    }

    return connection.access_token;
  }

  /**
   * Fetch encounters from Epic
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID (from token or explicit)
   * @param {string} date - Date to fetch (YYYY-MM-DD)
   * @returns {Array} FHIR Encounter resources
   */
  async fetchEncounters(connectionId, patientId = null, date = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/Encounter`;
      
      // Build query parameters
      const params = [];
      if (patientId) {
        params.push(`patient=${patientId}`);
      }
      if (date) {
        params.push(`date=${date}`);
      }
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic encounters:', error.response?.data || error.message);
      throw new Error(`Failed to fetch encounters: ${error.response?.data?.issue?.[0]?.details?.text || error.message}`);
    }
  }

  /**
   * Fetch conditions (diagnoses/ICD-10 codes) for a patient
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID
   * @param {string} encounterId - Optional encounter ID
   * @returns {Array} FHIR Condition resources
   */
  async fetchConditions(connectionId, patientId, encounterId = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/Condition?patient=${patientId}`;
      if (encounterId) {
        url += `&encounter=${encounterId}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic conditions:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch procedures (CPT codes) for a patient
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID
   * @param {string} encounterId - Optional encounter ID
   * @returns {Array} FHIR Procedure resources
   */
  async fetchProcedures(connectionId, patientId, encounterId = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/Procedure?patient=${patientId}`;
      if (encounterId) {
        url += `&encounter=${encounterId}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic procedures:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch observations (vitals, notes) for a patient
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID
   * @param {string} encounterId - Optional encounter ID
   * @returns {Array} FHIR Observation resources
   */
  async fetchObservations(connectionId, patientId, encounterId = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/Observation?patient=${patientId}`;
      if (encounterId) {
        url += `&encounter=${encounterId}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic observations:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Extract ICD-10 codes from Condition resources (same as aggregator)
   */
  extractICDCodes(conditions) {
    const codes = [];
    
    conditions.forEach(entry => {
      const condition = entry.resource;
      if (condition.code && condition.code.coding) {
        condition.code.coding.forEach(coding => {
          if (coding.system === 'http://hl7.org/fhir/sid/icd-10' || 
              coding.system === 'http://hl7.org/fhir/sid/icd-10-cm' ||
              coding.code?.match(/^[A-Z][0-9]{2}/)) {
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
   * Extract CPT codes from Procedure resources (same as aggregator)
   */
  extractCPTCodes(procedures) {
    const codes = [];
    
    procedures.forEach(entry => {
      const procedure = entry.resource;
      if (procedure.code && procedure.code.coding) {
        procedure.code.coding.forEach(coding => {
          if (coding.system === 'http://www.ama-assn.org/go/cpt' ||
              coding.code?.match(/^[0-9]{5}/)) {
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
   * Fetch DocumentReference resources (clinical documents/notes)
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID
   * @param {string} encounterId - Optional encounter ID
   * @returns {Array} FHIR DocumentReference resources
   */
  async fetchDocumentReferences(connectionId, patientId, encounterId = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/DocumentReference?patient=${patientId}`;
      if (encounterId) {
        url += `&encounter=${encounterId}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic DocumentReferences:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Fetch DiagnosticReport resources (may contain clinical notes)
   * @param {string} connectionId - Connection ID
   * @param {string} patientId - Patient ID
   * @param {string} encounterId - Optional encounter ID
   * @returns {Array} FHIR DiagnosticReport resources
   */
  async fetchDiagnosticReports(connectionId, patientId, encounterId = null) {
    try {
      const token = await this.getValidToken(connectionId);
      const fhirBaseUrl = this.getFhirBaseUrl();
      
      let url = `${fhirBaseUrl}/DiagnosticReport?patient=${patientId}`;
      if (encounterId) {
        url += `&encounter=${encounterId}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      return response.data.entry || [];
    } catch (error) {
      console.error('Error fetching Epic DiagnosticReports:', error.response?.data || error.message);
      return []; // Return empty array on error
    }
  }

  /**
   * Extract clinical notes from Epic FHIR resources
   * Tries multiple sources: Encounter, Observations, DocumentReference, DiagnosticReport
   * @param {Object} encounter - FHIR Encounter resource
   * @param {Array} observations - Array of Observation resources
   * @param {Array} documentReferences - Array of DocumentReference resources
   * @param {Array} diagnosticReports - Array of DiagnosticReport resources
   * @returns {string} Clinical note text
   */
  extractClinicalNote(encounter, observations = [], documentReferences = [], diagnosticReports = []) {
    const noteParts = [];
    
    // 1. Try to extract from encounter text
    if (encounter?.text?.div) {
      // Remove HTML tags if present
      const text = encounter.text.div.replace(/<[^>]*>/g, ' ').trim();
      if (text) {
        noteParts.push(text);
      }
    }
    
    // 2. Try to extract from encounter reason
    if (encounter?.reasonCode && encounter.reasonCode.length > 0) {
      const reasons = encounter.reasonCode
        .map(r => r.text || r.coding?.[0]?.display)
        .filter(Boolean);
      if (reasons.length > 0) {
        noteParts.push(`Reason for visit: ${reasons.join(', ')}`);
      }
    }
    
    // 3. Try to extract from observations
    observations.forEach(entry => {
      const obs = entry.resource || entry;
      
      // Check for note field in observation
      if (obs.note && Array.isArray(obs.note)) {
        obs.note.forEach(note => {
          if (note.text) {
            noteParts.push(note.text);
          }
        });
      }
      
      // Check for valueString (may contain notes)
      if (obs.valueString && typeof obs.valueString === 'string' && obs.valueString.length > 20) {
        noteParts.push(obs.valueString);
      }
      
      // Check for text field
      if (obs.text?.div) {
        const text = obs.text.div.replace(/<[^>]*>/g, ' ').trim();
        if (text) {
          noteParts.push(text);
        }
      }
      
      // Check for interpretation (may contain clinical notes)
      if (obs.interpretation && Array.isArray(obs.interpretation)) {
        const interpretations = obs.interpretation
          .map(i => i.text || i.coding?.[0]?.display)
          .filter(Boolean);
        if (interpretations.length > 0) {
          noteParts.push(interpretations.join(', '));
        }
      }
    });
    
    // 4. Try to extract from DocumentReference
    documentReferences.forEach(entry => {
      const doc = entry.resource || entry;
      
      if (doc.description) {
        noteParts.push(doc.description);
      }
      
      // Check for content (may contain note text)
      if (doc.content && Array.isArray(doc.content)) {
        doc.content.forEach(content => {
          if (content.attachment?.title) {
            noteParts.push(content.attachment.title);
          }
          // Note: Actual document content may require separate fetch
        });
      }
    });
    
    // 5. Try to extract from DiagnosticReport
    diagnosticReports.forEach(entry => {
      const report = entry.resource || entry;
      
      // Conclusion often contains clinical notes
      if (report.conclusion) {
        noteParts.push(report.conclusion);
      }
      
      // Conclusion codes with text
      if (report.conclusionCode && Array.isArray(report.conclusionCode)) {
        const conclusions = report.conclusionCode
          .map(c => c.text || c.coding?.[0]?.display)
          .filter(Boolean);
        if (conclusions.length > 0) {
          noteParts.push(conclusions.join(', '));
        }
      }
      
      // Text field
      if (report.text?.div) {
        const text = report.text.div.replace(/<[^>]*>/g, ' ').trim();
        if (text) {
          noteParts.push(text);
        }
      }
    });
    
    // Combine all parts
    const clinicalNote = noteParts
      .filter(part => part && part.trim().length > 0)
      .join('\n\n')
      .trim();
    
    return clinicalNote;
  }
}

module.exports = new EpicAdapter();


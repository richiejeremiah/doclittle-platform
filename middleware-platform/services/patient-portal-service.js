/**
 * Patient Portal Service
 * 
 * Handles patient self-service functionality:
 * - Phone verification for login
 * - Session management
 * - Patient appointment management
 */

const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const SMSService = require('./sms-service');

class PatientPortalService {
  /**
   * Send verification code to patient phone
   * @param {string} phone - Patient phone number
   * @returns {Object} Session ID and success status
   */
  sendVerificationCode(phone) {
    if (!phone) {
      return { success: false, error: 'Phone number required' };
    }

    // Normalize phone number
    const normalizedPhone = SMSService.formatPhoneNumber(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Create or update session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Check if session exists for this phone
      const existing = db.prepare(`
        SELECT id FROM patient_portal_sessions 
        WHERE phone = ? AND verified = 0 AND datetime(expires_at) > datetime('now')
      `).get(normalizedPhone);

      if (existing) {
        // Update existing session
        db.prepare(`
          UPDATE patient_portal_sessions 
          SET verification_code = ?, expires_at = ?, created_at = datetime('now')
          WHERE id = ?
        `).run(verificationCode, expiresAt.toISOString(), existing.id);
        
        // Send SMS
        this._sendSMS(normalizedPhone, verificationCode);
        
        return {
          success: true,
          session_id: existing.id,
          message: 'Verification code sent'
        };
      } else {
        // Create new session
        db.prepare(`
          INSERT INTO patient_portal_sessions 
          (id, phone, verification_code, expires_at, verified)
          VALUES (?, ?, ?, ?, 0)
        `).run(sessionId, normalizedPhone, verificationCode, expiresAt.toISOString());
        
        // Send SMS
        this._sendSMS(normalizedPhone, verificationCode);
        
        return {
          success: true,
          session_id: sessionId,
          message: 'Verification code sent'
        };
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify code and create authenticated session
   * @param {string} phone - Patient phone number
   * @param {string} code - Verification code
   * @returns {Object} Session info and patient data
   */
  verifyCode(phone, code) {
    if (!phone || !code) {
      return { success: false, error: 'Phone and code required' };
    }

    const normalizedPhone = SMSService.formatPhoneNumber(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number format' };
    }

    try {
      // Find valid session
      const session = db.prepare(`
        SELECT * FROM patient_portal_sessions 
        WHERE phone = ? 
          AND verification_code = ? 
          AND verified = 0 
          AND datetime(expires_at) > datetime('now')
      `).get(normalizedPhone, code);

      if (!session) {
        return { success: false, error: 'Invalid or expired verification code' };
      }

      // Mark session as verified
      db.prepare(`
        UPDATE patient_portal_sessions 
        SET verified = 1, verified_at = datetime('now')
        WHERE id = ?
      `).run(session.id);

      // Find patient by phone
      const patient = db.getFHIRPatientByPhone(normalizedPhone);
      
      return {
        success: true,
        session_id: session.id,
        patient_id: patient ? patient.resource_id : null,
        phone: normalizedPhone
      };
    } catch (error) {
      console.error('Error verifying code:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get patient appointments
   * @param {string} sessionId - Valid session ID
   * @returns {Array} Patient appointments
   */
  getPatientAppointments(sessionId) {
    try {
      const session = db.prepare(`
        SELECT * FROM patient_portal_sessions 
        WHERE id = ? AND verified = 1
      `).get(sessionId);

      if (!session) {
        return { success: false, error: 'Invalid or expired session' };
      }

      // Get appointments by phone
      const appointments = db.prepare(`
        SELECT * FROM appointments 
        WHERE patient_phone = ? 
        ORDER BY date DESC, time DESC
        LIMIT 50
      `).all(session.phone);

      return {
        success: true,
        appointments: appointments.map(apt => ({
          id: apt.id,
          patient_name: apt.patient_name,
          appointment_type: apt.appointment_type,
          date: apt.date,
          time: apt.time,
          status: apt.status,
          datetime_display: this._formatDateTime(apt.date, apt.time),
          can_reschedule: ['scheduled', 'confirmed'].includes(apt.status),
          can_cancel: ['scheduled', 'confirmed'].includes(apt.status)
        }))
      };
    } catch (error) {
      console.error('Error getting patient appointments:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate session
   * @param {string} sessionId - Session ID
   * @returns {Object} Session validity and patient info
   */
  validateSession(sessionId) {
    try {
      const session = db.prepare(`
        SELECT * FROM patient_portal_sessions 
        WHERE id = ? AND verified = 1
      `).get(sessionId);

      if (!session) {
        return { success: false, valid: false, error: 'Invalid session' };
      }

      // Check if session is still valid (24 hours)
      const sessionAge = new Date() - new Date(session.verified_at);
      if (sessionAge > 24 * 60 * 60 * 1000) {
        return { success: false, valid: false, error: 'Session expired' };
      }

      return {
        success: true,
        valid: true,
        phone: session.phone,
        patient_id: session.patient_id
      };
    } catch (error) {
      return { success: false, valid: false, error: error.message };
    }
  }

  /**
   * Get patient profile
   * @param {string} sessionId - Valid session ID
   * @returns {Object} Patient profile data
   */
  getPatientProfile(sessionId) {
    try {
      const session = this.validateSession(sessionId);
      if (!session.valid) {
        return { success: false, error: 'Invalid session' };
      }

      // Get patient from FHIR
      const patient = db.getFHIRPatientByPhone(session.phone);
      if (!patient) {
        return { success: false, error: 'Patient not found' };
      }

      const patientData = JSON.parse(patient.resource_data);
      const nameObj = (patientData.name && patientData.name[0]) || {};
      const telecom = patientData.telecom || [];
      const phone = (telecom.find(t => t.system === 'phone') || {}).value || '';
      const email = (telecom.find(t => t.system === 'email') || {}).value || '';
      const addr = (patientData.address && patientData.address[0]) || {};

      return {
        success: true,
        profile: {
          name: `${(nameObj.given || [''])[0]} ${nameObj.family || ''}`.trim(),
          phone: phone,
          email: email,
          birth_date: patientData.birthDate || null,
          address: {
            line: addr.line && addr.line[0] || '',
            city: addr.city || '',
            state: addr.state || '',
            postal_code: addr.postalCode || ''
          }
        }
      };
    } catch (error) {
      console.error('Error getting patient profile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS with verification code
   * @private
   */
  _sendSMS(phone, code) {
    try {
      const message = `Your DocLittle verification code is: ${code}. Valid for 10 minutes.`;
      SMSService.sendSMS(phone, message);
      console.log(`📱 Verification code sent to ${phone}: ${code}`);
    } catch (error) {
      console.warn('⚠️  Could not send SMS, code is:', code);
    }
  }

  /**
   * Format date and time for display
   * @private
   */
  _formatDateTime(date, time) {
    try {
      const dateObj = new Date(`${date}T${time}`);
      return dateObj.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return `${date} at ${time}`;
    }
  }
}

module.exports = new PatientPortalService();


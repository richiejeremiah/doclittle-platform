/**
 * Booking Service - DocLittle Mental Health Telehealth Platform
 *
 * Handles appointment scheduling, confirmation, and cancellation
 * Integrates with Google Calendar API for calendar management
 */

const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const EmailService = require('./email-service');
const FHIRService = require('./fhir-service');
const EmailService = require('./email-service');

/**
 * Appointment Type Configuration
 * Defines different appointment types with their durations and buffer times
 */
const APPOINTMENT_TYPES = {
  'Mental Health Consultation': {
    duration_minutes: 50,
    buffer_before_minutes: 10,  // 10 min buffer before appointment
    buffer_after_minutes: 10,    // 10 min buffer after appointment
    color: 'blue'
  },
  'Crisis Intervention': {
    duration_minutes: 30,
    buffer_before_minutes: 5,   // Shorter buffer for urgent cases
    buffer_after_minutes: 15,   // Longer buffer after to allow recovery
    color: 'red'
  },
  'Follow-up Session': {
    duration_minutes: 30,
    buffer_before_minutes: 10,
    buffer_after_minutes: 10,
    color: 'green'
  },
  'Initial Assessment': {
    duration_minutes: 60,
    buffer_before_minutes: 10,
    buffer_after_minutes: 10,
    color: 'purple'
  },
  'Group Therapy': {
    duration_minutes: 90,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    color: 'orange'
  },
  'Medication Review': {
    duration_minutes: 20,
    buffer_before_minutes: 5,
    buffer_after_minutes: 5,
    color: 'yellow'
  }
};

/**
 * Business Hours Configuration
 */
const BUSINESS_HOURS = {
  start: 9,   // 9 AM
  end: 17,    // 5 PM (17:00)
  timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York',
  slot_interval_minutes: 15  // Minimum slot interval (15 minutes)
};

class BookingService {
  /**
   * Initialize Google Calendar client
   * Uses service account or OAuth2 credentials
   */
  static getCalendarClient() {
    try {
      // Option 1: Service Account (Recommended for server-to-server)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        return google.calendar({ version: 'v3', auth });
      }

      // Option 2: OAuth2 (for user-specific calendars)
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/oauth2callback'
        );

        oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        return google.calendar({ version: 'v3', auth: oauth2Client });
      }

      console.warn('⚠️  Google Calendar credentials not configured. Running in mock mode.');
      return null;

    } catch (error) {
      console.error('❌ Error initializing Google Calendar:', error);
      return null;
    }
  }

  /**
   * Schedule a new appointment
   * @param {Object} appointmentData - Appointment details
   * @returns {Object} - Created appointment with calendar event ID
   */
  static async scheduleAppointment(appointmentData) {
    console.log('\n📅 BOOKING SERVICE: Schedule Appointment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Validate required fields
      const validation = this._validateAppointmentData(appointmentData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Get appointment type configuration
      const appointmentType = appointmentData.appointment_type || 'Mental Health Consultation';
      const typeConfig = APPOINTMENT_TYPES[appointmentType] || APPOINTMENT_TYPES['Mental Health Consultation'];
      
      // Parse date/time with timezone awareness
      const appointmentDateTime = this._parseDateTime(
        appointmentData.date,
        appointmentData.time,
        appointmentData.timezone || BUSINESS_HOURS.timezone,
        typeConfig.duration_minutes
      );

      // Check if slot is available (with buffer times)
      const availabilityCheck = await this._checkSlotAvailability(
        appointmentDateTime.startISO,
        appointmentDateTime.endISO,
        typeConfig,
        appointmentDateTime.date,
        null // No appointment to exclude for new bookings
      );

      if (!availabilityCheck.available) {
        throw new Error(`Slot not available: ${availabilityCheck.reason}`);
      }

      // Create appointment ID
      const appointmentId = `appt-${uuidv4()}`;

      // Calculate total time including buffers
      const totalDurationMinutes = typeConfig.duration_minutes + 
                                   typeConfig.buffer_before_minutes + 
                                   typeConfig.buffer_after_minutes;

      // Upsert FHIR patient record to ensure a longitudinal EHR
      let fhirPatientId = null;
      try {
        const fhirPatient = await FHIRService.getOrCreatePatient({
          name: appointmentData.patient_name,
          phone: appointmentData.patient_phone,
          email: appointmentData.patient_email,
          timezone: appointmentData.timezone || BUSINESS_HOURS.timezone
        });
        fhirPatientId = fhirPatient && fhirPatient.id;
      } catch(e) {
        console.warn('⚠️  FHIR patient upsert failed:', e.message);
      }

      // Prepare appointment record
      const appointment = {
        id: appointmentId,
        patient_name: appointmentData.patient_name,
        patient_phone: appointmentData.patient_phone,
        patient_email: appointmentData.patient_email,
        patient_id: fhirPatientId || null,
        appointment_type: appointmentType,
        date: appointmentDateTime.date,
        time: appointmentDateTime.time,
        start_time: appointmentDateTime.startISO,
        end_time: appointmentDateTime.endISO,
        duration_minutes: typeConfig.duration_minutes,
        buffer_before_minutes: typeConfig.buffer_before_minutes,
        buffer_after_minutes: typeConfig.buffer_after_minutes,
        provider: appointmentData.provider || 'DocLittle Mental Health Team',
        status: 'scheduled',
        notes: appointmentData.notes || '',
        reminder_sent: false,
        calendar_event_id: null,
        timezone: appointmentData.timezone || BUSINESS_HOURS.timezone,
        created_at: new Date().toISOString()
      };

      console.log('📋 Appointment Details:', {
        id: appointment.id,
        patient: appointment.patient_name,
        type: appointment.appointment_type,
        datetime: appointmentDateTime.displayTime
      });

      // Try to create Google Calendar event
      const calendar = this.getCalendarClient();
      if (calendar) {
        try {
          const event = await this._createCalendarEvent(calendar, appointment, appointmentData);
          appointment.calendar_event_id = event.id;
          appointment.calendar_link = event.htmlLink;
          console.log('✅ Google Calendar event created:', event.id);
        } catch (calendarError) {
          console.warn('⚠️  Calendar event creation failed:', calendarError.message);
          // Continue without calendar event
        }
      } else {
        console.log('ℹ️  Running in mock mode - no calendar event created');
      }

      // Save to database
      db.createAppointment(appointment);
      console.log('✅ Appointment saved to database');

      // Send confirmation email if email provided
      if (appointment.patient_email) {
        try {
          await EmailService.sendAppointmentConfirmation(appointment);
          console.log('✅ Confirmation email sent');
        } catch (emailError) {
          console.warn('⚠️  Email confirmation failed:', emailError.message);
          // Continue even if email fails
        }
      } else {
        console.log('⚠️  No email provided - skipping confirmation email');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        appointment: {
          id: appointment.id,
          confirmation_number: appointment.id.substring(5, 13).toUpperCase(),
          patient_name: appointment.patient_name,
          appointment_type: appointment.appointment_type,
          datetime: appointmentDateTime.displayTime,
          date: appointment.date,
          time: appointment.time,
          provider: appointment.provider,
          duration_minutes: appointment.duration_minutes,
          status: appointment.status,
          calendar_link: appointment.calendar_link,
          calendar_event_id: appointment.calendar_event_id,
          instructions: 'You will receive a reminder 24 hours before your appointment.'
        }
      };

    } catch (error) {
      console.error('❌ Error scheduling appointment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Confirm an existing appointment
   * @param {String} appointmentId - Appointment ID or confirmation number
   * @returns {Object} - Confirmation result
   */
  static async confirmAppointment(appointmentId) {
    console.log('\n✅ BOOKING SERVICE: Confirm Appointment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Find appointment
      const appointment = db.getAppointment(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log('📋 Found appointment:', appointment.id);

      // Check if already confirmed
      if (appointment.status === 'confirmed') {
        return {
          success: true,
          message: 'Appointment was already confirmed',
          appointment: this._formatAppointment(appointment)
        };
      }

      // Update status
      db.updateAppointmentStatus(appointmentId, 'confirmed');
      console.log('✅ Appointment confirmed');

      const updatedAppointment = db.getAppointment(appointmentId);

      // Send confirmation email if email provided
      if (updatedAppointment.patient_email) {
        try {
          await EmailService.sendAppointmentConfirmation(updatedAppointment);
          console.log('✅ Confirmation email sent');
        } catch (emailError) {
          console.warn('⚠️  Email confirmation failed:', emailError.message);
        }
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        message: 'Appointment confirmed successfully',
        appointment: this._formatAppointment(updatedAppointment)
      };

    } catch (error) {
      console.error('❌ Error confirming appointment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reschedule an existing appointment
   * @param {String} appointmentId - Appointment ID or confirmation number
   * @param {String} newDate - New date in YYYY-MM-DD format
   * @param {String} newTime - New time (HH:MM or "2:00 PM")
   * @param {String} reason - Reschedule reason (optional)
   * @param {String} timezone - Timezone (optional)
   * @returns {Object} - Reschedule result
   */
  static async rescheduleAppointment(appointmentId, newDate, newTime, reason = null, timezone = null) {
    console.log('\n🔄 BOOKING SERVICE: Reschedule Appointment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Find appointment
      const appointment = db.getAppointment(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log('📋 Found appointment:', appointment.id);
      console.log(`   Current: ${appointment.date} at ${appointment.time}`);
      console.log(`   New: ${newDate} at ${newTime}`);

      // Check if already cancelled
      if (appointment.status === 'cancelled') {
        throw new Error('Cannot reschedule a cancelled appointment');
      }

      // Get appointment type configuration
      const appointmentType = appointment.appointment_type || 'Mental Health Consultation';
      const typeConfig = APPOINTMENT_TYPES[appointmentType] || APPOINTMENT_TYPES['Mental Health Consultation'];

      // Parse new date/time
      const appointmentDateTime = this._parseDateTime(
        newDate,
        newTime,
        timezone || appointment.timezone || BUSINESS_HOURS.timezone,
        typeConfig.duration_minutes
      );

      // Check if new slot is available
      const availabilityCheck = await this._checkSlotAvailability(
        appointmentDateTime.startISO,
        appointmentDateTime.endISO,
        typeConfig,
        appointmentDateTime.date,
        appointment.id // Exclude current appointment from conflict check
      );

      if (!availabilityCheck.available) {
        throw new Error(`New slot not available: ${availabilityCheck.reason}`);
      }

      // Update Google Calendar event if it exists
      if (appointment.calendar_event_id) {
        const calendar = this.getCalendarClient();
        if (calendar) {
          try {
            const updatedEvent = {
              summary: `${appointment.appointment_type}: ${appointment.patient_name}`,
              description: `
Mental Health Appointment

Patient: ${appointment.patient_name}
Phone: ${appointment.patient_phone || 'N/A'}
Email: ${appointment.patient_email || 'N/A'}
Type: ${appointment.appointment_type}
Provider: ${appointment.provider}

Notes: ${appointment.notes || 'None'}

Appointment ID: ${appointment.id}
Rescheduled from: ${appointment.date} at ${appointment.time}
              `.trim(),
              start: {
                dateTime: appointmentDateTime.startISO,
                timeZone: timezone || appointment.timezone || BUSINESS_HOURS.timezone
              },
              end: {
                dateTime: appointmentDateTime.endISO,
                timeZone: timezone || appointment.timezone || BUSINESS_HOURS.timezone
              },
              reminders: {
                useDefault: false,
                overrides: [
                  { method: 'email', minutes: 24 * 60 },
                  { method: 'popup', minutes: 60 }
                ]
              }
            };

            await calendar.events.update({
              calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
              eventId: appointment.calendar_event_id,
              resource: updatedEvent
            });
            console.log('✅ Google Calendar event updated');
          } catch (calendarError) {
            console.warn('⚠️  Calendar event update failed:', calendarError.message);
            // Continue with database update even if calendar fails
          }
        }
      }

      // Update appointment in database
      const updateData = {
        date: appointmentDateTime.date,
        time: appointmentDateTime.time,
        start_time: appointmentDateTime.startISO,
        end_time: appointmentDateTime.endISO,
        timezone: timezone || appointment.timezone || BUSINESS_HOURS.timezone
      };

      // Update database
      db.updateAppointment(appointmentId, updateData);

      // Add reschedule note
      let notes = appointment.notes || '';
      const rescheduleNote = `Rescheduled from ${appointment.date} at ${appointment.time}. Reason: ${reason || 'Not specified'}`;
      notes = notes ? `${notes}\n${rescheduleNote}` : rescheduleNote;
      db.updateAppointment(appointmentId, { notes });

      const updatedAppointment = db.getAppointment(appointmentId);

      console.log('✅ Appointment rescheduled successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        message: 'Appointment rescheduled successfully',
        appointment: this._formatAppointment(updatedAppointment),
        previous_datetime: `${appointment.date} at ${appointment.time}`,
        new_datetime: appointmentDateTime.displayTime,
        reschedule_reason: reason
      };

    } catch (error) {
      console.error('❌ Error rescheduling appointment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancel an appointment
   * @param {String} appointmentId - Appointment ID or confirmation number
   * @param {String} reason - Cancellation reason (optional)
   * @returns {Object} - Cancellation result
   */
  static async cancelAppointment(appointmentId, reason = null) {
    console.log('\n❌ BOOKING SERVICE: Cancel Appointment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Find appointment
      const appointment = db.getAppointment(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log('📋 Found appointment:', appointment.id);

      // Check if already cancelled
      if (appointment.status === 'cancelled') {
        return {
          success: true,
          message: 'Appointment was already cancelled',
          appointment: this._formatAppointment(appointment)
        };
      }

      // Delete from Google Calendar if event exists
      if (appointment.calendar_event_id) {
        const calendar = this.getCalendarClient();
        if (calendar) {
          try {
            await calendar.events.delete({
              calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
              eventId: appointment.calendar_event_id
            });
            console.log('✅ Calendar event deleted');
          } catch (calendarError) {
            console.warn('⚠️  Calendar event deletion failed:', calendarError.message);
          }
        }
      }

      // Update status
      db.updateAppointmentStatus(appointmentId, 'cancelled', reason);
      console.log('✅ Appointment cancelled');

      const updatedAppointment = db.getAppointment(appointmentId);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        message: 'Appointment cancelled successfully',
        appointment: this._formatAppointment(updatedAppointment),
        cancellation_reason: reason
      };

    } catch (error) {
      console.error('❌ Error cancelling appointment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available time slots for a specific date
   * @param {String} date - Date in YYYY-MM-DD format
   * @param {String} provider - Provider name (optional)
   * @param {String} appointmentType - Type of appointment (optional, filters by duration)
   * @param {String} timezone - Timezone for the date (optional)
   * @returns {Object} - Available slots
   */
  static async getAvailableSlots(date, provider = null, appointmentType = null, timezone = null) {
    console.log('\n🕐 BOOKING SERVICE: Get Available Slots');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Parse date with timezone
      const requestedTimezone = timezone || BUSINESS_HOURS.timezone;
      const requestedDate = this._parseDateWithTimezone(date, requestedTimezone);
      
      if (isNaN(requestedDate)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      console.log('📅 Checking availability for:', date, `(${requestedTimezone})`);
      if (appointmentType) {
        console.log('📋 Appointment type:', appointmentType);
      }

      // Get existing appointments for that date
      const existingAppointments = db.getAppointmentsByDate(date);
      console.log('📋 Found', existingAppointments.length, 'existing appointments');

      // Get appointment type config if specified
      const typeConfig = appointmentType && APPOINTMENT_TYPES[appointmentType] 
        ? APPOINTMENT_TYPES[appointmentType]
        : APPOINTMENT_TYPES['Mental Health Consultation'];

      // Generate all possible slots (15-minute intervals)
      const allSlots = this._generateTimeSlotsAdvanced(
        BUSINESS_HOURS,
        typeConfig.duration_minutes,
        typeConfig.buffer_before_minutes,
        typeConfig.buffer_after_minutes
      );

      // Check each slot for conflicts
      const availableSlots = [];
      const bookedSlots = [];

      for (const slotTime of allSlots) {
        const slotStart = this._timeToDate(date, slotTime, requestedTimezone);
        const slotEnd = new Date(slotStart.getTime() + 
          (typeConfig.duration_minutes + typeConfig.buffer_before_minutes + typeConfig.buffer_after_minutes) * 60 * 1000);

        // Check for conflicts with existing appointments
        const hasConflict = this._hasTimeConflict(
          slotStart,
          slotEnd,
          existingAppointments,
          typeConfig
        );

        if (!hasConflict) {
          availableSlots.push(slotTime);
        } else {
          bookedSlots.push(slotTime);
        }
      }

      console.log('✅ Available slots:', availableSlots.length);
      console.log('📊 Booked slots:', bookedSlots.length);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        date: date,
        timezone: requestedTimezone,
        appointment_type: appointmentType || 'Mental Health Consultation',
        available_slots: availableSlots,
        total_slots: allSlots.length,
        booked_slots: bookedSlots.length,
        slot_duration_minutes: typeConfig.duration_minutes,
        buffer_before_minutes: typeConfig.buffer_before_minutes,
        buffer_after_minutes: typeConfig.buffer_after_minutes
      };

    } catch (error) {
      console.error('❌ Error getting available slots:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Search for appointments by patient phone or email
   * @param {String} searchTerm - Phone number or email
   * @returns {Object} - Found appointments
   */
  static async searchAppointments(searchTerm) {
    try {
      const appointments = db.searchAppointments(searchTerm);

      return {
        success: true,
        appointments: appointments.map(appt => this._formatAppointment(appt)),
        count: appointments.length
      };

    } catch (error) {
      console.error('❌ Error searching appointments:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  static _validateAppointmentData(data) {
    const errors = [];

    if (!data.patient_name) errors.push('Patient name is required');
    if (!data.patient_phone && !data.patient_email) {
      errors.push('Patient phone or email is required');
    }
    if (!data.date) errors.push('Appointment date is required');
    if (!data.time) errors.push('Appointment time is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static _parseDateTime(date, time, timezone = BUSINESS_HOURS.timezone, durationMinutes = 50) {
    // Parse date (YYYY-MM-DD)
    const [year, month, day] = date.split('-').map(Number);

    // Parse time (e.g., "2:00 PM", "14:00", "2pm")
    const timeLower = time.toLowerCase().trim();
    let hours, minutes = 0;

    if (timeLower.includes('pm') || timeLower.includes('am')) {
      // 12-hour format
      const [timeStr, period] = timeLower.split(/\s*(am|pm)\s*/);
      [hours, minutes = 0] = timeStr.split(':').map(Number);

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
    } else {
      // 24-hour format
      [hours, minutes = 0] = time.split(':').map(Number);
    }

    // Create date with timezone awareness
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    
    // Create date object in specified timezone
    const startDate = this._createDateInTimezone(dateStr, timezone);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    return {
      date: date,
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      startISO: startDate.toISOString(),
      endISO: endDate.toISOString(),
      timezone: timezone,
      displayTime: startDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      })
    };
  }

  static async _createCalendarEvent(calendar, appointment, originalData) {
    const event = {
      summary: `${appointment.appointment_type}: ${appointment.patient_name}`,
      description: `
Mental Health Appointment

Patient: ${appointment.patient_name}
Phone: ${appointment.patient_phone || 'N/A'}
Email: ${appointment.patient_email || 'N/A'}
Type: ${appointment.appointment_type}
Provider: ${appointment.provider}

Notes: ${appointment.notes || 'None'}

Appointment ID: ${appointment.id}
      `.trim(),
      start: {
        dateTime: appointment.start_time,
        timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York'
      },
      end: {
        dateTime: appointment.end_time,
        timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/New_York'
      },
      // Removed attendees - service accounts can't invite without Domain-Wide Delegation
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },  // 24 hours before
          { method: 'popup', minutes: 60 }        // 1 hour before
        ]
      },
      colorId: '9'  // Blue color for mental health appointments
    };

    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event
    });

    return response.data;
  }

  /**
   * Generate time slots with advanced scheduling logic
   * Accounts for appointment duration and buffer times
   */
  static _generateTimeSlotsAdvanced(businessHours, durationMinutes, bufferBefore, bufferAfter) {
    const slots = [];
    const interval = BUSINESS_HOURS.slot_interval_minutes; // 15 minutes
    const totalSlotMinutes = durationMinutes + bufferBefore + bufferAfter;

    // Generate slots starting from business start time
    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += interval) {
        const slotEndHour = hour + Math.floor((minute + totalSlotMinutes) / 60);
        const slotEndMinute = (minute + totalSlotMinutes) % 60;

        // Check if slot fits within business hours
        if (slotEndHour < businessHours.end || 
            (slotEndHour === businessHours.end && slotEndMinute === 0)) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          slots.push(timeStr);
        }
      }
    }

    return slots;
  }

  /**
   * Check if a time slot has conflicts with existing appointments
   * Accounts for buffer times and overlapping appointments
   */
  static _hasTimeConflict(slotStart, slotEnd, existingAppointments, typeConfig) {
    for (const appt of existingAppointments) {
      // Skip cancelled appointments
      if (appt.status === 'cancelled') continue;

      const apptStart = new Date(appt.start_time);
      const apptEnd = new Date(appt.end_time);

      // Get appointment type config to calculate total blocked time
      const apptTypeConfig = APPOINTMENT_TYPES[appt.appointment_type] || 
                            APPOINTMENT_TYPES['Mental Health Consultation'];
      
      // Calculate total blocked time (appointment + buffers)
      const apptBlockedStart = new Date(apptStart.getTime() - apptTypeConfig.buffer_before_minutes * 60 * 1000);
      const apptBlockedEnd = new Date(apptEnd.getTime() + apptTypeConfig.buffer_after_minutes * 60 * 1000);

      // Check for overlap (with buffers)
      const newSlotBlockedStart = new Date(slotStart.getTime() - typeConfig.buffer_before_minutes * 60 * 1000);
      const newSlotBlockedEnd = new Date(slotEnd.getTime() + typeConfig.buffer_after_minutes * 60 * 1000);

      // Check if there's any overlap
      if (newSlotBlockedStart < apptBlockedEnd && newSlotBlockedEnd > apptBlockedStart) {
        return true; // Conflict detected
      }
    }

    return false; // No conflict
  }

  /**
   * Check if a specific slot is available for booking
   * @param {String} excludeAppointmentId - Appointment ID to exclude from conflict check (for reschedules)
   */
  static async _checkSlotAvailability(startISO, endISO, typeConfig, date, excludeAppointmentId = null) {
    const slotStart = new Date(startISO);
    const slotEnd = new Date(endISO);

    // Get existing appointments for the date
    let existingAppointments = db.getAppointmentsByDate(date);

    // Exclude the appointment being rescheduled from conflict check
    if (excludeAppointmentId) {
      existingAppointments = existingAppointments.filter(
        appt => appt.id !== excludeAppointmentId && !appt.id.includes(excludeAppointmentId.substring(5))
      );
    }

    // Check for conflicts
    const hasConflict = this._hasTimeConflict(
      slotStart,
      slotEnd,
      existingAppointments,
      typeConfig
    );

    if (hasConflict) {
      return {
        available: false,
        reason: 'Time slot conflicts with existing appointment (including buffer times)'
      };
    }

    // Check if within business hours
    const businessStart = new Date(slotStart);
    businessStart.setHours(BUSINESS_HOURS.start, 0, 0, 0);
    
    const businessEnd = new Date(slotStart);
    businessEnd.setHours(BUSINESS_HOURS.end, 0, 0, 0);

    const totalSlotMinutes = typeConfig.duration_minutes + 
                            typeConfig.buffer_before_minutes + 
                            typeConfig.buffer_after_minutes;
    const slotEndWithBuffers = new Date(slotStart.getTime() + totalSlotMinutes * 60 * 1000);

    if (slotStart < businessStart || slotEndWithBuffers > businessEnd) {
      return {
        available: false,
        reason: `Time slot is outside business hours (${BUSINESS_HOURS.start}:00 - ${BUSINESS_HOURS.end}:00)`
      };
    }

    return { available: true };
  }

  /**
   * Create a date in a specific timezone
   * Simplified approach - for production, consider using date-fns-tz
   */
  static _createDateInTimezone(dateTimeStr, timezone) {
    // Parse the date string
    const date = new Date(dateTimeStr);
    
    // For now, we'll work with local time and let the database handle timezone
    // The timezone is stored for reference but we'll convert to UTC for storage
    // In a production system, you'd use a proper timezone library
    return date;
  }

  /**
   * Parse date with timezone
   */
  static _parseDateWithTimezone(dateStr, timezone) {
    const date = new Date(dateStr + 'T00:00:00');
    return date;
  }

  /**
   * Convert time string to Date object with timezone
   */
  static _timeToDate(dateStr, timeStr, timezone) {
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  static _formatAppointment(appointment) {
    return {
      id: appointment.id,
      confirmation_number: appointment.id.substring(5, 13).toUpperCase(),
      patient_name: appointment.patient_name,
      patient_phone: appointment.patient_phone,
      appointment_type: appointment.appointment_type,
      date: appointment.date,
      time: appointment.time,
      datetime_display: new Date(appointment.start_time).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      provider: appointment.provider,
      duration_minutes: appointment.duration_minutes,
      status: appointment.status,
      calendar_link: appointment.calendar_link,
      created_at: appointment.created_at
    };
  }
}

module.exports = BookingService;
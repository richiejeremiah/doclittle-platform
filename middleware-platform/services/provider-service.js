/**
 * Provider Service - Operational dashboard support
 * 
 * Provides real-time data for provider daily operations:
 * - Today's schedule
 * - Next patient up
 * - Live metrics
 */

const db = require('../database');

class ProviderService {
  /**
   * Get today's schedule for a provider
   * @param {string} providerName - Provider name (defaults to all if not specified)
   * @returns {Array} Today's appointments sorted by time
   */
  getTodaySchedule(providerName = null) {
    const today = new Date().toISOString().split('T')[0];
    
    let query = `
      SELECT 
        id,
        patient_name,
        patient_phone,
        patient_email,
        appointment_type,
        date,
        time,
        start_time,
        end_time,
        duration_minutes,
        provider,
        status,
        notes,
        created_at
      FROM appointments
      WHERE date = ?
        AND status IN ('scheduled', 'confirmed')
    `;
    
    const params = [today];
    
    if (providerName) {
      query += ` AND provider = ?`;
      params.push(providerName);
    }
    
    query += ` ORDER BY time ASC`;
    
    const appointments = db.prepare(query).all(...params);
    
    // Enrich with time calculations
    const now = new Date();
    return appointments.map(apt => {
      const startTime = new Date(apt.start_time);
      const endTime = new Date(apt.end_time);
      const minutesUntil = Math.floor((startTime - now) / (1000 * 60));
      
      return {
        ...apt,
        minutes_until: minutesUntil,
        is_past: minutesUntil < 0,
        is_current: minutesUntil >= -apt.duration_minutes && minutesUntil <= apt.duration_minutes,
        is_upcoming: minutesUntil > 0 && minutesUntil <= 30,
        time_until: this._formatTimeUntil(minutesUntil),
        status_display: this._getStatusDisplay(apt.status, minutesUntil, apt.duration_minutes)
      };
    });
  }
  
  /**
   * Get the next patient up
   * @param {string} providerName - Provider name (optional)
   * @returns {Object|null} Next appointment or null
   */
  getNextPatient(providerName = null) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    let query = `
      SELECT 
        id,
        patient_name,
        patient_phone,
        patient_email,
        appointment_type,
        date,
        time,
        start_time,
        end_time,
        duration_minutes,
        provider,
        status,
        notes
      FROM appointments
      WHERE date = ?
        AND status IN ('scheduled', 'confirmed')
        AND datetime(start_time) >= datetime(?)
    `;
    
    const params = [today, now.toISOString()];
    
    if (providerName) {
      query += ` AND provider = ?`;
      params.push(providerName);
    }
    
    query += ` ORDER BY time ASC LIMIT 1`;
    
    const appointment = db.prepare(query).get(...params);
    
    if (!appointment) return null;
    
    const startTime = new Date(appointment.start_time);
    const minutesUntil = Math.floor((startTime - now) / (1000 * 60));
    
    return {
      ...appointment,
      minutes_until: minutesUntil,
      time_until: this._formatTimeUntil(minutesUntil),
      is_soon: minutesUntil <= 15,
      is_running_late: minutesUntil < -5
    };
  }
  
  /**
   * Get live metrics for today
   * @param {string} providerName - Provider name (optional)
   * @returns {Object} Real-time statistics
   */
  getLiveStats(providerName = null) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    let baseQuery = `
      FROM appointments
      WHERE date = ?
    `;
    
    const params = [today];
    
    if (providerName) {
      baseQuery += ` AND provider = ?`;
      params.push(providerName);
    }
    
    // Total scheduled today
    const totalScheduled = db.prepare(`
      SELECT COUNT(*) as count ${baseQuery} AND status IN ('scheduled', 'confirmed')
    `).get(...params).count;
    
    // Completed today
    const completed = db.prepare(`
      SELECT COUNT(*) as count ${baseQuery} AND status = 'completed'
    `).get(...params).count;
    
    // Cancelled today
    const cancelled = db.prepare(`
      SELECT COUNT(*) as count ${baseQuery} AND status = 'cancelled'
    `).get(...params).count;
    
    // No-shows (past appointments that weren't completed or cancelled)
    const noShows = db.prepare(`
      SELECT COUNT(*) as count 
      ${baseQuery} 
      AND status IN ('scheduled', 'confirmed')
      AND datetime(end_time) < datetime(?)
    `).get(...params, now.toISOString()).count;
    
    // Upcoming (next 2 hours)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const upcoming = db.prepare(`
      SELECT COUNT(*) as count 
      ${baseQuery} 
      AND status IN ('scheduled', 'confirmed')
      AND datetime(start_time) BETWEEN datetime(?) AND datetime(?)
    `).get(...params, now.toISOString(), twoHoursFromNow.toISOString()).count;
    
    // Currently in session (started but not ended)
    const inSession = db.prepare(`
      SELECT COUNT(*) as count 
      ${baseQuery} 
      AND status IN ('scheduled', 'confirmed')
      AND datetime(start_time) <= datetime(?)
      AND datetime(end_time) >= datetime(?)
    `).get(...params, now.toISOString(), now.toISOString()).count;
    
    // Average wait time (for appointments that started late)
    const lateAppointments = db.prepare(`
      SELECT start_time, time
      ${baseQuery} 
      AND status IN ('scheduled', 'confirmed', 'completed')
      AND datetime(start_time) > datetime(date || ' ' || time)
    `).all(...params);
    
    let avgWaitMinutes = 0;
    if (lateAppointments.length > 0) {
      const totalWait = lateAppointments.reduce((sum, apt) => {
        const scheduled = new Date(`${apt.date}T${apt.time}`);
        const actual = new Date(apt.start_time);
        return sum + Math.floor((actual - scheduled) / (1000 * 60));
      }, 0);
      avgWaitMinutes = Math.round(totalWait / lateAppointments.length);
    }
    
    return {
      total_scheduled: totalScheduled,
      completed: completed,
      cancelled: cancelled,
      no_shows: noShows,
      upcoming: upcoming,
      in_session: inSession,
      avg_wait_minutes: avgWaitMinutes,
      completion_rate: totalScheduled > 0 ? ((completed / (totalScheduled + completed)) * 100).toFixed(1) : '0.0',
      no_show_rate: totalScheduled > 0 ? ((noShows / totalScheduled) * 100).toFixed(1) : '0.0'
    };
  }
  
  /**
   * Get all providers (for multi-provider support)
   * @returns {Array} List of providers
   */
  getProviders() {
    const providers = db.prepare(`
      SELECT DISTINCT provider as name, COUNT(*) as appointment_count
      FROM appointments
      WHERE provider IS NOT NULL AND provider != ''
      GROUP BY provider
      ORDER BY appointment_count DESC
    `).all();
    
    return providers;
  }
  
  /**
   * Format time until appointment
   * @private
   */
  _formatTimeUntil(minutes) {
    if (minutes < 0) {
      const abs = Math.abs(minutes);
      if (abs < 60) return `${abs} min ago`;
      const hours = Math.floor(abs / 60);
      const mins = abs % 60;
      return `${hours}h ${mins}m ago`;
    } else if (minutes === 0) {
      return 'Now';
    } else if (minutes < 60) {
      return `in ${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `in ${hours}h ${mins}m`;
    }
  }
  
  /**
   * Get status display with context
   * @private
   */
  _getStatusDisplay(status, minutesUntil, duration) {
    if (status === 'cancelled') return 'Cancelled';
    if (status === 'completed') return 'Completed';
    
    if (minutesUntil < -duration) {
      return 'Past';
    } else if (minutesUntil < 0) {
      return 'In Session';
    } else if (minutesUntil <= 15) {
      return 'Starting Soon';
    } else {
      return 'Upcoming';
    }
  }
}

module.exports = new ProviderService();


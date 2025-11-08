/**
 * REMINDER SCHEDULER
 * Sends appointment reminders 1 hour before appointments
 * Runs every 5 minutes to check for upcoming appointments
 */

const db = require('../database');
const EmailService = require('./email-service');

class ReminderScheduler {
  static intervalId = null;
  static isRunning = false;

  /**
   * Start the reminder scheduler
   * Checks every 5 minutes for appointments needing reminders
   */
  static start() {
    if (this.isRunning) {
      console.log('⚠️  Reminder scheduler already running');
      return;
    }

    console.log('⏰ Starting reminder scheduler...');
    this.isRunning = true;

    // Run immediately on start
    this.checkAndSendReminders();

    // Then check every 5 minutes
    this.intervalId = setInterval(() => {
      this.checkAndSendReminders();
    }, 5 * 60 * 1000); // 5 minutes

    console.log('✅ Reminder scheduler started (checks every 5 minutes)');
  }

  /**
   * Stop the reminder scheduler
   */
  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️  Reminder scheduler stopped');
  }

  /**
   * Check for appointments needing reminders and send them
   */
  static async checkAndSendReminders() {
    try {
      const now = new Date();
      console.log(`\n⏰ Reminder Scheduler Check: ${now.toISOString()}`);

      // Get all upcoming appointments in the next hour
      const allAppointments = db.getAllAppointments({});
      console.log(`📋 Total appointments in database: ${allAppointments.length}`);

      const appointmentsNeedingReminders = allAppointments.filter(appt => {
        // Must be scheduled or confirmed
        if (!appt.status || !['scheduled', 'confirmed'].includes(appt.status)) {
          return false;
        }

        // Must have email
        if (!appt.patient_email) {
          return false;
        }

        // Must not have reminder sent already
        if (appt.reminder_sent) {
          return false;
        }

        // Must have start_time
        if (!appt.start_time) {
          return false;
        }

        const startTime = new Date(appt.start_time);
        const timeUntil = startTime.getTime() - now.getTime();
        const minutesUntil = Math.floor(timeUntil / (60 * 1000));

        // Check if appointment is between 55 minutes and 65 minutes away
        // (5-minute window to account for scheduler timing)
        const needsReminder = timeUntil >= 55 * 60 * 1000 && timeUntil <= 65 * 60 * 1000;

        if (needsReminder) {
          console.log(`   📅 Found: ${appt.patient_name} - ${appt.date} at ${appt.time} (${minutesUntil} minutes away)`);
        }

        return needsReminder;
      });

      console.log(`📧 Reminder Check: Found ${appointmentsNeedingReminders.length} appointments needing reminders`);

      for (const appt of appointmentsNeedingReminders) {
        try {
          console.log(`📧 Sending reminder for appointment ${appt.id} (${appt.patient_name})`);
          const result = await EmailService.sendAppointmentReminder(appt);

          if (result.success) {
            // Mark reminder as sent
            db.markReminderSent(appt.id);
            console.log(`✅ Reminder sent to ${appt.patient_email} for appointment on ${appt.date} at ${appt.time}`);
          } else {
            console.error(`❌ Failed to send reminder to ${appt.patient_email}: ${result.error}`);
          }
        } catch (error) {
          console.error(`❌ Error sending reminder for ${appt.id}:`, error.message);
        }
      }

      if (appointmentsNeedingReminders.length === 0) {
        console.log('   ℹ️  No appointments needing reminders at this time');
      }

    } catch (error) {
      console.error('❌ Error in reminder scheduler:', error);
    }
  }

  /**
   * Manually trigger reminder check (for testing)
   */
  static async manualCheck() {
    console.log('🔍 Manual reminder check triggered');
    await this.checkAndSendReminders();
  }
}

module.exports = ReminderScheduler;


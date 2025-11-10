/**
 * EMAIL SERVICE
 * Supports multiple email providers:
 * - SMTP (Gmail, SendGrid, Mailgun, etc.)
 * - Azure Communication Services Email (via SMTP or SDK)
 * Falls back to console logging if not configured
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('⚠️  nodemailer not installed - emails will be logged to console');
  console.warn('   Install with: npm install nodemailer');
  nodemailer = null;
}

let azureEmailClient;
try {
  const { EmailClient } = require('@azure/communication-email');
  azureEmailClient = EmailClient;
} catch (e) {
  // Azure SDK not installed - will use SMTP if configured
  azureEmailClient = null;
}

class EmailService {
  /**
   * Check if Azure Communication Services is configured
   */
  static isAzureConfigured() {
    return !!(process.env.AZURE_COMMUNICATION_CONNECTION_STRING && azureEmailClient);
  }

  /**
   * Get Azure Email Client
   */
  static getAzureClient() {
    if (!this.isAzureConfigured()) {
      return null;
    }

    try {
      return azureEmailClient.fromConnectionString(
        process.env.AZURE_COMMUNICATION_CONNECTION_STRING
      );
    } catch (error) {
      console.error('❌ Error initializing Azure Email Client:', error.message);
      return null;
    }
  }

  /**
   * Get email transporter (SMTP)
   * Returns null if credentials not configured
   */
  static getTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!nodemailer) {
      console.warn('⚠️  nodemailer not installed - emails will be logged to console');
      return null;
    }

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return null; // Silent return - will check Azure next
    }

    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword
      }
    });
  }

  /**
   * Send email via Azure Communication Services
   * @private
   */
  static async _sendViaAzure({ to, subject, html, text }) {
    try {
      const client = this.getAzureClient();
      if (!client) {
        return null;
      }

      const senderAddress = process.env.AZURE_EMAIL_SENDER || process.env.SMTP_FROM || 'DoNotReply@azurecomm.net';
      
      const message = {
        content: {
          subject: subject,
          plainText: text || html.replace(/<[^>]*>/g, ''),
          html: html
        },
        recipients: {
          to: [{ address: to }]
        },
        senderAddress: senderAddress
      };

      const poller = await client.beginSend(message);
      const result = await poller.pollUntilDone();

      console.log('📧 Email sent via Azure:', result.id);
      return { success: true, message_id: result.id, provider: 'azure' };

    } catch (error) {
      console.error('❌ Azure email send error:', error.message);
      return { success: false, error: error.message, provider: 'azure' };
    }
  }

  /**
   * Send email
   * Supports both Azure Communication Services and SMTP
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML body
   * @param {string} options.text - Plain text body (optional)
   */
  static async sendEmail({ to, subject, html, text }) {
    try {
      // Try Azure first if configured
      if (this.isAzureConfigured()) {
        const azureResult = await this._sendViaAzure({ to, subject, html, text });
        if (azureResult && azureResult.success) {
          return azureResult;
        }
        // If Azure fails, fall back to SMTP
        console.warn('⚠️  Azure email failed, falling back to SMTP');
      }

      // Try SMTP
      const transporter = this.getTransporter();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.AZURE_EMAIL_SENDER || 'noreply@doclittle.health';

      if (transporter) {
        const info = await transporter.sendMail({
          from: from,
          to: to,
          subject: subject,
          html: html,
          text: text || html.replace(/<[^>]*>/g, '')
        });

        console.log('📧 Email sent via SMTP:', info.messageId);
        return { success: true, message_id: info.messageId, provider: 'smtp' };
      }

      // If no email service configured, log to console
      console.log('\n📧 EMAIL (SIMULATED):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`From: ${from}`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${text || html}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return { success: true, message_id: 'simulated', provider: 'console' };

    } catch (error) {
      console.error('❌ Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send appointment confirmation email
   */
  static async sendAppointmentConfirmation(appointment) {
    const dateTime = new Date(appointment.start_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: appointment.timezone || 'America/New_York'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0891b2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .appointment-details { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #0891b2; }
          .detail-row { margin: 10px 0; }
          .label { font-weight: bold; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background: #0891b2; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .button:hover { background: #0e7490; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 Appointment Confirmed</h1>
          </div>
          <div class="content">
            <p>Dear ${appointment.patient_name},</p>
            <p>Your appointment has been successfully scheduled!</p>
            
            <div class="appointment-details">
              <div class="detail-row">
                <span class="label">Date & Time:</span> ${dateTime}
              </div>
              <div class="detail-row">
                <span class="label">Type:</span> ${appointment.appointment_type || 'Mental Health Consultation'}
              </div>
              <div class="detail-row">
                <span class="label">Duration:</span> ${appointment.duration_minutes || 50} minutes
              </div>
              <div class="detail-row">
                <span class="label">Provider:</span> ${appointment.provider || 'DocLittle Mental Health Team'}
              </div>
              ${appointment.calendar_link ? `
              <div class="detail-row">
                <a href="${appointment.calendar_link}" class="button">📅 Add to Calendar</a>
              </div>
              ` : ''}
            </div>

            <p><strong>Confirmation Number:</strong> ${appointment.id}</p>
            
            <p>You will receive a reminder email 1 hour before your appointment.</p>
            
            <p>If you need to reschedule or cancel, please contact us or use the link in your reminder email.</p>
            
            <p>We look forward to seeing you!</p>
            <p>Best regards,<br>DocLittle Mental Health Team</p>
          </div>
          <div class="footer">
            <p>This is an automated confirmation. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: appointment.patient_email,
      subject: `Appointment Confirmed - ${dateTime}`,
      html: html
    });
  }

  /**
   * Send appointment reminder email (1 hour before)
   */
  static async sendAppointmentReminder(appointment) {
    const dateTime = new Date(appointment.start_time).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: appointment.timezone || 'America/New_York'
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    const cancelLink = `${baseUrl}/api/appointments/${appointment.id}/cancel?token=${this._generateCancelToken(appointment.id)}`;
    const rescheduleLink = `${baseUrl}/api/appointments/${appointment.id}/reschedule?token=${this._generateCancelToken(appointment.id)}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .appointment-details { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #f59e0b; }
          .detail-row { margin: 10px 0; }
          .label { font-weight: bold; color: #666; }
          .button { display: inline-block; padding: 12px 24px; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .button-primary { background: #0891b2; }
          .button-primary:hover { background: #0e7490; }
          .button-danger { background: #dc2626; }
          .button-danger:hover { background: #b91c1c; }
          .button-warning { background: #f59e0b; }
          .button-warning:hover { background: #d97706; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Appointment Reminder</h1>
          </div>
          <div class="content">
            <p>Dear ${appointment.patient_name},</p>
            <p><strong>This is a reminder that you have an appointment in 1 hour:</strong></p>
            
            <div class="appointment-details">
              <div class="detail-row">
                <span class="label">Date & Time:</span> ${dateTime}
              </div>
              <div class="detail-row">
                <span class="label">Type:</span> ${appointment.appointment_type || 'Mental Health Consultation'}
              </div>
              <div class="detail-row">
                <span class="label">Provider:</span> ${appointment.provider || 'DocLittle Mental Health Team'}
              </div>
            </div>

            <p>Need to make changes?</p>
            <p>
              <a href="${rescheduleLink}" class="button button-warning">🔄 Reschedule</a>
              <a href="${cancelLink}" class="button button-danger">❌ Cancel</a>
            </p>
            
            <p>If you need to reschedule, please check available slots before confirming your new time.</p>
            
            <p>We look forward to seeing you soon!</p>
            <p>Best regards,<br>DocLittle Mental Health Team</p>
          </div>
          <div class="footer">
            <p>Confirmation Number: ${appointment.id}</p>
            <p>This is an automated reminder. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: appointment.patient_email,
      subject: `Appointment Reminder - ${dateTime}`,
      html: html
    });
  }

  /**
   * Send checkout verification code to email
   */
  static async sendCheckoutVerificationCode(email, code) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0891b2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .code-box { background: white; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; border: 2px dashed #0891b2; }
          .code { font-size: 32px; font-weight: bold; color: #0891b2; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Verification Code</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested a payment link. Please use the verification code below to confirm your identity:</p>
            
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            
            <p>Best regards,<br>DocLittle Security Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Your Verification Code',
      html: html
    });
  }

  /**
   * Send payment link email after verification
   */
  static async sendPaymentLinkEmail(email, paymentLink, order) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #16a34a; margin-bottom: 16px; }
          .button { display: inline-block; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .button:hover { background: #15803d; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💳 Complete Your Payment</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Your email has been verified. Please use the secure link below to complete your payment.</p>
            <div class="order">
              <div><strong>Product:</strong> ${order?.product_name || 'Service'}</div>
              <div><strong>Amount:</strong> $${(order?.amount || 0).toFixed(2)}</div>
            </div>
            <p>
              <a class="button" href="${paymentLink}">Pay Now</a>
            </p>
            <p>If the button doesn't work, copy and paste this URL into your browser:</p>
            <p>${paymentLink}</p>
            <p>Thank you for choosing DocLittle.</p>
          </div>
          <div class="footer">
            <p>This is a secure payment link. Do not share it with anyone.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Complete Your Payment',
      html: html
    });
  }

  /**
   * Generate cancel/reschedule token
   */
  static _generateCancelToken(appointmentId) {
    const crypto = require('crypto');
    const secret = process.env.APPOINTMENT_SECRET || 'default-secret-change-in-production';
    return crypto.createHmac('sha256', secret).update(appointmentId).digest('hex');
  }

  /**
   * Verify cancel/reschedule token
   */
  static verifyCancelToken(appointmentId, token) {
    const crypto = require('crypto');
    const expectedToken = this._generateCancelToken(appointmentId);
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
  }
}

module.exports = EmailService;


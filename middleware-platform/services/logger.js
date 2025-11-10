/**
 * Structured Logging Service
 * Provides consistent logging across the application
 */

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  /**
   * Check if should log at this level
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  /**
   * Format log message
   */
  format(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...data
    };

    // In production, you might want to send to external service
    if (process.env.NODE_ENV === 'production' && level === 'error') {
      // TODO: Send to error tracking service (Sentry, etc.)
    }

    return JSON.stringify(logEntry);
  }

  /**
   * Log error
   */
  error(message, error = null, data = {}) {
    if (!this.shouldLog('error')) return;

    const errorData = {
      ...data,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null
    };

    console.error(this.format('error', message, errorData));
  }

  /**
   * Log warning
   */
  warn(message, data = {}) {
    if (!this.shouldLog('warn')) return;
    console.warn(this.format('warn', message, data));
  }

  /**
   * Log info
   */
  info(message, data = {}) {
    if (!this.shouldLog('info')) return;
    console.log(this.format('info', message, data));
  }

  /**
   * Log debug
   */
  debug(message, data = {}) {
    if (!this.shouldLog('debug')) return;
    console.debug(this.format('debug', message, data));
  }

  /**
   * Log HTTP request
   */
  http(req, res, duration) {
    const data = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 500) {
      this.error(`HTTP ${req.method} ${req.path}`, null, data);
    } else if (res.statusCode >= 400) {
      this.warn(`HTTP ${req.method} ${req.path}`, data);
    } else {
      this.info(`HTTP ${req.method} ${req.path}`, data);
    }
  }
}

module.exports = new Logger();


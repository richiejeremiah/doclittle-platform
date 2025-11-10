/**
 * Security Middleware
 * Adds security headers and input validation
 */

const helmet = require('helmet');

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.retellai.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Stripe iframes
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow external resources
});

/**
 * Input sanitization middleware
 */
function sanitizeInput(req, res, next) {
  // Recursively sanitize object
  function sanitize(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? obj.trim() : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }

    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string') {
          // Remove potentially dangerous characters but keep necessary ones
          sanitized[key] = value.trim().replace(/[<>]/g, '');
        } else {
          sanitized[key] = sanitize(value);
        }
      }
    }
    return sanitized;
  }

  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitize(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitize(req.params);
  }

  next();
}

/**
 * Validate email format
 */
function validateEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
function validatePhone(phone) {
  if (!phone) return false;
  // Allow various formats: +1234567890, (123) 456-7890, 123-456-7890, etc.
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  
  next();
}

module.exports = {
  securityHeaders,
  sanitizeInput,
  validateEmail,
  validatePhone,
  requestLogger
};


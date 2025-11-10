/**
 * Authentication Middleware
 * Protects API endpoints with API key authentication
 */

const crypto = require('crypto');
const db = require('../database');

/**
 * Generate API key for merchant
 */
function generateApiKey() {
  return `sk_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Verify API key from request
 */
function verifyApiKey(req, res, next) {
  // Skip auth for public endpoints
  const publicPaths = [
    '/health',
    '/',
    '/voice/incoming', // Retell webhook
    '/webhook/stripe', // Stripe webhook
    '/webhook/circle', // Circle webhook
    '/payment/', // Public payment pages
    '/api/patient/verify/', // Patient verification
  ];

  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Get API key from header or query
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Please provide an API key in X-API-Key header or Authorization header'
    });
  }

  // Verify API key exists in database
  const merchant = db.getMerchantByApiKey(apiKey);
  if (!merchant) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  // Attach merchant to request
  req.merchant = merchant;
  next();
}

/**
 * Optional API key verification (for endpoints that work with or without auth)
 */
function optionalApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;

  if (apiKey) {
    const merchant = db.getMerchantByApiKey(apiKey);
    if (merchant) {
      req.merchant = merchant;
    }
  }

  next();
}

module.exports = {
  generateApiKey,
  verifyApiKey,
  optionalApiKey
};


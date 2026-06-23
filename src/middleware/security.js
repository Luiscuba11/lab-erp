'use strict';

const helmet      = require('helmet');
const compression = require('compression');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

function applySecurityMiddleware(app) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https:", "http:"],
        fontSrc:     ["'self'", "https://fonts.gstatic.com", "https:", "data:"],
        imgSrc:      ["'self'", "data:", "https:", "http:"],
        connectSrc:  ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: false,
  }));

  app.use(compression());
  app.use(cors({ origin: true, credentials: true }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: () => process.env.NODE_ENV === 'development',
  });
  app.use('/api/auth/login', authLimiter);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    skip: () => process.env.NODE_ENV === 'development',
  });
  app.use('/api', apiLimiter);

  console.log('[Security] Middleware applied');
}

module.exports = { applySecurityMiddleware };

'use strict';

/**
 * src/middleware/security.js
 * Applies production-grade security middleware to the Express app.
 * Import and call applySecurityMiddleware(app) right after app = express().
 */

const helmet      = require('helmet');
const compression = require('compression');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

function applySecurityMiddleware(app) {

  // ── Helmet — HTTP security headers ───────────────────────────────────────
  app.use(helmet({
    // Allow inline scripts needed by the SPA (no external scripts loaded)
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],   // SPA uses inline event handlers
        styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,   // Needed for print windows
  }));

  // ── Compression — gzip responses ─────────────────────────────────────────
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const rawOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:3004';
  const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

  app.use(cors({
    origin(origin, callback) {
      // Allow requests with no origin (same-origin, Postman, curl)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));

  // ── Rate Limiting — auth endpoint (brute-force protection) ───────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,                     // 10 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
    skip: () => process.env.NODE_ENV === 'development',   // skip in dev
  });

  app.use('/api/auth/login', authLimiter);

  // ── Rate Limiting — general API (DoS protection) ─────────────────────────
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1 minute window
    max: 200,                    // 200 requests/min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Por favor espere un momento.' },
    skip: () => process.env.NODE_ENV === 'development',   // skip in dev
  });

  app.use('/api', apiLimiter);

  console.log('[Security] Helmet, compression, CORS, rate-limit applied');
  console.log(`[Security] Allowed origins: ${allowedOrigins.join(', ')}`);
}

module.exports = { applySecurityMiddleware };

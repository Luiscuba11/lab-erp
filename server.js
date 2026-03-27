'use strict';

// ─── Load environment variables FIRST ─────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path    = require('path');

const { init: initDB }              = require('./db/database');
const { applySecurityMiddleware }   = require('./src/middleware/security');

const app  = express();
const PORT = process.env.PORT || 3004;

// ─── Security Middleware (helmet, compression, cors, rate-limit) ───────────────
applySecurityMiddleware(app);

// ─── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'lab-erp-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000,   // 8 hours
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/patients',      require('./routes/patients'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/catalog',       require('./routes/catalog'));
app.use('/api/results',       require('./routes/results'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/supplies',      require('./routes/supplies'));
app.use('/api/billing',       require('./routes/billing'));
app.use('/api/finance',       require('./routes/finance'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/report',            require('./routes/reports'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    env:     process.env.NODE_ENV || 'development',
    db:      process.env.DB_TYPE  || 'sqlite',
    uptime:  Math.round(process.uptime()),
  });
});

// ─── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  LabERP is running at http://localhost:${PORT}`);
      console.log(`  Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Database    : ${process.env.DB_TYPE || 'sqlite'}\n`);
    });
  })
  .catch(err => {
    console.error('[FATAL] Database initialization failed:', err.message);
    process.exit(1);
  });

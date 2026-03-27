/**
 * ecosystem.config.js — PM2 process configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js                      # development (SQLite)
 *   pm2 start ecosystem.config.js --env production     # production (PostgreSQL)
 *   pm2 save && pm2 startup                            # auto-restart on reboot
 */

module.exports = {
  apps: [
    {
      name:         'biopap-lab',
      script:       'server.js',
      instances:    1,              // Use 'max' for cluster mode in prod
      exec_mode:    'fork',

      // ── Development (SQLite, port 3004) ─────────────────────────────────
      env: {
        NODE_ENV:       'development',
        PORT:           '3004',
        DB_TYPE:        'sqlite',
        DB_PATH:        './lab-erp.db',
        SESSION_SECRET: 'dev-secret-not-for-production',
        ALLOWED_ORIGINS: 'http://localhost:3004',
      },

      // ── Production (PostgreSQL, port 3000) ──────────────────────────────
      env_production: {
        NODE_ENV:        'production',
        PORT:            '3000',
        DB_TYPE:         'postgres',
        DB_HOST:         'your-db-host',
        DB_PORT:         '5432',
        DB_NAME:         'biopap_db',
        DB_USER:         'biopap_user',
        DB_PASSWORD:     'set-via-pm2-env-or-secret-manager',
        SESSION_SECRET:  'set-via-pm2-env-or-secret-manager',
        ALLOWED_ORIGINS: 'https://yourdomain.com',
        instances:       2,
        exec_mode:       'cluster',
      },

      // ── Logs ─────────────────────────────────────────────────────────────
      log_date_format:  'YYYY-MM-DD HH:mm:ss',
      out_file:  './logs/app.out.log',
      error_file:'./logs/app.err.log',
      merge_logs: true,

      // ── Restart policy ────────────────────────────────────────────────────
      watch:       false,
      max_memory_restart: '512M',
      restart_delay:      2000,
      max_restarts:       10,
    },
  ],
};

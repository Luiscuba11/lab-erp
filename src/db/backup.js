'use strict';

/**
 * src/db/backup.js
 * Creates timestamped copies of the SQLite database.
 * Retains only the 7 most recent backups.
 *
 * Usage:
 *   Standalone:  node src/db/backup.js
 *   Programmatic: const { runBackup } = require('./src/db/backup'); await runBackup();
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH      = path.resolve(process.cwd(), process.env.DB_PATH || 'lab-erp.db');
const BACKUP_DIR   = path.resolve(process.cwd(), 'backups');
const MAX_BACKUPS  = 7;

async function runBackup() {
  if (process.env.DB_TYPE === 'postgres') {
    console.log('[Backup] PostgreSQL mode — use pg_dump externally. Skipping file backup.');
    return null;
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`[Backup] Database file not found: ${DB_PATH}`);
  }

  // Ensure backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Create timestamped filename
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `lab-erp_${ts}.db`);

  // Copy the database file
  fs.copyFileSync(DB_PATH, dest);
  console.log(`[Backup] Created: ${dest}`);

  // Prune old backups — keep only MAX_BACKUPS most recent
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('lab-erp_') && f.endsWith('.db'))
    .sort()           // ISO timestamps sort lexicographically = chronologically
    .reverse();       // newest first

  const toDelete = files.slice(MAX_BACKUPS);
  for (const f of toDelete) {
    const filePath = path.join(BACKUP_DIR, f);
    fs.unlinkSync(filePath);
    console.log(`[Backup] Removed old backup: ${f}`);
  }

  console.log(`[Backup] Done. Retained ${Math.min(files.length, MAX_BACKUPS)} backup(s).`);
  return dest;
}

// ── Standalone execution ──────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config();
  runBackup()
    .then(dest => { if (dest) console.log(`[Backup] Success: ${dest}`); })
    .catch(err  => { console.error('[Backup] Error:', err.message); process.exit(1); });
}

module.exports = { runBackup };

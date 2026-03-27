'use strict';

/**
 * src/db/database.js
 * Dual-adapter: SQLite (dev/local) ↔ PostgreSQL (production cloud)
 * Controlled by DB_TYPE env var.
 * Exports: run(sql, params), get(sql, params), all(sql, params), transaction(fn)
 */

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

/* ═══════════════════════════════════════════════════════════════════════════
   SQLite adapter  (uses existing sqlite3 package, WAL mode)
   ═══════════════════════════════════════════════════════════════════════════ */
if (DB_TYPE === 'sqlite') {
  const sqlite3 = require('sqlite3').verbose();
  const path    = require('path');

  const dbPath = process.env.DB_PATH
    ? require('path').resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, '..', '..', 'lab-erp.db');

  const db = new sqlite3.Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async function transaction(fn) {
    await run('BEGIN');
    try {
      const result = await fn();
      await run('COMMIT');
      return result;
    } catch (err) {
      await run('ROLLBACK').catch(() => {});
      throw err;
    }
  }

  module.exports = { run, get, all, transaction, _db: db, _type: 'sqlite' };

/* ═══════════════════════════════════════════════════════════════════════════
   PostgreSQL adapter  (uses pg Pool, converts ? → $1 $2 ..., adds RETURNING id)
   ═══════════════════════════════════════════════════════════════════════════ */
} else if (DB_TYPE === 'postgres') {
  const { Pool } = require('pg');

  const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'biopap_db',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => console.error('[PG] Pool error:', err.message));

  /**
   * Convert SQLite-style positional ? placeholders to PostgreSQL $1, $2, ...
   * Also appends RETURNING id to INSERT statements so lastID is available.
   */
  function convertSQL(sql, params) {
    let i = 0;
    let converted = sql.replace(/\?/g, () => `$${++i}`);
    // Add RETURNING id if it's an INSERT without one
    if (/^\s*INSERT\s+/i.test(converted) && !/RETURNING/i.test(converted)) {
      converted = converted.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
    }
    return converted;
  }

  async function run(sql, params = []) {
    const client = await pool.connect();
    try {
      const result = await client.query(convertSQL(sql, params), params);
      return {
        lastID:  result.rows[0]?.id ?? null,
        changes: result.rowCount,
      };
    } finally {
      client.release();
    }
  }

  async function get(sql, params = []) {
    const client = await pool.connect();
    try {
      const result = await client.query(convertSQL(sql, params), params);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async function all(sql, params = []) {
    const client = await pool.connect();
    try {
      const result = await client.query(convertSQL(sql, params), params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  module.exports = { run, get, all, transaction, _pool: pool, _type: 'postgres' };

} else {
  throw new Error(`[DB] Unknown DB_TYPE: "${DB_TYPE}". Use "sqlite" or "postgres".`);
}

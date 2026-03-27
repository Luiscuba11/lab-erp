'use strict';

const express = require('express');
const router  = express.Router();
const { run, get, all } = require('../db/database');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Auto-generate supply alert notifications (run on every GET)
async function syncSupplyNotifications() {
  const lowSupplies = await all(
    `SELECT * FROM supplies WHERE active=1 AND stock_current < stock_min
     ORDER BY stock_current / NULLIF(stock_critical,0) ASC`
  );
  for (const s of lowSupplies) {
    const status = s.stock_current < s.stock_critical ? 'CRITICO' : 'BAJO';
    // Check if an unread notification already exists for this supply
    const existing = await get(
      `SELECT id FROM notifications WHERE entity_type='supply' AND entity_id=? AND is_read=0
       AND created_at >= datetime('now','-1 day')`,
      [s.id]
    );
    if (!existing) {
      const title = status === 'CRITICO'
        ? `⛔ Stock Crítico: ${s.name}`
        : `⚠️ Stock Bajo: ${s.name}`;
      const message = `${s.name} (${s.code}): ${s.stock_current} ${s.unit} restantes. ` +
        (status === 'CRITICO'
          ? `Nivel crítico alcanzado (mín: ${s.stock_min}).`
          : `Por debajo del mínimo (mín: ${s.stock_min}).`);
      await run(
        `INSERT INTO notifications (type, title, message, entity_type, entity_id)
         VALUES (?,?,?,?,?)`,
        [status === 'CRITICO' ? 'CRITICAL_STOCK' : 'LOW_STOCK', title, message, 'supply', s.id]
      );
    }
  }
}

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    await syncSupplyNotifications();
    const rows = await all(
      `SELECT * FROM notifications ORDER BY is_read ASC, created_at DESC LIMIT 50`
    );
    const unread = rows.filter(n => !n.is_read).length;
    res.json({ unread, notifications: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read=1 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read=1');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/notifications/clear — remove old read ones
router.delete('/clear', requireAuth, async (req, res) => {
  try {
    await run(`DELETE FROM notifications WHERE is_read=1 AND created_at < datetime('now','-7 days')`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db/database');
const { requireRole } = require('../middleware/auth');

// GET /api/finance/stats
router.get('/stats', requireRole('ADMIN'), async (req, res) => {
  try {
    const today = await get(`
      SELECT
        COALESCE(SUM(amount),0) AS total_today,
        COUNT(*) AS payments_today
      FROM payments WHERE date(created_at) = date('now')
    `);
    const pending = await get(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total_price),0) AS total
      FROM orders WHERE payment_status='PENDIENTE'
    `);
    const topMethod = await get(`
      SELECT payment_method, COUNT(*) AS cnt FROM payments
      WHERE date(created_at) = date('now')
      GROUP BY payment_method ORDER BY cnt DESC LIMIT 1
    `);
    const monthly = await get(`
      SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM payments WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `);
    const last30 = await all(`
      SELECT date(created_at) AS day, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM payments WHERE date(created_at) >= date('now', '-30 days')
      GROUP BY date(created_at) ORDER BY day ASC
    `);
    const topTests = await all(`
      SELECT t.name, COUNT(*) AS times, COALESCE(SUM(t.price),0) AS revenue
      FROM order_items oi
      JOIN test_catalog t ON t.id = oi.test_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'PAGADO'
      GROUP BY t.id ORDER BY revenue DESC LIMIT 10
    `);
    const byMethod = await all(`
      SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
      FROM payments GROUP BY payment_method ORDER BY total DESC
    `);
    // Fixed costs for current month
    const fixedCosts = await all(`SELECT * FROM fixed_costs WHERE active=1 ORDER BY type, description`);
    const monthlyFixed = fixedCosts.reduce((s, c) => s + (c.period === 'MENSUAL' ? c.amount : c.period === 'ANUAL' ? c.amount/12 : 0), 0);
    const netMargin = (monthly?.total || 0) - monthlyFixed;
    res.json({ today, pending, topMethod, monthly, last30, topTests, byMethod, fixedCosts, monthlyFixed, netMargin });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fixed Costs CRUD ──────────────────────────────────────────────────────

router.get('/fixed-costs', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM fixed_costs WHERE active=1 ORDER BY type, description');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fixed-costs', requireRole('ADMIN'), async (req, res) => {
  try {
    const { type='OTRO', description, amount, period='MENSUAL' } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Descripción y monto requeridos' });
    const r = await run('INSERT INTO fixed_costs (type,description,amount,period) VALUES (?,?,?,?)',
      [type, description, amount, period]);
    res.status(201).json(await get('SELECT * FROM fixed_costs WHERE id=?', [r.lastID]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/fixed-costs/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { type, description, amount, period } = req.body;
    await run('UPDATE fixed_costs SET type=?,description=?,amount=?,period=? WHERE id=?',
      [type, description, amount, period, req.params.id]);
    res.json(await get('SELECT * FROM fixed_costs WHERE id=?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/fixed-costs/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await run('UPDATE fixed_costs SET active=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Gasto eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/finance/export?from=&to= — CSV download
router.get('/export', requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = [], params = [];
    if (from) { where.push("date(pay.created_at) >= date(?)"); params.push(from); }
    if (to)   { where.push("date(pay.created_at) <= date(?)"); params.push(to); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await all(`
      SELECT pay.id, o.order_number, p.name AS paciente, pay.amount AS monto,
        pay.payment_method AS metodo, pay.received_amount AS recibido,
        pay.change_amount AS vuelto, pay.created_at AS fecha, u.full_name AS cajero
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = pay.user_id
      ${w}
      ORDER BY pay.created_at ASC
    `, params);

    const header = 'ID,Orden,Paciente,Monto,Metodo,Recibido,Vuelto,Fecha,Cajero\n';
    const csv = header + rows.map(r =>
      [r.id, r.order_number, `"${r.paciente}"`, r.monto, r.metodo, r.recibido, r.vuelto, r.fecha, `"${r.cajero || ''}"`].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cobros-biopap-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const { run, get, all, transaction, auditLog } = require('../db/database');
const { requireRole } = require('../middleware/auth');

const BILLING_ROLES = ['ADMIN', 'RECEPTIONIST'];

// GET /api/billing/pending — orders pending payment
router.get('/pending', requireRole(...BILLING_ROLES), async (req, res) => {
  try {
    const orders = await all(`
      SELECT o.id, o.order_number, o.status, o.total_price, o.payment_status, o.created_at,
        p.name AS patient_name, p.id_number AS patient_id_number,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS test_count,
        u.full_name AS created_by_name
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = o.created_by
      WHERE o.payment_status IN ('PENDIENTE','CREDITO')
      ORDER BY o.created_at DESC LIMIT 200
    `);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/billing/history — all payments
router.get('/history', requireRole(...BILLING_ROLES), async (req, res) => {
  try {
    const { from, to, limit = 200 } = req.query;
    const where = [], params = [];
    if (from) { where.push("date(pay.created_at) >= date(?)"); params.push(from); }
    if (to)   { where.push("date(pay.created_at) <= date(?)"); params.push(to); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const payments = await all(`
      SELECT pay.*, o.order_number, o.total_price,
        p.name AS patient_name, u.full_name AS cashier_name
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = pay.user_id
      ${w}
      ORDER BY pay.created_at DESC
      LIMIT ?
    `, [...params, parseInt(limit)]);
    res.json(payments);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/billing/:orderId/pay — record payment
router.post('/:orderId/pay', requireRole(...BILLING_ROLES), async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'PAGADO') return res.status(409).json({ error: 'Order already paid' });

    const { payment_method = 'EFECTIVO', received_amount, notes } = req.body;
    const amount = order.total_price || 0;
    const received = parseFloat(received_amount) || amount;
    const change = Math.max(0, received - amount);

    await transaction(async () => {
      await run(
        `INSERT INTO payments (order_id, amount, payment_method, received_amount, change_amount, notes, user_id)
         VALUES (?,?,?,?,?,?,?)`,
        [order.id, amount, payment_method, received, change, notes || null, req.session.user.id]
      );
      await run(`UPDATE orders SET payment_status='PAGADO' WHERE id=?`, [order.id]);
    });

    await auditLog(req.session.user.id, 'PAYMENT', 'order', order.id, { amount, payment_method });
    res.json({ success: true, amount, change, payment_method });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/billing/:orderId/status — update payment status (credit/exempt)
router.put('/:orderId/status', requireRole('ADMIN'), async (req, res) => {
  try {
    const { payment_status } = req.body;
    const valid = ['PENDIENTE', 'PAGADO', 'CREDITO', 'EXONERADO'];
    if (!valid.includes(payment_status)) return res.status(400).json({ error: 'Invalid payment_status' });
    await run('UPDATE orders SET payment_status=? WHERE id=?', [payment_status, req.params.orderId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

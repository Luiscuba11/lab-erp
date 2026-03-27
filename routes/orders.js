'use strict';

const express = require('express');
const router = express.Router();
const { run, get, all, transaction, auditLog, generateOrderNumber } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const ALL_ROLES = ['RECEPTIONIST', 'TECHNICIAN', 'BIOCHEMIST', 'ADMIN'];

// GET /api/orders?status=&patientId=&limit=
router.get('/', requireRole(...ALL_ROLES), async (req, res) => {
  try {
    const { status, patientId, limit = 100 } = req.query;
    const where = [], params = [];
    if (status)    { where.push('o.status = ?');     params.push(status); }
    if (patientId) { where.push('o.patient_id = ?'); params.push(patientId); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orders = await all(`
      SELECT o.*,
        p.name AS patient_name, p.dob AS patient_dob, p.gender AS patient_gender, p.id_number AS patient_id_number,
        u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS test_count,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status = 'COMPLETED') AS completed_count,
        (SELECT COUNT(*) FROM order_items oi
           JOIN results r ON r.order_item_id = oi.id
           WHERE oi.order_id = o.id AND r.is_locked = 1) AS validated_count,
        (SELECT COUNT(*) FROM order_items oi
           JOIN results r ON r.order_item_id = oi.id
           WHERE oi.order_id = o.id AND r.is_critical = 1) AS critical_count
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = o.created_by
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ?
    `, [...params, parseInt(limit)]);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/orders
router.post('/', requireRole('RECEPTIONIST', 'ADMIN'), async (req, res) => {
  const { patient_id, notes, test_ids } = req.body;
  if (!patient_id || !test_ids || !test_ids.length) {
    return res.status(400).json({ error: 'patient_id and at least one test_id required' });
  }

  try {
    const patient = await get('SELECT id FROM patients WHERE id = ?', [patient_id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    let total_price = 0;
    for (const tid of test_ids) {
      const t = await get('SELECT id, price FROM test_catalog WHERE id = ? AND active = 1', [tid]);
      if (!t) return res.status(400).json({ error: `Test ID ${tid} not found or inactive` });
      total_price += t.price || 0;
    }

    const order_id = await transaction(async () => {
      const order_number = await generateOrderNumber();
      const result = await run(
        'INSERT INTO orders (order_number, patient_id, notes, created_by, total_price) VALUES (?, ?, ?, ?, ?)',
        [order_number, patient_id, notes || null, req.session.user.id, total_price]
      );
      const oid = result.lastID;
      for (const tid of test_ids) {
        await run('INSERT INTO order_items (order_id, test_id) VALUES (?, ?)', [oid, tid]);
      }
      return oid;
    });

    await auditLog(req.session.user.id, 'CREATE', 'order', order_id, { patient_id, test_count: test_ids.length });
    const order = await get('SELECT * FROM orders WHERE id = ?', [order_id]);
    res.status(201).json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders/:id  (detail with items + results)
router.get('/:id', requireRole(...ALL_ROLES), async (req, res) => {
  try {
    const order = await get(`
      SELECT o.*,
        p.name AS patient_name, p.dob AS patient_dob, p.gender AS patient_gender,
        p.id_number AS patient_id_number, p.contact AS patient_contact,
        u.full_name AS created_by_name
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = ?
    `, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = await all(`
      SELECT oi.*,
        t.code, t.name AS test_name, t.sample_type, t.unit,
        t.result_type, t.parameters, t.price AS test_price, t.estimated_time,
        t.ref_min_child_m, t.ref_max_child_m, t.ref_min_adult_m, t.ref_max_adult_m,
        t.ref_min_elder_m, t.ref_max_elder_m, t.ref_min_child_f, t.ref_max_child_f,
        t.ref_min_adult_f, t.ref_max_adult_f, t.ref_min_elder_f, t.ref_max_elder_f,
        r.id AS result_id, r.value, r.value_text, r.flag, r.is_critical, r.notes AS result_notes,
        r.entered_by, r.entered_at, r.is_locked,
        eu.full_name AS entered_by_name,
        r.validated_by, r.validated_at,
        vu.full_name AS validated_by_name
      FROM order_items oi
      JOIN test_catalog t ON t.id = oi.test_id
      LEFT JOIN results r ON r.order_item_id = oi.id
      LEFT JOIN users eu ON eu.id = r.entered_by
      LEFT JOIN users vu ON vu.id = r.validated_by
      WHERE oi.order_id = ?
      ORDER BY t.name
    `, [req.params.id]);
    res.json({ ...order, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/orders/:id/status
router.put('/:id/status', requireRole('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  const { status } = req.body;
  const valid = ['PENDING', 'IN_PROCESS', 'COMPLETED', 'DELIVERED'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await run(`UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    await auditLog(req.session.user.id, 'STATUS_CHANGE', 'order', req.params.id, { from: order.status, to: status });
    res.json(await get('SELECT * FROM orders WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

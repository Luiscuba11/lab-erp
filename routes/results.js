'use strict';

const express = require('express');
const router = express.Router();
const { run, get, all, transaction, calculateFlag, isCritical, auditLog, getAgeGroup } = require('../db/database');
const { requireRole } = require('../middleware/auth');

// POST /api/results/:orderItemId  — Enter a result (Technician/Admin)
router.post('/:orderItemId', requireRole('TECHNICIAN', 'ADMIN'), async (req, res) => {
  try {
    const { value, value_text, notes } = req.body;

    // Fetch order item with test & patient info
    const item = await get(`
      SELECT oi.id AS item_id, o.id AS order_id, o.status AS order_status,
        t.*, t.result_type, t.parameters,
        p.gender, p.dob
      FROM order_items oi
      JOIN test_catalog t ON t.id = oi.test_id
      JOIN orders o ON o.id = oi.order_id
      JOIN patients p ON p.id = o.patient_id
      WHERE oi.id = ?
    `, [req.params.orderItemId]);

    if (!item) return res.status(404).json({ error: 'Order item not found' });

    // Check if already locked
    const existing = await get('SELECT * FROM results WHERE order_item_id = ?', [item.item_id]);
    if (existing && existing.is_locked) {
      return res.status(409).json({ error: 'Result is validated and locked' });
    }

    const resultType = item.result_type || 'NUMERIC';

    let numVal = 0, flag = 'NORMAL', critical = 0, storedText = null;

    if (resultType === 'NUMERIC') {
      if (value === undefined || value === null || value === '') return res.status(400).json({ error: 'value is required' });
      numVal = parseFloat(value);
      if (isNaN(numVal)) return res.status(400).json({ error: 'value must be a number' });
      flag = calculateFlag(numVal, item, item.gender, item.dob);
      critical = isCritical(numVal, item, item.gender, item.dob) ? 1 : 0;
      storedText = String(numVal);
    } else if (resultType === 'MULTI_PARAMETER') {
      // value_text is JSON string of {paramId: value, ...}
      if (!value_text) return res.status(400).json({ error: 'value_text required for multi-parameter' });
      storedText = value_text;
      try {
        const params = JSON.parse(item.parameters || '[]');
        const vals = JSON.parse(value_text);
        let hasAbnormal = false;
        for (const param of params) {
          const v = vals[param.id];
          if (v === undefined || v === null || v === '') continue;
          if (param.type === 'NUMERIC') {
            const g = (item.gender || '').toUpperCase() === 'M' ? 'm' : 'f';
            const ag = getAgeGroup(item.dob);
            const ref = param.ref && param.ref[`${ag}_${g}`];
            if (ref && (parseFloat(v) < ref.min || parseFloat(v) > ref.max)) hasAbnormal = true;
          } else if (param.abnormal_values && param.abnormal_values.includes(v)) {
            hasAbnormal = true;
          } else if (param.abnormal_threshold !== undefined) {
            const idx = (param.options || []).indexOf(v);
            if (idx >= param.abnormal_threshold) hasAbnormal = true;
          }
        }
        flag = hasAbnormal ? 'ABNORMAL' : 'NORMAL';
        critical = 0;
      } catch (e) { flag = 'NORMAL'; }
    } else {
      // QUALITATIVE, SEMI_QUANTITATIVE, TITER, TEXT
      if (!value_text) return res.status(400).json({ error: 'value_text required' });
      storedText = value_text;
      if (resultType === 'TEXT') {
        flag = 'INFORMATIVO';
      } else {
        try {
          const params = JSON.parse(item.parameters || '[]');
          const firstParam = params[0];
          if (firstParam) {
            if (resultType === 'TITER' && firstParam.significant_threshold) {
              const sigIdx = (firstParam.options || []).indexOf(firstParam.significant_threshold);
              const valIdx = (firstParam.options || []).indexOf(value_text);
              flag = (sigIdx >= 0 && valIdx >= sigIdx) ? 'SIGNIFICANT' : 'NOT_SIGNIFICANT';
            } else if (firstParam.abnormal_values && firstParam.abnormal_values.includes(value_text)) {
              flag = 'ABNORMAL';
            } else if (firstParam.abnormal_threshold !== undefined) {
              const idx = (firstParam.options || []).indexOf(value_text);
              flag = (idx >= firstParam.abnormal_threshold) ? 'ABNORMAL' : 'NORMAL';
            }
          }
        } catch (e) { flag = 'NORMAL'; }
      }
    }

    await transaction(async () => {
      if (existing) {
        await run(`UPDATE results SET value=?, value_text=?, flag=?, is_critical=?, notes=?, entered_by=?, entered_at=datetime('now'),
            validated_by=NULL, validated_at=NULL, is_locked=0 WHERE order_item_id=?`,
          [numVal, storedText, flag, critical, notes || null, req.session.user.id, item.item_id]);
      } else {
        await run(`INSERT INTO results (order_item_id, value, value_text, flag, is_critical, notes, entered_by) VALUES (?,?,?,?,?,?,?)`,
          [item.item_id, numVal, storedText, flag, critical, notes || null, req.session.user.id]);
      }

      // Update order item status
      await run(`UPDATE order_items SET status='COMPLETED' WHERE id=?`, [item.item_id]);

      // If order was PENDING → IN_PROCESS
      if (item.order_status === 'PENDING') {
        await run(`UPDATE orders SET status='IN_PROCESS', updated_at=datetime('now') WHERE id=?`, [item.order_id]);
      }

      // Check if all items in the order are now completed
      const row = await get(`SELECT COUNT(*) AS pending FROM order_items WHERE order_id=? AND status!='COMPLETED'`, [item.order_id]);
      if (row.pending === 0) {
        await run(`UPDATE orders SET status='COMPLETED', updated_at=datetime('now') WHERE id=?`, [item.order_id]);
      }
    });

    // Auto-deduct supplies (only on first entry, not updates)
    if (!existing) {
      try {
        const oi = await get('SELECT test_id FROM order_items WHERE id=?', [item.item_id]);
        if (oi) {
          const supplies = await all(
            'SELECT ts.supply_id, ts.quantity_per_test FROM test_supplies ts WHERE ts.test_id=?',
            [oi.test_id]
          );
          for (const ts of supplies) {
            const sup = await get('SELECT * FROM supplies WHERE id=? AND active=1', [ts.supply_id]);
            if (sup) {
              const newStock = Math.max(0, sup.stock_current - ts.quantity_per_test);
              await run('INSERT INTO supply_movements (supply_id,type,quantity,reason,reference,user_id) VALUES (?,?,?,?,?,?)',
                [ts.supply_id,'OUT',ts.quantity_per_test,'Consumo por prueba',String(item.order_id),req.session.user.id]);
              await run(`UPDATE supplies SET stock_current=?,updated_at=datetime('now') WHERE id=?`, [newStock, ts.supply_id]);
            }
          }
        }
      } catch (_) { /* supply deduction is non-critical */ }
    }

    await auditLog(req.session.user.id, 'ENTER_RESULT', 'result', item.item_id, { value: numVal, value_text: storedText, flag, critical });
    const result = await get('SELECT * FROM results WHERE order_item_id = ?', [item.item_id]);
    res.status(existing ? 200 : 201).json({ result, flag, is_critical: critical });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/results/:id/validate  — Validate a result (Biochemist/Admin)
router.put('/:id/validate', requireRole('BIOCHEMIST', 'ADMIN'), async (req, res) => {
  try {
    const result = await get('SELECT * FROM results WHERE id = ?', [req.params.id]);
    if (!result) return res.status(404).json({ error: 'Result not found' });

    if (result.is_locked) {
      return res.status(409).json({ error: 'Result already validated' });
    }

    const { notes } = req.body;

    await run(`
      UPDATE results
      SET is_locked=1, validated_by=?, validated_at=datetime('now'), notes=COALESCE(?, notes)
      WHERE id=?
    `, [req.session.user.id, notes || null, req.params.id]);

    await auditLog(req.session.user.id, 'VALIDATE_RESULT', 'result', req.params.id, { notes });

    res.json(await get('SELECT * FROM results WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/results/order/:orderId/validate-all  — Validate all results in an order
router.put('/order/:orderId/validate-all', requireRole('BIOCHEMIST', 'ADMIN'), async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = await all(`
      SELECT r.id FROM results r
      JOIN order_items oi ON oi.id = r.order_item_id
      WHERE oi.order_id = ? AND r.is_locked = 0
    `, [req.params.orderId]);

    if (!items.length) {
      return res.status(400).json({ error: 'No unvalidated results found' });
    }

    await transaction(async () => {
      for (const item of items) {
        await run(`
          UPDATE results SET is_locked=1, validated_by=?, validated_at=datetime('now') WHERE id=?
        `, [req.session.user.id, item.id]);
      }
      // Mark order as DELIVERED once all validated
      await run(`UPDATE orders SET status='DELIVERED', updated_at=datetime('now') WHERE id=?`, [req.params.orderId]);
    });

    await auditLog(req.session.user.id, 'VALIDATE_ALL', 'order', req.params.orderId, { count: items.length });

    res.json({ validated: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

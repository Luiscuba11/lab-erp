'use strict';

const express = require('express');
const router  = express.Router();
const { run, get, all, transaction, auditLog } = require('../db/database');
const { requireRole } = require('../middleware/auth');

const CAN_VIEW   = requireRole('RECEPTIONIST','TECHNICIAN','BIOCHEMIST','ADMIN');
const CAN_MANAGE = requireRole('TECHNICIAN','ADMIN');
const ADMIN_ONLY = requireRole('ADMIN');

function supplyStatus(s) {
  if (s.stock_current < s.stock_critical) return 'CRITICO';
  if (s.stock_current < s.stock_min)      return 'BAJO';
  return 'OK';
}

// ── Stock list ─────────────────────────────────────────────────────────────

router.get('/', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM supplies WHERE active = 1 ORDER BY category, name');
    res.json(rows.map(s => ({ ...s, status: supplyStatus(s) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alerts ────────────────────────────────────────────────────────────────

router.get('/alerts', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM supplies WHERE active = 1 AND stock_current < stock_min
       ORDER BY stock_current / NULLIF(stock_critical, 0) ASC, name`
    );
    const items = rows.map(s => ({ ...s, status: supplyStatus(s) }));
    res.json({ critical: items.filter(s => s.status === 'CRITICO').length, low: items.filter(s => s.status === 'BAJO').length, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ABC Analysis ──────────────────────────────────────────────────────────

router.get('/abc', CAN_VIEW, async (req, res) => {
  try {
    // ABC by consumption value over last 90 days
    const movements = await all(`
      SELECT sm.supply_id, s.code, s.name, s.category, s.unit,
        s.price_per_unit, s.stock_current, s.stock_min, s.stock_critical,
        SUM(CASE WHEN sm.type='OUT' THEN sm.quantity ELSE 0 END) AS total_consumed
      FROM supplies s
      LEFT JOIN supply_movements sm ON sm.supply_id = s.id
        AND sm.type = 'OUT' AND sm.created_at >= datetime('now', '-90 days')
      WHERE s.active = 1
      GROUP BY s.id
      ORDER BY (COALESCE(SUM(CASE WHEN sm.type='OUT' THEN sm.quantity ELSE 0 END),0) * COALESCE(s.price_per_unit,0)) DESC
    `);
    const total = movements.reduce((s, m) => s + (m.total_consumed || 0) * (m.price_per_unit || 0), 0);
    let running = 0;
    const result = movements.map(m => {
      const value = (m.total_consumed || 0) * (m.price_per_unit || 0);
      running += value;
      const pct = total > 0 ? (running / total) * 100 : 0;
      const abc = pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C';
      return { ...m, value_consumed: value, cumulative_pct: pct, abc_class: abc, status: supplyStatus(m) };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Coverage projection ───────────────────────────────────────────────────

router.get('/coverage', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all(`
      SELECT s.*,
        COALESCE(
          s.stock_current / NULLIF(
            (SELECT SUM(sm.quantity) FROM supply_movements sm
             WHERE sm.supply_id = s.id AND sm.type='OUT'
               AND sm.created_at >= datetime('now','-30 days')) / 30.0,
          0), 9999) AS days_remaining
      FROM supplies s WHERE s.active = 1
      ORDER BY days_remaining ASC
    `);
    res.json(rows.map(s => ({ ...s, status: supplyStatus(s) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Single supply ─────────────────────────────────────────────────────────

router.get('/:id(\\d+)', CAN_VIEW, async (req, res) => {
  try {
    const s = await get('SELECT * FROM supplies WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json({ ...s, status: supplyStatus(s) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id(\\d+)/movements', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all(
      `SELECT sm.*, u.full_name AS user_name FROM supply_movements sm
       LEFT JOIN users u ON u.id = sm.user_id WHERE sm.supply_id = ?
       ORDER BY sm.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Create / Update / Delete supply ──────────────────────────────────────

router.post('/', ADMIN_ONLY, async (req, res) => {
  try {
    const { code, name, category, unit, stock_current=0, stock_min=0, stock_critical=0,
            supplier, notes, brand, price_per_unit=0, determinations_per_unit=1, lead_time_days=7 } = req.body;
    if (!code || !name || !category || !unit)
      return res.status(400).json({ error: 'Código, nombre, categoría y unidad son requeridos' });
    const r = await run(
      `INSERT INTO supplies (code,name,category,unit,stock_current,stock_min,stock_critical,
         supplier,notes,brand,price_per_unit,determinations_per_unit,lead_time_days)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code.toUpperCase(),name,category,unit,stock_current,stock_min,stock_critical,
       supplier||null,notes||null,brand||null,price_per_unit,determinations_per_unit,lead_time_days]
    );
    await auditLog(req.session.user.id,'CREATE','supplies',r.lastID,{code,name});
    const s = await get('SELECT * FROM supplies WHERE id = ?', [r.lastID]);
    res.status(201).json({ ...s, status: supplyStatus(s) });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'El código de insumo ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id(\\d+)', ADMIN_ONLY, async (req, res) => {
  try {
    const s = await get('SELECT * FROM supplies WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Insumo no encontrado' });
    const { name, category, unit, stock_min, stock_critical, supplier, notes,
            brand, price_per_unit, determinations_per_unit, lead_time_days } = req.body;
    await run(
      `UPDATE supplies SET name=?,category=?,unit=?,stock_min=?,stock_critical=?,
         supplier=?,notes=?,brand=?,price_per_unit=?,determinations_per_unit=?,lead_time_days=?,
         updated_at=datetime('now') WHERE id=?`,
      [name??s.name, category??s.category, unit??s.unit,
       stock_min??s.stock_min, stock_critical??s.stock_critical,
       supplier!==undefined?supplier:s.supplier, notes!==undefined?notes:s.notes,
       brand!==undefined?brand:s.brand,
       price_per_unit!==undefined?price_per_unit:s.price_per_unit,
       determinations_per_unit!==undefined?determinations_per_unit:s.determinations_per_unit,
       lead_time_days!==undefined?lead_time_days:s.lead_time_days,
       req.params.id]
    );
    await auditLog(req.session.user.id,'UPDATE','supplies',req.params.id,{name});
    const updated = await get('SELECT * FROM supplies WHERE id = ?', [req.params.id]);
    res.json({ ...updated, status: supplyStatus(updated) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id(\\d+)', ADMIN_ONLY, async (req, res) => {
  try {
    const s = await get('SELECT * FROM supplies WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Insumo no encontrado' });
    await run('UPDATE supplies SET active = 0 WHERE id = ?', [req.params.id]);
    await auditLog(req.session.user.id,'DELETE','supplies',req.params.id,{name:s.name});
    res.json({ message: 'Insumo eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stock movements ───────────────────────────────────────────────────────

router.post('/:id(\\d+)/movements', CAN_MANAGE, async (req, res) => {
  try {
    const s = await get('SELECT * FROM supplies WHERE id = ? AND active = 1', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Insumo no encontrado' });
    const { type, quantity, reason, reference } = req.body;
    if (!type || !quantity || quantity <= 0)
      return res.status(400).json({ error: 'Tipo y cantidad (> 0) son requeridos' });
    if (!['IN','OUT'].includes(type))
      return res.status(400).json({ error: 'Tipo debe ser IN o OUT' });
    const newStock = type === 'IN' ? s.stock_current + parseFloat(quantity) : s.stock_current - parseFloat(quantity);
    if (newStock < 0)
      return res.status(400).json({ error: `Stock insuficiente. Stock actual: ${s.stock_current} ${s.unit}` });
    await run('INSERT INTO supply_movements (supply_id,type,quantity,reason,reference,user_id) VALUES (?,?,?,?,?,?)',
      [req.params.id,type,parseFloat(quantity),reason||null,reference||null,req.session.user.id]);
    await run(`UPDATE supplies SET stock_current=?, updated_at=datetime('now') WHERE id=?`, [newStock, req.params.id]);
    await auditLog(req.session.user.id, type==='IN'?'STOCK_IN':'STOCK_OUT','supplies',req.params.id,{quantity,newStock,reason});
    const updated = await get('SELECT * FROM supplies WHERE id = ?', [req.params.id]);
    res.status(201).json({ ...updated, status: supplyStatus(updated) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Test-Supply linkages ──────────────────────────────────────────────────

// GET /api/supplies/test-links/:testId  — supplies for a test
router.get('/test-links/:testId(\\d+)', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all(`
      SELECT ts.*, s.code, s.name, s.unit, s.stock_current, s.category,
             s.price_per_unit, s.determinations_per_unit
      FROM test_supplies ts JOIN supplies s ON s.id = ts.supply_id
      WHERE ts.test_id = ? ORDER BY s.category, s.name
    `, [req.params.testId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/supplies/test-links  — all linkages
router.get('/test-links', CAN_VIEW, async (req, res) => {
  try {
    const rows = await all(`
      SELECT ts.id, ts.test_id, ts.supply_id, ts.quantity_per_test,
             t.code AS test_code, t.name AS test_name,
             s.code AS supply_code, s.name AS supply_name, s.unit
      FROM test_supplies ts
      JOIN test_catalog t ON t.id = ts.test_id
      JOIN supplies s ON s.id = ts.supply_id
      ORDER BY t.name, s.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/supplies/test-links  — add linkage
router.post('/test-links', ADMIN_ONLY, async (req, res) => {
  try {
    const { test_id, supply_id, quantity_per_test = 1 } = req.body;
    if (!test_id || !supply_id)
      return res.status(400).json({ error: 'test_id y supply_id son requeridos' });
    const r = await run(
      'INSERT OR REPLACE INTO test_supplies (test_id, supply_id, quantity_per_test) VALUES (?,?,?)',
      [test_id, supply_id, quantity_per_test]
    );
    const link = await get(`
      SELECT ts.*, t.name AS test_name, s.name AS supply_name, s.unit
      FROM test_supplies ts
      JOIN test_catalog t ON t.id = ts.test_id JOIN supplies s ON s.id = ts.supply_id
      WHERE ts.id = ?`, [r.lastID]);
    res.status(201).json(link);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Vínculo ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/supplies/test-links/:id
router.put('/test-links/:id(\\d+)', ADMIN_ONLY, async (req, res) => {
  try {
    const { quantity_per_test } = req.body;
    await run('UPDATE test_supplies SET quantity_per_test=? WHERE id=?', [quantity_per_test, req.params.id]);
    const link = await get('SELECT * FROM test_supplies WHERE id=?', [req.params.id]);
    res.json(link);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/supplies/test-links/:id
router.delete('/test-links/:id(\\d+)', ADMIN_ONLY, async (req, res) => {
  try {
    await run('DELETE FROM test_supplies WHERE id=?', [req.params.id]);
    res.json({ message: 'Vínculo eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Purchase Orders ───────────────────────────────────────────────────────

async function genPONumber() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const row = await get(`SELECT COUNT(*) AS n FROM purchase_orders WHERE date(created_at)=date('now')`);
  return `OC-${d}-${String((row?.n||0)+1).padStart(3,'0')}`;
}

router.get('/purchase-orders', CAN_VIEW, async (req, res) => {
  try {
    const orders = await all(`
      SELECT po.*, u.full_name AS created_by_name,
        COUNT(poi.id) AS item_count
      FROM purchase_orders po
      LEFT JOIN users u ON u.id = po.created_by
      LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      GROUP BY po.id ORDER BY po.created_at DESC LIMIT 100
    `);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/purchase-orders/:id(\\d+)', CAN_VIEW, async (req, res) => {
  try {
    const po = await get('SELECT po.*, u.full_name AS created_by_name FROM purchase_orders po LEFT JOIN users u ON u.id=po.created_by WHERE po.id=?', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'Orden no encontrada' });
    const items = await all(`
      SELECT poi.*, s.code, s.name AS supply_name, s.unit
      FROM purchase_order_items poi JOIN supplies s ON s.id = poi.supply_id
      WHERE poi.po_id = ?`, [req.params.id]);
    res.json({ ...po, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/purchase-orders', CAN_MANAGE, async (req, res) => {
  try {
    const { supplier, notes, items = [] } = req.body;
    if (!supplier) return res.status(400).json({ error: 'Proveedor es requerido' });
    if (!items.length) return res.status(400).json({ error: 'Al menos un ítem es requerido' });
    const po_number = await genPONumber();
    const total = items.reduce((s, i) => s + (parseFloat(i.quantity_ordered)||0)*(parseFloat(i.unit_price)||0), 0);
    const r = await run(
      `INSERT INTO purchase_orders (po_number, supplier, notes, total_amount, created_by) VALUES (?,?,?,?,?)`,
      [po_number, supplier, notes||null, total, req.session.user.id]
    );
    for (const item of items) {
      await run(`INSERT INTO purchase_order_items (po_id, supply_id, quantity_ordered, unit_price, brand, notes) VALUES (?,?,?,?,?,?)`,
        [r.lastID, item.supply_id, item.quantity_ordered, item.unit_price||0, item.brand||null, item.notes||null]);
    }
    await auditLog(req.session.user.id,'CREATE_PO','purchase_orders',r.lastID,{po_number,supplier});
    const po = await get('SELECT * FROM purchase_orders WHERE id=?',[r.lastID]);
    const poItems = await all('SELECT poi.*,s.name AS supply_name,s.unit FROM purchase_order_items poi JOIN supplies s ON s.id=poi.supply_id WHERE poi.po_id=?',[r.lastID]);
    res.status(201).json({ ...po, items: poItems });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/purchase-orders/:id(\\d+)/status', CAN_MANAGE, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['DRAFT','CONFIRMED','RECEIVED','CANCELLED'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
    const po = await get('SELECT * FROM purchase_orders WHERE id=?', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'Orden no encontrada' });
    await run(`UPDATE purchase_orders SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    // On RECEIVED: add stock movements
    if (status === 'RECEIVED') {
      const items = await all('SELECT * FROM purchase_order_items WHERE po_id=?', [req.params.id]);
      for (const item of items) {
        const s = await get('SELECT * FROM supplies WHERE id=?', [item.supply_id]);
        if (s) {
          const newStock = s.stock_current + item.quantity_ordered;
          await run('INSERT INTO supply_movements (supply_id,type,quantity,reason,reference,user_id) VALUES (?,?,?,?,?,?)',
            [item.supply_id,'IN',item.quantity_ordered,'Recepción OC',po.po_number,req.session.user.id]);
          await run(`UPDATE supplies SET stock_current=?,updated_at=datetime('now') WHERE id=?`,[newStock,item.supply_id]);
        }
      }
    }
    await auditLog(req.session.user.id,'UPDATE_PO_STATUS','purchase_orders',req.params.id,{status});
    res.json(await get('SELECT * FROM purchase_orders WHERE id=?',[req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/purchase-orders/:id(\\d+)', ADMIN_ONLY, async (req, res) => {
  try {
    await run('UPDATE purchase_orders SET status=? WHERE id=?', ['CANCELLED', req.params.id]);
    res.json({ message: 'Orden cancelada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

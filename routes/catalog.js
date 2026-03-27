'use strict';

const express = require('express');
const router = express.Router();
const { run, get, all, auditLog } = require('../db/database');
const { requireRole } = require('../middleware/auth');

// GET /api/catalog
router.get('/', requireRole('RECEPTIONIST', 'TECHNICIAN', 'BIOCHEMIST', 'ADMIN'), async (req, res) => {
  try {
    const tests = await all('SELECT * FROM test_catalog WHERE active = 1 ORDER BY name');
    res.json(tests);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/catalog/:id
router.get('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const test = await get('SELECT * FROM test_catalog WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json(test);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/catalog/:id
router.put('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const test = await get('SELECT * FROM test_catalog WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Prueba no encontrada' });

    const {
      name, sample_type, unit,
      result_type, parameters, price, estimated_time,
      ref_min_child_m, ref_max_child_m, ref_min_adult_m, ref_max_adult_m, ref_min_elder_m, ref_max_elder_m,
      ref_min_child_f, ref_max_child_f, ref_min_adult_f, ref_max_adult_f, ref_min_elder_f, ref_max_elder_f
    } = req.body;

    await run(`
      UPDATE test_catalog SET
        name=?, sample_type=?, unit=?,
        result_type=COALESCE(?,result_type), parameters=COALESCE(?,parameters),
        price=COALESCE(?,price), estimated_time=COALESCE(?,estimated_time),
        ref_min_child_m=?, ref_max_child_m=?, ref_min_adult_m=?, ref_max_adult_m=?, ref_min_elder_m=?, ref_max_elder_m=?,
        ref_min_child_f=?, ref_max_child_f=?, ref_min_adult_f=?, ref_max_adult_f=?, ref_min_elder_f=?, ref_max_elder_f=?
      WHERE id=?
    `, [
      name || test.name, sample_type || test.sample_type, unit || test.unit,
      result_type || null, parameters || null, price ?? null, estimated_time ?? null,
      ref_min_child_m ?? null, ref_max_child_m ?? null, ref_min_adult_m ?? null, ref_max_adult_m ?? null, ref_min_elder_m ?? null, ref_max_elder_m ?? null,
      ref_min_child_f ?? null, ref_max_child_f ?? null, ref_min_adult_f ?? null, ref_max_adult_f ?? null, ref_min_elder_f ?? null, ref_max_elder_f ?? null,
      req.params.id
    ]);

    await auditLog(req.session.user.id, 'UPDATE', 'test_catalog', req.params.id, { name });
    res.json(await get('SELECT * FROM test_catalog WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/catalog
router.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      code, name, sample_type, unit,
      result_type, parameters, price, estimated_time,
      ref_min_child_m, ref_max_child_m, ref_min_adult_m, ref_max_adult_m, ref_min_elder_m, ref_max_elder_m,
      ref_min_child_f, ref_max_child_f, ref_min_adult_f, ref_max_adult_f, ref_min_elder_f, ref_max_elder_f
    } = req.body;

    if (!code || !name || !sample_type || !unit) {
      return res.status(400).json({ error: 'Código, nombre, tipo de muestra y unidad son requeridos' });
    }

    const result = await run(`
      INSERT INTO test_catalog
        (code, name, sample_type, unit,
         result_type, parameters, price, estimated_time,
         ref_min_child_m, ref_max_child_m, ref_min_adult_m, ref_max_adult_m, ref_min_elder_m, ref_max_elder_m,
         ref_min_child_f, ref_max_child_f, ref_min_adult_f, ref_max_adult_f, ref_min_elder_f, ref_max_elder_f)
       VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?)
    `, [
      code.toUpperCase().trim(), name.trim(), sample_type.trim(), unit.trim(),
      result_type || 'NUMERIC', parameters || null, price ?? 0, estimated_time ?? 0,
      ref_min_child_m ?? null, ref_max_child_m ?? null, ref_min_adult_m ?? null, ref_max_adult_m ?? null,
      ref_min_elder_m ?? null, ref_max_elder_m ?? null,
      ref_min_child_f ?? null, ref_max_child_f ?? null, ref_min_adult_f ?? null, ref_max_adult_f ?? null,
      ref_min_elder_f ?? null, ref_max_elder_f ?? null,
    ]);

    await auditLog(req.session.user.id, 'CREATE', 'test_catalog', result.lastID, { code, name });
    res.status(201).json(await get('SELECT * FROM test_catalog WHERE id = ?', [result.lastID]));
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'El código de prueba ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/catalog/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const test = await get('SELECT * FROM test_catalog WHERE id = ?', [req.params.id]);
    if (!test) return res.status(404).json({ error: 'Prueba no encontrada' });

    const inUse = await get('SELECT COUNT(*) AS n FROM order_items WHERE test_id = ?', [req.params.id]);
    if (inUse && inUse.n > 0) {
      await run('UPDATE test_catalog SET active = 0 WHERE id = ?', [req.params.id]);
      await auditLog(req.session.user.id, 'DEACTIVATE', 'test_catalog', req.params.id, { name: test.name });
      return res.json({ message: 'Prueba desactivada (tiene órdenes asociadas)', deactivated: true });
    }

    await run('DELETE FROM test_catalog WHERE id = ?', [req.params.id]);
    await auditLog(req.session.user.id, 'DELETE', 'test_catalog', req.params.id, { name: test.name });
    res.json({ message: 'Prueba eliminada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

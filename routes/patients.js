'use strict';

const express = require('express');
const router = express.Router();
const { run, get, all, auditLog } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const CAN_ACCESS = ['RECEPTIONIST', 'ADMIN', 'BIOCHEMIST', 'TECHNICIAN'];
const CAN_WRITE  = ['RECEPTIONIST', 'ADMIN'];

// GET /api/patients/dni/:numero — Consulta RENIEC via VerificaPE
router.get('/dni/:numero', async (req, res) => {
  const { numero } = req.params;
  if (!/^\d{8}$/.test(numero)) {
    return res.status(400).json({ error: 'DNI debe tener 8 dígitos' });
  }
  try {
    const response = await fetch(
      `https://api.verificape.com/v2/dni/${numero}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.VERIFICAPE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!response.ok) throw new Error('No encontrado');
    const json = await response.json();
    const data = json.data || json;

    let fechaNacimiento = '';
    if (data.birthDate) {
      const partes = data.birthDate.split('/');
      if (partes.length === 3) {
        fechaNacimiento = `${partes[2]}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;
      }
    }

    let sexo = '';
    if (data.gender) {
      const g = data.gender.toUpperCase();
      sexo = g.includes('FEM') || g === 'F' ? 'F' : 'M';
    }

    res.json({
      nombres: data.names,
      apellidoPaterno: data.paternalSurname,
      apellidoMaterno: data.maternalSurname,
      nombreCompleto: data.fullName || `${data.names} ${data.paternalSurname} ${data.maternalSurname}`.trim(),
      fechaNacimiento,
      sexo
    });
  } catch (err) {
    res.status(404).json({ error: 'DNI no encontrado en RENIEC' });
  }
});

// GET /api/patients?search=
router.get('/', requireRole(...CAN_ACCESS), async (req, res) => {
  try {
    const search = `%${req.query.search || ''}%`;
    const patients = await all(`
      SELECT p.*, u.full_name AS created_by_name
      FROM patients p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.name LIKE ? OR p.id_number LIKE ? OR p.contact LIKE ?
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [search, search, search]);
    res.json(patients);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/patients
router.post('/', requireRole(...CAN_WRITE), async (req, res) => {
  const { name, dob, gender, id_number, contact } = req.body;
  if (!name || !dob || !gender || !id_number) {
    return res.status(400).json({ error: 'name, dob, gender, id_number are required' });
  }
  if (!['M', 'F'].includes(gender)) {
    return res.status(400).json({ error: 'gender must be M or F' });
  }

  try {
    const result = await run(
      'INSERT INTO patients (name, dob, gender, id_number, contact, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), dob, gender, id_number.trim(), contact || null, req.session.user.id]
    );
    const patient = await get('SELECT * FROM patients WHERE id = ?', [result.lastID]);
    await auditLog(req.session.user.id, 'CREATE', 'patient', patient.id, { name });
    res.status(201).json(patient);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A patient with this ID number already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patients/:id
router.get('/:id', requireRole(...CAN_ACCESS), async (req, res) => {
  try {
    const patient = await get(`
      SELECT p.*, u.full_name AS created_by_name
      FROM patients p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
    `, [req.params.id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/patients/:id
router.put('/:id', requireRole(...CAN_WRITE), async (req, res) => {
  try {
    const patient = await get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { name, dob, gender, id_number, contact } = req.body;
    if (!name || !dob || !gender || !id_number) {
      return res.status(400).json({ error: 'name, dob, gender, id_number are required' });
    }

    await run(
      'UPDATE patients SET name=?, dob=?, gender=?, id_number=?, contact=? WHERE id=?',
      [name.trim(), dob, gender, id_number.trim(), contact || null, req.params.id]
    );
    await auditLog(req.session.user.id, 'UPDATE', 'patient', req.params.id, { name });
    res.json(await get('SELECT * FROM patients WHERE id = ?', [req.params.id]));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'ID number already in use by another patient' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patients/:id/orders
router.get('/:id/orders', requireRole(...CAN_ACCESS), async (req, res) => {
  try {
    const patient = await get('SELECT id FROM patients WHERE id = ?', [req.params.id]);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const orders = await all(`
      SELECT o.*, u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS test_count,
        (SELECT COUNT(*) FROM order_items oi
           JOIN results r ON r.order_item_id = oi.id
           WHERE oi.order_id = o.id AND r.is_locked = 1) AS validated_count
      FROM orders o
      LEFT JOIN users u ON u.id = o.created_by
      WHERE o.patient_id = ?
      ORDER BY o.created_at DESC
    `, [req.params.id]);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

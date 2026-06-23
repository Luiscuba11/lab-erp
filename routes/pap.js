'use strict';

const express = require('express');
const router  = express.Router();
const { get, all, run } = require('../db/database');
const { requireAuth }   = require('../middleware/auth');

const BETHESDA = [
  { codigo: 'NILM',               label: 'NILM — Negativo para lesión intraepitelial',              nivel: 1 },
  { codigo: 'ASCUS',              label: 'ASCUS — Células escamosas atípicas de significado indeterminado', nivel: 2 },
  { codigo: 'AGUS',               label: 'AGUS — Células glandulares atípicas',                     nivel: 2 },
  { codigo: 'LSIL',               label: 'LSIL — Lesión intraepitelial de bajo grado',              nivel: 3 },
  { codigo: 'HSIL',               label: 'HSIL — Lesión intraepitelial de alto grado',              nivel: 4 },
  { codigo: 'CARCINOMA_ESCAMOSO', label: 'Carcinoma de células escamosas',                          nivel: 5 },
  { codigo: 'ADENOCARCINOMA',     label: 'Adenocarcinoma',                                          nivel: 5 },
  { codigo: 'INSATISFACTORIO',    label: 'Insatisfactorio — Muestra no evaluable',                  nivel: 0 },
];

const generarCodigo = async () => {
  const anio = new Date().getFullYear();
  await run(`
    INSERT INTO pap_correlativo (anio, ultimo_numero) VALUES (?, 1)
    ON CONFLICT(anio) DO UPDATE SET ultimo_numero = ultimo_numero + 1
  `, [anio]);
  const row = await get('SELECT ultimo_numero FROM pap_correlativo WHERE anio = ?', [anio]);
  return `PAP-${anio}-${String(row.ultimo_numero).padStart(4, '0')}`;
};

// GET /api/pap/bethesda
router.get('/bethesda', requireAuth, (req, res) => res.json(BETHESDA));

// GET /api/pap/paquetes
router.get('/paquetes', requireAuth, async (req, res) => {
  try {
    const paquetes = await all(`
      SELECT p.*,
        COUNT(r.id) as codificados,
        u.full_name as creado_por
      FROM pap_paquetes p
      LEFT JOIN pap_resultados r ON r.paquete_id = p.id
      LEFT JOIN users u ON u.id = p.created_by
      GROUP BY p.id ORDER BY p.created_at DESC
    `);
    res.json(paquetes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pap/paquetes/:id
router.get('/paquetes/:id', requireAuth, async (req, res) => {
  try {
    const paquete = await get('SELECT * FROM pap_paquetes WHERE id = ?', [req.params.id]);
    if (!paquete) return res.status(404).json({ error: 'No encontrado' });
    const resultados = await all('SELECT * FROM pap_resultados WHERE paquete_id = ? ORDER BY numero_lamina', [req.params.id]);
    res.json({ ...paquete, resultados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/pap/paquetes
router.post('/paquetes', requireAuth, async (req, res) => {
  const { nombre, fecha_recepcion, indicacion, hallazgos, observaciones, pacientes } = req.body;
  if (!nombre || !fecha_recepcion) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  try {
    const result = await run(`
      INSERT INTO pap_paquetes (nombre, fecha_recepcion, indicacion, hallazgos, observaciones, total_laminas, estado, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
    `, [nombre, fecha_recepcion, indicacion || 'PARTICULAR', hallazgos || '', observaciones || '', (pacientes || []).length, req.session.user.id]);

    const paqueteId = result.lastID;
    const codificados = [];
    for (const pac of pacientes) {
      const codigo = await generarCodigo();
      await run(`
        INSERT INTO pap_resultados
          (paquete_id, codigo, numero_lamina, ipress, paciente, edad, fecha_recepcion, indicacion, resultado_bethesda, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
      `, [paqueteId, codigo, pac.numero, pac.ipress, pac.nombre, pac.edad, fecha_recepcion, indicacion || 'PARTICULAR', pac.resultado_bethesda || 'NILM']);
      codificados.push({ ...pac, codigo });
    }
    res.json({ success: true, paqueteId, codificados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/pap/resultados/bulk — debe ir ANTES de /:id para no ser capturado
router.patch('/resultados/bulk', requireAuth, async (req, res) => {
  const { ids, resultado_bethesda, hallazgos, estado } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'Sin IDs' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await run(`
      UPDATE pap_resultados SET
        resultado_bethesda = COALESCE(?, resultado_bethesda),
        hallazgos          = COALESCE(?, hallazgos),
        estado             = COALESCE(?, estado),
        updated_at         = datetime('now','localtime')
      WHERE id IN (${placeholders})
    `, [resultado_bethesda, hallazgos, estado, ...ids]);
    res.json({ success: true, actualizados: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/pap/resultados/:id
router.patch('/resultados/:id', requireAuth, async (req, res) => {
  const { resultado_bethesda, hallazgos, observaciones, fecha_resultado, estado } = req.body;
  try {
    await run(`
      UPDATE pap_resultados SET
        resultado_bethesda = COALESCE(?, resultado_bethesda),
        hallazgos          = COALESCE(?, hallazgos),
        observaciones      = COALESCE(?, observaciones),
        fecha_resultado    = COALESCE(?, fecha_resultado),
        estado             = COALESCE(?, estado),
        updated_at         = datetime('now','localtime')
      WHERE id = ?
    `, [resultado_bethesda, hallazgos, observaciones, fecha_resultado, estado, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pap/resultados
router.get('/resultados', requireAuth, async (req, res) => {
  const { ipress, bethesda, estado, desde, hasta, q } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (ipress)   { where += ' AND r.ipress LIKE ?';                        params.push(`%${ipress}%`); }
  if (bethesda) { where += ' AND r.resultado_bethesda = ?';               params.push(bethesda); }
  if (estado)   { where += ' AND r.estado = ?';                           params.push(estado); }
  if (desde)    { where += ' AND r.fecha_recepcion >= ?';                 params.push(desde); }
  if (hasta)    { where += ' AND r.fecha_recepcion <= ?';                 params.push(hasta); }
  if (q)        { where += ' AND (r.paciente LIKE ? OR r.codigo LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  try {
    const resultados = await all(`
      SELECT r.*, p.nombre as paquete_nombre
      FROM pap_resultados r
      LEFT JOIN pap_paquetes p ON p.id = r.paquete_id
      ${where} ORDER BY r.created_at DESC LIMIT 500
    `, params);
    res.json(resultados);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/pap/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const total      = await get('SELECT COUNT(*) as n FROM pap_resultados');
    const porBethesda = await all(`SELECT resultado_bethesda, COUNT(*) as total FROM pap_resultados GROUP BY resultado_bethesda ORDER BY total DESC`);
    const porIpress   = await all(`SELECT ipress, COUNT(*) as total FROM pap_resultados GROUP BY ipress ORDER BY total DESC LIMIT 10`);
    res.json({ total: total.n, porBethesda, porIpress });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

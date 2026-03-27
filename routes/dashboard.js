'use strict';

const express = require('express');
const router = express.Router();
const { get, all } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [
      r1, r2, r3, r4, r5, r6,
      criticalResults, recentOrders, statusBreakdown
    ] = await Promise.all([
      get(`SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = date('now')`),
      get(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('PENDING', 'IN_PROCESS')`),
      get(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('COMPLETED','DELIVERED') AND date(updated_at) = date('now')`),
      get(`SELECT COUNT(*) AS n FROM orders WHERE status = 'DELIVERED' AND date(updated_at) = date('now')`),
      get(`SELECT COUNT(*) AS n FROM patients`),
      get(`SELECT COUNT(*) AS n FROM patients WHERE date(created_at) = date('now')`),
      all(`
        SELECT
          r.id AS result_id, r.value, r.flag, r.is_critical,
          t.name AS test_name, t.unit,
          t.ref_min_adult_m, t.ref_max_adult_m,
          p.name AS patient_name, p.id_number,
          o.order_number,
          o.id AS order_id
        FROM results r
        JOIN order_items oi ON oi.id = r.order_item_id
        JOIN test_catalog t ON t.id = oi.test_id
        JOIN orders o ON o.id = oi.order_id
        JOIN patients p ON p.id = o.patient_id
        WHERE r.is_critical = 1
          AND date(r.entered_at) = date('now')
        ORDER BY r.entered_at DESC
        LIMIT 20
      `),
      all(`
        SELECT o.*, p.name AS patient_name,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS test_count
        FROM orders o JOIN patients p ON p.id = o.patient_id
        WHERE date(o.created_at) = date('now')
        ORDER BY o.created_at DESC
        LIMIT 10
      `),
      all(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY status`)
    ]);

    res.json({
      todayOrders:    r1.n,
      pendingOrders:  r2.n,
      completedToday: r3.n,
      deliveredToday: r4.n,
      totalPatients:  r5.n,
      todayPatients:  r6.n,
      criticalResults,
      recentOrders,
      statusBreakdown
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

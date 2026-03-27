'use strict';

const express = require('express');
const router = express.Router();
const { get, all, getAgeGroup } = require('../db/database');

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED DESIGN SYSTEM
   ═══════════════════════════════════════════════════════════════════════════ */

const LAB = {
  name:     'BIO PAP',
  fullname: 'Laboratorio de Análisis Clínico',
  tagline:  'Prevenir es la Clave',
  address:  'Av. Mariscal Castilla N° 713, Huanta',
  phone:    '990 424 393',
  email:    'biopap.huanta@gmail.com',
};

// Inline SVG microscope logo — no emoji dependency
function logoSVG(size = 52, dark = true) {
  const bg   = dark ? '#0c1a2e' : '#1d4ed8';
  const fill = 'white';
  const acc  = 'rgba(147,197,253,.75)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="${size}" height="${size}">
    <rect width="60" height="60" rx="11" fill="${bg}"/>
    <rect x="27" y="4"   width="7.5" height="17"  rx="3.75" fill="${fill}"/>
    <rect x="20" y="19"  width="21"  height="7"   rx="3.5"  fill="${fill}"/>
    <rect x="41" y="15"  width="8"   height="21"  rx="4"    fill="${acc}"/>
    <rect x="20" y="33"  width="22"  height="5.5" rx="2.75" fill="${fill}"/>
    <rect x="26" y="38"  width="9"   height="16"  rx="4.5"  fill="${fill}"/>
    <rect x="14" y="54"  width="33"  height="7"   rx="3.5"  fill="${fill}"/>
    <circle cx="37" cy="33" r="3.5" fill="${acc}"/>
  </svg>`;
}

// Shared <head> with Google Fonts
function docHead(title, extraStyle = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 12.5px;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 860px; margin: 0 auto; padding: 28px; }

    /* ── Lab Letterhead ── */
    .letterhead {
      display: flex;
      align-items: stretch;
      margin-bottom: 20px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(12,26,46,.12);
    }
    .lh-left {
      background: linear-gradient(145deg, #0c1a2e 0%, #1e3a8a 100%);
      padding: 18px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
    }
    .lh-logo { flex-shrink: 0; }
    .lh-lab-name {
      font-size: 26px;
      font-weight: 900;
      color: #fff;
      letter-spacing: 4px;
      line-height: 1;
    }
    .lh-lab-name span { color: #93c5fd; }
    .lh-lab-sub   { font-size: 11px; color: rgba(255,255,255,.7); margin-top: 3px; letter-spacing: .3px; }
    .lh-lab-tag   { font-size: 10px; color: #93c5fd; margin-top: 2px; font-weight: 500; letter-spacing: 1px; }
    .lh-lab-info  { font-size: 10.5px; color: rgba(255,255,255,.6); margin-top: 7px; line-height: 1.7; }

    .lh-right {
      background: #f1f5f9;
      border-left: 1px solid #e2e8f0;
      padding: 16px 20px;
      text-align: right;
      min-width: 200px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
    }
    .lh-doc-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 700; }
    .lh-doc-num   { font-size: 20px; font-weight: 900; color: #1d4ed8; font-family: 'Courier New', monospace; letter-spacing: 1px; }
    .lh-doc-date  { font-size: 10.5px; color: #64748b; }

    /* ── Section blocks ── */
    .section { margin-bottom: 16px; }
    .section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #fff;
      background: linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%);
      padding: 6px 14px;
      border-radius: 6px 6px 0 0;
      margin-bottom: 0;
    }
    .section-body {
      border: 1px solid #e2e8f0;
      border-top: none;
      border-radius: 0 0 6px 6px;
      padding: 14px;
    }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 16px; }
    .info-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
    .info-item label {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: #64748b;
      font-weight: 700;
      display: block;
      margin-bottom: 2px;
    }
    .info-item span { font-weight: 600; font-size: 13px; color: #0f172a; }

    /* ── Results Table ── */
    table.results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.results-table thead th {
      background: #0f172a;
      color: rgba(255,255,255,.85);
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: .8px;
      font-weight: 700;
      padding: 9px 10px;
      text-align: left;
      border: none;
    }
    table.results-table thead th:first-child { border-radius: 0; }
    table.results-table tbody td {
      padding: 9px 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    table.results-table tbody tr:last-child td { border-bottom: none; }
    table.results-table tbody tr:nth-child(even) td { background: #f8fafc; }
    table.results-table tbody tr.critical-row td { background: #fff1f2 !important; }
    table.results-table tbody tr.multi-header td {
      background: linear-gradient(90deg, #eff6ff 0%, #f8fafc 100%);
      font-weight: 700;
      color: #1d4ed8;
      font-size: 12.5px;
      padding: 8px 10px;
      border-top: 2px solid #bfdbfe;
    }
    table.results-table tbody tr.multi-param td {
      padding: 7px 10px 7px 24px;
      font-size: 11.5px;
      border-bottom: 1px solid #f1f5f9;
    }

    /* Flag cells */
    .flag-chip {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 20px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: .3px;
      white-space: nowrap;
    }
    .flag-NORMAL     { background: #dcfce7; color: #166534; }
    .flag-HIGH       { background: #fee2e2; color: #991b1b; }
    .flag-LOW        { background: #dbeafe; color: #1e40af; }
    .flag-CRITICAL   { background: #991b1b; color: #fff; }
    .flag-ABNORMAL   { background: #fef9c3; color: #854d0e; }
    .flag-INFO       { background: #f1f5f9; color: #475569; }
    .flag-PENDING    { background: #f1f5f9; color: #94a3b8; font-style: italic; }

    .val-number { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; }
    .val-text   { font-style: italic; color: #334155; }

    .validated-check { color: #059669; font-size: 13px; font-weight: 700; }
    .validated-pending { color: #94a3b8; font-size: 11px; }

    /* ── Legend ── */
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      padding: 8px 12px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      font-size: 10.5px;
      color: #475569;
    }
    .legend strong { margin-right: 6px; }
    .legend-item { display: flex; align-items: center; gap: 5px; }

    /* ── Signature ── */
    .signature-section {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1.5px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      flex-wrap: wrap;
    }
    .sig-block { text-align: center; min-width: 200px; }
    .sig-line { border-top: 1.5px solid #334155; width: 200px; margin: 44px auto 6px; }
    .sig-name  { font-weight: 800; font-size: 13px; color: #0f172a; }
    .sig-title { font-size: 11px; color: #475569; margin-top: 1px; }
    .sig-reg   { font-size: 10px; color: #94a3b8; margin-top: 1px; }

    /* ── Page footer ── */
    .page-footer {
      margin-top: 20px;
      padding: 10px 0 0;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .page-footer strong { color: #475569; }

    /* ── Status badge ── */
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .3px;
    }
    .status-DELIVERED  { background: #dcfce7; color: #166534; }
    .status-COMPLETED  { background: #dbeafe; color: #1e40af; }
    .status-IN_PROCESS { background: #ffedd5; color: #9a3412; }
    .status-PENDING    { background: #f3e8ff; color: #6b21a8; }

    /* ── No-print actions ── */
    .no-print {
      margin-top: 28px;
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 20px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
    }
    .btn-print {
      padding: 11px 32px;
      background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(29,78,216,.3);
    }
    .btn-close {
      padding: 11px 24px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    @media print {
      body { padding: 0; background: #fff; }
      .page { padding: 12px; max-width: 100%; }
      .no-print { display: none !important; }
      @page { margin: 1cm; size: A4; }
      .letterhead { box-shadow: none; }
      .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table.results-table thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    ${extraStyle}
  </style>
</head>
<body>
<div class="page">`;
}

// Shared letterhead component
function letterhead(docLabel, docNumber, subInfo = '') {
  return `
  <div class="letterhead">
    <div class="lh-left">
      <div class="lh-logo">${logoSVG(52)}</div>
      <div>
        <div class="lh-lab-name">BIO<span> PAP</span></div>
        <div class="lh-lab-sub">${LAB.fullname}</div>
        <div class="lh-lab-tag">✦ ${LAB.tagline} ✦</div>
        <div class="lh-lab-info">${LAB.address}<br>${LAB.phone} &nbsp;·&nbsp; ${LAB.email}</div>
      </div>
    </div>
    <div class="lh-right">
      <div class="lh-doc-label">${docLabel}</div>
      <div class="lh-doc-num">${docNumber}</div>
      ${subInfo}
    </div>
  </div>`;
}

// Shared page footer
function pageFooter(extra = '') {
  return `
  <div class="page-footer">
    <span><strong>BIO PAP</strong> — ${LAB.fullname} &nbsp;·&nbsp; ${LAB.address} &nbsp;·&nbsp; ${LAB.phone}</span>
    <span>${extra || LAB.email}</span>
  </div>`;
}

// Print buttons
function printButtons(printLabel = 'Imprimir') {
  return `
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">${printLabel}</button>
    <button class="btn-close" onclick="window.close()">Cerrar</button>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RECEIPT  /report/receipt/:orderId
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/receipt/:orderId([0-9]+)', async (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');
  try {
    const order = await get(`
      SELECT o.*, p.name AS patient_name, p.id_number, p.contact,
        u.full_name AS created_by_name,
        pay.payment_method, pay.amount AS paid_amount,
        pay.created_at AS paid_at, cu.full_name AS cashier_name
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = o.created_by
      LEFT JOIN payments pay ON pay.order_id = o.id
      LEFT JOIN users cu ON cu.id = pay.user_id
      WHERE o.id = ?
      ORDER BY pay.created_at DESC LIMIT 1
    `, [req.params.orderId]);

    if (!order) return res.status(404).send('<h1>Orden no encontrada</h1>');

    const items = await all(`
      SELECT oi.*, t.name AS test_name, t.price
      FROM order_items oi
      JOIN test_catalog t ON t.id = oi.test_id
      WHERE oi.order_id = ? ORDER BY t.name
    `, [req.params.orderId]);

    const total     = (order.total_price || order.paid_amount || items.reduce((s, i) => s + (i.price || 0), 0));
    const payStatus = order.payment_status || 'PENDIENTE';
    const payMethod = order.payment_method || '—';
    const cashier   = order.cashier_name || order.created_by_name || '—';
    const now       = new Date().toLocaleString('es-ES');

    const statusConfig = {
      PAGADO:    { label: '✓ PAGADO',     bg: '#dcfce7', color: '#166534' },
      PENDIENTE: { label: '⏳ PENDIENTE', bg: '#fff7ed', color: '#9a3412' },
      CREDITO:   { label: '⊙ CRÉDITO',   bg: '#dbeafe', color: '#1e40af' },
      EXONERADO: { label: '◎ EXONERADO',  bg: '#f3e8ff', color: '#6b21a8' },
    };
    const st = statusConfig[payStatus] || { label: payStatus, bg: '#f1f5f9', color: '#475569' };

    const rowsHtml = items.map(i => `
      <tr>
        <td style="font-size:12px">${i.test_name}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:600">S/. ${(i.price || 0).toFixed(2)}</td>
      </tr>`).join('');

    const html = docHead(`Recibo — ${order.order_number}`, `
      .page { max-width: 420px; }
      .receipt-header { text-align: center; padding: 22px 20px 16px; background: linear-gradient(145deg, #0c1a2e 0%, #1e3a8a 100%); border-radius: 12px 12px 0 0; color: #fff; margin-bottom: 0; }
      .receipt-body   { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 18px; margin-bottom: 16px; }
      .r-name  { font-size: 20px; font-weight: 900; letter-spacing: 4px; }
      .r-name span { color: #93c5fd; }
      .r-sub   { font-size: 10px; opacity: .75; margin-top: 2px; }
      .r-order { font-size: 16px; font-weight: 800; font-family: 'Courier New', monospace; color: #1d4ed8; margin: 12px 0 2px; }
      .divider { border: none; border-top: 1px dashed #e2e8f0; margin: 14px 0; }
      .info-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f8fafc; }
      .info-row:last-child { border: none; }
      .info-row .label { color: #94a3b8; }
      .info-row .value { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #94a3b8; font-weight: 700; padding: 6px 0; border-bottom: 2px solid #f1f5f9; }
      td { padding: 7px 0; border-bottom: 1px solid #f8fafc; }
      .total-block { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 2px solid #0f172a; margin-top: 4px; }
      .total-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
      .total-value { font-size: 24px; font-weight: 900; color: #1d4ed8; font-family: 'Courier New', monospace; }
      .pay-chip { text-align: center; padding: 10px; border-radius: 8px; font-size: 14px; font-weight: 800; margin-top: 12px; letter-spacing: .5px; }
      .r-footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px; line-height: 1.9; }
    `) + `
  <div class="receipt-header">
    ${logoSVG(40)}
    <div class="r-name" style="margin-top:8px">BIO<span> PAP</span></div>
    <div class="r-sub">${LAB.fullname}</div>
  </div>
  <div class="receipt-body">
    <div class="r-order">${order.order_number}</div>
    <div style="font-size:10px;color:#94a3b8">Impreso: ${now}</div>

    <hr class="divider">

    <div class="info-row"><span class="label">Paciente</span><span class="value">${order.patient_name}</span></div>
    <div class="info-row"><span class="label">Documento</span><span class="value">${order.id_number || '—'}</span></div>
    <div class="info-row"><span class="label">Atendido por</span><span class="value">${cashier}</span></div>
    ${order.paid_at ? `<div class="info-row"><span class="label">Fecha de pago</span><span class="value">${new Date(order.paid_at).toLocaleString('es-ES')}</span></div>` : ''}
    <div class="info-row"><span class="label">Método de pago</span><span class="value">${payMethod}</span></div>

    <hr class="divider">

    <table>
      <thead><tr><th>Prueba</th><th style="text-align:right">Precio</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="total-block">
      <span class="total-label">Total</span>
      <span class="total-value">S/. ${total.toFixed(2)}</span>
    </div>

    <div class="pay-chip" style="background:${st.bg};color:${st.color}">${st.label}</div>

    <div class="r-footer">
      Gracias por confiar en BIO PAP<br>
      ${LAB.address}<br>
      ${LAB.phone} &nbsp;·&nbsp; ${LAB.email}
    </div>
  </div>
  ${printButtons('Imprimir Recibo')}
</div></body></html>`;

    res.send(html);
  } catch (err) { res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN REPORT  /report/:orderId
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/:orderId([0-9]+)', async (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');

  try {
    const order = await get(`
      SELECT o.*, p.name AS patient_name, p.dob, p.gender, p.id_number, p.contact,
        u.full_name AS created_by_name
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = ?
    `, [req.params.orderId]);

    if (!order) return res.status(404).send('<h1>Orden no encontrada</h1>');

    const items = await all(`
      SELECT oi.*,
        t.code, t.name AS test_name, t.sample_type, t.unit,
        t.result_type, t.parameters,
        t.ref_min_child_m, t.ref_max_child_m, t.ref_min_adult_m, t.ref_max_adult_m,
        t.ref_min_elder_m, t.ref_max_elder_m, t.ref_min_child_f, t.ref_max_child_f,
        t.ref_min_adult_f, t.ref_max_adult_f, t.ref_min_elder_f, t.ref_max_elder_f,
        r.value, r.value_text, r.flag, r.is_critical, r.notes AS result_notes,
        r.entered_at, r.validated_at, r.is_locked,
        eu.full_name AS entered_by_name,
        vu.full_name AS validated_by_name
      FROM order_items oi
      JOIN test_catalog t ON t.id = oi.test_id
      LEFT JOIN results r ON r.order_item_id = oi.id
      LEFT JOIN users eu ON eu.id = r.entered_by
      LEFT JOIN users vu ON vu.id = r.validated_by
      WHERE oi.order_id = ?
      ORDER BY t.name
    `, [req.params.orderId]);

    const ageGroup = getAgeGroup(order.dob);
    const g = order.gender === 'M' ? 'm' : 'f';

    function getRefRange(item) {
      const min = item[`ref_min_${ageGroup}_${g}`];
      const max = item[`ref_max_${ageGroup}_${g}`];
      if (min === null || min === undefined) return 'N/A';
      return `${min} – ${max}`;
    }

    function calcAge(dob) {
      const d = new Date(dob), now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
      return age;
    }

    function getFlagChip(flag, critical, rt) {
      if (rt === 'TEXT')  return `<span class="flag-chip flag-INFO">INFORMATIVO</span>`;
      if (!flag || flag === 'NORMAL') return `<span class="flag-chip flag-NORMAL">Normal</span>`;
      if (critical)       return `<span class="flag-chip flag-CRITICAL">⚠ CRÍTICO ${flag === 'HIGH' ? '▲' : '▼'}</span>`;
      if (flag === 'HIGH' || flag === 'SIGNIFICANT') return `<span class="flag-chip flag-HIGH">▲ ALTO</span>`;
      if (flag === 'LOW') return `<span class="flag-chip flag-LOW">▼ BAJO</span>`;
      if (flag === 'ABNORMAL') return `<span class="flag-chip flag-ABNORMAL">ANORMAL</span>`;
      return `<span class="flag-chip flag-INFO">${flag}</span>`;
    }

    function getDisplayValue(item) {
      const rt = item.result_type || 'NUMERIC';
      if (rt === 'NUMERIC') return item.value != null ? String(item.value) : null;
      return item.value_text || null;
    }

    function getNormalRef(item) {
      const rt = item.result_type || 'NUMERIC';
      if (rt === 'NUMERIC') return getRefRange(item);
      if (!item.parameters) return '—';
      try {
        const params = JSON.parse(item.parameters);
        const p = params[0];
        if (!p || !p.options) return '—';
        if (rt === 'TITER' && p.significant_threshold) return `Sig. desde ${p.significant_threshold}`;
        if (rt === 'SEMI_QUANTITATIVE' && p.abnormal_threshold != null) {
          const normals = p.options.slice(0, p.abnormal_threshold);
          return normals.length ? normals.join(' / ') : '—';
        }
        if (rt === 'QUALITATIVE' && p.abnormal_values) {
          const normals = p.options.filter(o => !p.abnormal_values.includes(o));
          return normals.join(' / ') || '—';
        }
      } catch(e) {}
      return '—';
    }

    function renderMultiRow(item) {
      if (!item.value_text) {
        return `<tr class="multi-header"><td colspan="7">${item.test_name}
          <span style="font-weight:400;font-size:10.5px;color:#64748b;margin-left:8px;">${item.sample_type}</span>
          </td></tr>
          <tr><td colspan="7" style="padding:10px 10px 10px 24px;color:#94a3b8;font-style:italic;font-size:11px;">
            Pendiente de resultado
          </td></tr>`;
      }
      let params = [], vals = {};
      try { params = JSON.parse(item.parameters || '[]'); } catch {}
      try { vals = JSON.parse(item.value_text); } catch {}

      const validatedCell = item.is_locked
        ? `<span class="validated-check">✓</span>`
        : `<span class="validated-pending">—</span>`;

      let rows = `<tr class="multi-header">
        <td colspan="7">${item.test_name}
          <span style="font-weight:400;font-size:10.5px;color:#1e40af;margin-left:8px;">${item.sample_type}</span>
        </td>
      </tr>`;

      for (const param of params) {
        const val = vals[String(param.id)];
        if (val === undefined || val === null || val === '') continue;
        const pType = param.type || 'NUMERIC';
        let pFlag = 'NORMAL', pCrit = false, refStr = '—';

        if (pType === 'NUMERIC') {
          const pVal = parseFloat(val);
          const ref = param.ref && (param.ref[`adult_${g}`] || param.ref[`child_${g}`] || param.ref[`elder_${g}`]);
          if (ref && !isNaN(pVal)) {
            if (pVal < ref.min)      pFlag = 'LOW';
            else if (pVal > ref.max) pFlag = 'HIGH';
            refStr = `${ref.min} – ${ref.max}`;
          }
        } else if (param.abnormal_values && param.abnormal_values.includes(val)) {
          pFlag = 'ABNORMAL';
        } else if (param.abnormal_threshold != null) {
          const idx = (param.options || []).indexOf(val);
          if (idx >= param.abnormal_threshold) pFlag = 'ABNORMAL';
        }

        const dispRt = pType === 'NUMERIC' ? 'NUMERIC' : 'QUALITATIVE';
        rows += `<tr class="multi-param">
          <td style="padding-left:24px;">${param.name || ''}</td>
          <td style="color:#94a3b8;font-size:11px;">${param.unit || ''}</td>
          <td style="text-align:center;"><span class="val-number">${val}</span></td>
          <td style="text-align:center;">${getFlagChip(pFlag, pCrit, dispRt)}</td>
          <td style="text-align:center;">${validatedCell}</td>
          <td style="color:#64748b;font-size:11px;">${param.unit || ''}</td>
          <td style="font-size:11px;color:#64748b;">${refStr}</td>
        </tr>`;
      }
      return rows;
    }

    const validator   = items.find(i => i.validated_by_name)?.validated_by_name || '—';
    const reportDate  = new Date().toLocaleString('es-ES', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const orderStatus = { PENDING: 'PENDIENTE', IN_PROCESS: 'EN PROCESO', COMPLETED: 'COMPLETADO', DELIVERED: 'ENTREGADO' }[order.status] || order.status;
    const ageLabel    = { child: 'Niño / Niña', adult: 'Adulto', elder: 'Adulto Mayor' }[ageGroup] || ageGroup;

    const rowsHtml = items.map(item => {
      const rt = item.result_type || 'NUMERIC';
      if (rt === 'MULTI_PARAMETER') return renderMultiRow(item);

      const dispVal = getDisplayValue(item);
      if (dispVal === null) {
        return `<tr>
          <td><strong>${item.test_name}</strong></td>
          <td style="color:#94a3b8;font-size:11px;">${item.sample_type || ''}</td>
          <td colspan="2" style="text-align:center;color:#cbd5e1;font-style:italic;font-size:11px;">— Pendiente —</td>
          <td style="text-align:center;"><span class="validated-pending">—</span></td>
          <td style="color:#64748b;font-size:11px;">${item.unit || ''}</td>
          <td style="color:#94a3b8;font-size:11px;">${getNormalRef(item)}</td>
        </tr>`;
      }

      const isText = rt === 'TEXT' || rt === 'QUALITATIVE' || rt === 'SEMI_QUANTITATIVE' || rt === 'TITER';
      const valCell = isText
        ? `<span class="val-text">${dispVal}</span>`
        : `<span class="val-number">${dispVal}</span>`;

      return `<tr class="${item.is_critical ? 'critical-row' : ''}">
        <td><strong>${item.test_name}</strong></td>
        <td style="color:#94a3b8;font-size:11px;">${item.sample_type || ''}</td>
        <td style="text-align:center;">${valCell}</td>
        <td style="text-align:center;">${getFlagChip(item.flag, item.is_critical, rt)}</td>
        <td style="text-align:center;">${item.is_locked ? '<span class="validated-check">✓ Validado</span>' : '<span class="validated-pending">Pendiente</span>'}</td>
        <td style="color:#64748b;font-size:11px;">${item.unit || ''}</td>
        <td style="font-size:11px;color:#64748b;">${getNormalRef(item)}</td>
      </tr>`;
    }).join('');

    const html = docHead(`Informe Laboratorio — ${order.order_number}`) +
    letterhead('N° de Orden', order.order_number, `
      <div class="lh-doc-date">Impreso: ${reportDate}</div>
      <div style="margin-top:6px"><span class="status-badge status-${order.status}">${orderStatus}</span></div>
    `) + `

  <!-- Información del Paciente -->
  <div class="section">
    <div class="section-title">Información del Paciente</div>
    <div class="section-body">
      <div class="info-grid">
        <div class="info-item" style="grid-column:1/3"><label>Nombre Completo</label><span style="font-size:16px;font-weight:800;">${order.patient_name}</span></div>
        <div class="info-item"><label>Grupo Etario</label><span>${ageLabel}</span></div>
        <div class="info-item"><label>Fecha de Nacimiento</label><span>${order.dob} <span style="font-weight:400;color:#64748b">(${calcAge(order.dob)} años)</span></span></div>
        <div class="info-item"><label>Sexo</label><span>${order.gender === 'M' ? 'Masculino' : 'Femenino'}</span></div>
        <div class="info-item"><label>N° Documento</label><span>${order.id_number || '—'}</span></div>
        <div class="info-item"><label>Contacto</label><span>${order.contact || '—'}</span></div>
      </div>
    </div>
  </div>

  <!-- Información de la Orden -->
  <div class="section">
    <div class="section-title">Información de la Orden</div>
    <div class="section-body">
      <div class="info-grid">
        <div class="info-item"><label>N° de Orden</label><span style="font-family:'Courier New',monospace;color:#1d4ed8">${order.order_number}</span></div>
        <div class="info-item"><label>Fecha de Registro</label><span>${new Date(order.created_at).toLocaleString('es-ES')}</span></div>
        <div class="info-item"><label>Registrado por</label><span>${order.created_by_name || '—'}</span></div>
        ${order.notes ? `<div class="info-item" style="grid-column:1/-1"><label>Observaciones</label><span style="font-weight:400">${order.notes}</span></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Resultados -->
  <div class="section">
    <div class="section-title">Resultados de Laboratorio</div>
    <table class="results-table">
      <thead>
        <tr>
          <th style="width:25%">Prueba</th>
          <th style="width:10%">Muestra</th>
          <th style="width:12%;text-align:center">Resultado</th>
          <th style="width:12%;text-align:center">Estado</th>
          <th style="width:12%;text-align:center">Validación</th>
          <th style="width:8%">Unidad</th>
          <th style="width:21%">Rango de Referencia</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>

  <!-- Leyenda -->
  <div class="legend">
    <strong>Referencias:</strong>
    <span class="legend-item"><span class="flag-chip flag-NORMAL" style="font-size:9.5px">Normal</span> Dentro del rango</span>
    <span class="legend-item"><span class="flag-chip flag-HIGH" style="font-size:9.5px">▲ Alto</span> Por encima del rango</span>
    <span class="legend-item"><span class="flag-chip flag-LOW" style="font-size:9.5px">▼ Bajo</span> Por debajo del rango</span>
    <span class="legend-item"><span class="flag-chip flag-CRITICAL" style="font-size:9.5px">⚠ Crítico</span> Valor crítico (&gt;2× rango)</span>
    <span style="margin-left:auto;color:#94a3b8">Ref. para: ${order.gender === 'M' ? 'Masculino' : 'Femenino'} · ${ageLabel}</span>
  </div>

  <!-- Firma -->
  <div class="signature-section">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">${validator}</div>
      <div class="sig-title">Bióloga — Citotecnóloga</div>
      <div class="sig-reg">CBP 4602 &nbsp;·&nbsp; SLC 2206</div>
    </div>
    <div style="text-align:right;font-size:10.5px;color:#94a3b8;max-width:280px;line-height:1.8;">
      Este informe ha sido generado electrónicamente.<br>
      Los valores de referencia pueden variar según el equipo y método utilizado.<br>
      Para consultas comuníquese con el laboratorio.
    </div>
  </div>

  ${pageFooter(`Informe N° ${order.order_number}`)}
  ${printButtons('Imprimir Informe')}
</div></body></html>`;

    res.send(html);
  } catch (err) { res.status(500).send(`<h1>Error al generar el informe</h1><pre>${err.message}</pre>`); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PURCHASE ORDER  /report/purchase-order/:id
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/purchase-order/:id([0-9]+)', async (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');
  try {
    const po = await get(`
      SELECT po.*, u.full_name AS created_by_name
      FROM purchase_orders po
      LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = ?
    `, [req.params.id]);

    if (!po) return res.status(404).send('<h1>Orden no encontrada</h1>');

    const items = await all(`
      SELECT poi.*, s.code, s.name AS supply_name, s.unit
      FROM purchase_order_items poi
      JOIN supplies s ON s.id = poi.supply_id
      WHERE poi.po_id = ?
    `, [req.params.id]);

    const stLabels = { DRAFT:'Borrador', CONFIRMED:'Confirmada', RECEIVED:'Recibida', CANCELLED:'Cancelada' };
    const stColors = { DRAFT:'#f1f5f9;color:#475569', CONFIRMED:'#dbeafe;color:#1e40af', RECEIVED:'#dcfce7;color:#166534', CANCELLED:'#fee2e2;color:#991b1b' };
    const now  = new Date().toLocaleString('es-ES', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const total = items.reduce((s, i) => s + (i.quantity_ordered * (i.unit_price || 0)), 0);

    const rowsHtml = items.map(i => `
      <tr>
        <td style="font-family:'Courier New',monospace;font-size:11px;color:#64748b">${i.code}</td>
        <td><strong>${i.supply_name}</strong></td>
        <td style="text-align:right;font-weight:600">${i.quantity_ordered} <span style="color:#94a3b8;font-size:11px">${i.unit || ''}</span></td>
        <td style="text-align:right;font-family:'Courier New',monospace">S/. ${Number(i.unit_price || 0).toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">S/. ${(i.quantity_ordered * (i.unit_price || 0)).toFixed(2)}</td>
        <td style="color:#64748b">${i.brand || '—'}</td>
        <td style="min-width:120px;border-bottom:1px solid #cbd5e1;"></td>
      </tr>`).join('');

    const html = docHead(`Orden de Compra — ${po.po_number}`) +
    letterhead('Orden de Compra', po.po_number, `
      <div class="lh-doc-date">${now}</div>
      <div style="margin-top:6px;font-size:11px;font-weight:600;background:${stColors[po.status] || '#f1f5f9;color:#475569'};padding:3px 10px;border-radius:20px;display:inline-block">
        ${stLabels[po.status] || po.status}
      </div>
    `) + `

  <div class="section">
    <div class="section-title">Detalles de la Orden</div>
    <div class="section-body">
      <div class="info-grid-2">
        <div class="info-item"><label>Proveedor</label><span style="font-size:15px">${po.supplier}</span></div>
        <div class="info-item"><label>Creada por</label><span>${po.created_by_name || '—'}</span></div>
        <div class="info-item"><label>Fecha</label><span>${new Date(po.created_at).toLocaleDateString('es-ES')}</span></div>
        <div class="info-item"><label>Estado</label><span>${stLabels[po.status] || po.status}</span></div>
        ${po.notes ? `<div class="info-item" style="grid-column:1/-1"><label>Notas</label><span style="font-weight:400">${po.notes}</span></div>` : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Ítems de la Orden</div>
    <table class="results-table">
      <thead>
        <tr>
          <th>Código</th>
          <th style="width:30%">Insumo</th>
          <th style="text-align:right">Cantidad</th>
          <th style="text-align:right">P. Unitario</th>
          <th style="text-align:right">Subtotal</th>
          <th>Marca</th>
          <th style="text-align:center">Firma Recepción</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;padding:12px 10px 0;border-top:2px solid #0f172a;margin-top:4px;">
      <div>
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-right:20px;">Total Estimado</span>
        <span style="font-size:22px;font-weight:900;color:#1d4ed8;font-family:'Courier New',monospace">S/. ${total.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="signature-section" style="margin-top:36px">
    <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Solicitante</div><div class="sig-title">Firma y Sello</div></div>
    <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Autorización</div><div class="sig-title">Dirección / Administración</div></div>
    <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Proveedor</div><div class="sig-title">Firma y Sello</div></div>
  </div>

  ${pageFooter()}
  ${printButtons('Imprimir Orden de Compra')}
</div></body></html>`;

    res.send(html);
  } catch (err) { res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   REPLENISHMENT REPORT  /report/supplies/replenish
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/supplies/replenish', async (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/');
  try {
    const supplies = await all(
      `SELECT * FROM supplies WHERE active = 1 AND stock_current < stock_min
       ORDER BY stock_current / NULLIF(stock_critical,0) ASC, name`
    );

    function getStatus(s) {
      if (s.stock_current < s.stock_critical)
        return { label: '⚠ CRÍTICO', chipClass: 'flag-CRITICAL' };
      return { label: '▼ BAJO', chipClass: 'flag-HIGH' };
    }

    const now = new Date().toLocaleString('es-ES', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });

    const critCount = supplies.filter(s => s.stock_current < s.stock_critical).length;
    const lowCount  = supplies.length - critCount;

    const rows = supplies.map(s => {
      const st = getStatus(s);
      const needed = Math.max(0, s.stock_min - s.stock_current);
      return `<tr>
        <td style="font-family:'Courier New',monospace;font-size:11px;color:#64748b">${s.code}</td>
        <td><strong>${s.name}</strong></td>
        <td style="color:#64748b;font-size:11px">${s.category}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${s.stock_current}</td>
        <td style="text-align:right;color:#64748b">${s.stock_min}</td>
        <td style="text-align:right;color:#94a3b8">${s.stock_critical}</td>
        <td style="text-align:right;font-weight:800;color:#1d4ed8">${needed}</td>
        <td style="color:#64748b;font-size:11px">${s.unit}</td>
        <td><span class="flag-chip ${st.chipClass}" style="font-size:10px">${st.label}</span></td>
        <td style="min-width:160px;border-bottom:1px solid #cbd5e1"></td>
      </tr>`;
    }).join('');

    const html = docHead('Orden de Reposición de Insumos') +
    letterhead('Reposición de Insumos', new Date().toLocaleDateString('es-ES'), `
      <div class="lh-doc-date">${now}</div>
      <div style="margin-top:4px;font-size:11px;color:#64748b">Generado por: ${req.session.user.full_name}</div>
    `) + `

  <!-- Resumen ejecutivo -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px;">
    <div style="padding:14px;border-radius:8px;background:#fff1f2;border:1px solid #fca5a5;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#dc2626">${critCount}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#991b1b;margin-top:2px">Críticos</div>
    </div>
    <div style="padding:14px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#d97706">${lowCount}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#92400e;margin-top:2px">Bajos</div>
    </div>
    <div style="padding:14px;border-radius:8px;background:#f0f9ff;border:1px solid #7dd3fc;text-align:center">
      <div style="font-size:28px;font-weight:900;color:#0284c7">${supplies.length}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#075985;margin-top:2px">Total a Reponer</div>
    </div>
  </div>

  ${supplies.length === 0
    ? `<div style="text-align:center;padding:40px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;color:#166534;font-weight:700;font-size:14px;">
        ✓ Todos los insumos tienen stock suficiente
       </div>`
    : `<div class="section">
        <div class="section-title">Insumos a Reponer</div>
        <table class="results-table">
          <thead>
            <tr>
              <th>Código</th><th>Nombre</th><th>Categoría</th>
              <th style="text-align:right">Stock Actual</th>
              <th style="text-align:right">Mínimo</th>
              <th style="text-align:right">Crítico</th>
              <th style="text-align:right">A Pedir</th>
              <th>Unidad</th>
              <th>Estado</th>
              <th style="text-align:center">N° Pedido / Obs.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}

  <div class="signature-section">
    <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Responsable de Almacén</div></div>
    <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Aprobado por</div></div>
  </div>

  ${pageFooter()}
  ${printButtons('Imprimir Reposición')}
</div></body></html>`;

    res.send(html);
  } catch (err) { res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre>`); }
});

module.exports = router;

'use strict';

const express  = require('express');
const router   = express.Router();
const puppeteer = require('puppeteer-core');
const { requireAuth } = require('../middleware/auth');

const getBrowser = async () => {
  return puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions'
    ]
  });
};

async function setupPage(browser, cookies) {
  const page = await browser.newPage();
  if (cookies) {
    const cookiePairs = cookies.split(';').map(c => {
      const [name, ...rest] = c.trim().split('=');
      return { name: name.trim(), value: rest.join('='), domain: 'localhost' };
    });
    await page.setCookie(...cookiePairs);
  }
  return page;
}

// GET /api/pdf/:orderId  — genera y descarga PDF del informe
router.get('/:orderId', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  let browser;
  try {
    const port = process.env.PORT || 3004;
    const url  = `http://localhost:${port}/report/${orderId}`;

    browser = await getBrowser();
    const page = await setupPage(browser, req.headers.cookie || '');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Inyectar CSS compacto para PDF
    await page.addStyleTag({ content: `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { font-size: 10px !important; line-height: 1.3 !important; margin: 0 !important; }
      .no-print, .btn-print, .btn-close { display: none !important; }
      .page {
        padding: 8px !important;
        max-width: 100% !important;
        box-shadow: none !important;
        margin: 0 !important;
      }
      .letterhead { padding: 8px 12px !important; margin-bottom: 6px !important; }
      .lab-name { font-size: 18px !important; }
      .lab-tagline, .lab-meta { font-size: 8px !important; }
      .doc-number { font-size: 16px !important; }
      .doc-date, .doc-status { font-size: 8px !important; }
      .section-block { margin-bottom: 5px !important; }
      .section-title { padding: 3px 10px !important; font-size: 8px !important; }
      .section-body { padding: 6px 10px !important; }
      .info-label { font-size: 7.5px !important; margin-bottom: 1px !important; }
      .info-value { font-size: 9px !important; }
      .patient-name { font-size: 13px !important; }
      .results-table th { padding: 4px 6px !important; font-size: 7.5px !important; }
      .results-table td { padding: 3px 6px !important; font-size: 9px !important; line-height: 1.2 !important; }
      .flag-chip, .badge { padding: 1px 4px !important; font-size: 7.5px !important; }
      .ref-legend { padding: 3px 6px !important; font-size: 7.5px !important; margin-bottom: 4px !important; }
      .signature-section { margin-top: 8px !important; padding: 6px 10px !important; }
      .sig-line { margin: 20px auto 3px !important; width: 160px !important; }
      .sig-label { font-size: 10px !important; }
      .sig-sublabel { font-size: 7px !important; }
      .page-footer { padding: 4px 10px !important; font-size: 7.5px !important; margin-top: 4px !important; }
      .results-table tbody tr { page-break-inside: avoid; }
    `});

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (err) {
    console.error('[PDF]', err.message);
    res.status(500).json({ error: 'Error generando PDF: ' + err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// POST /api/pdf/:orderId/whatsapp  — genera PDF y lo envía por WhatsApp
router.post('/:orderId/whatsapp', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  let browser;
  try {
    const { get } = require('../db/database');

    const order = await get(`
      SELECT o.*, p.name AS patient_name, p.contact
      FROM orders o
      JOIN patients p ON o.patient_id = p.id
      WHERE o.id = ?
    `, [orderId]);

    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (!order.contact) {
      return res.json({ sinTelefono: true, paciente: order.patient_name });
    }

    const port = process.env.PORT || 3004;
    const url  = `http://localhost:${port}/report/${orderId}`;

    browser = await getBrowser();
    const page = await setupPage(browser, req.headers.cookie || '');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();
    browser = null;

    // Subir PDF a Evolution API como media
    const phone     = order.contact.replace(/\D/g, '');
    const fullPhone = phone.startsWith('51') ? phone : `51${phone}`;
    const base64Puro = Buffer.isBuffer(pdf) ? pdf.toString('base64') : Buffer.from(pdf).toString('base64');

    console.log(`[PDF WhatsApp] base64 length: ${base64Puro.length}, starts: ${base64Puro.substring(0, 20)}`);

    const evPayload = Buffer.from(JSON.stringify({
      number:    fullPhone,
      mediatype: 'document',
      mimetype:  'application/pdf',
      media:     base64Puro,
      fileName:  `Resultados-BIO-PAP-${orderId}.pdf`,
      caption:   '📄 Informe de resultados - BIO PAP'
    }));

    const evStatusCode = await new Promise((resolve, reject) => {
      const http = require('http');
      const reqEv = http.request({
        hostname: 'localhost', port: 8080,
        path: '/message/sendMedia/biopap',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'biopap-evolution-key-2026',
          'Content-Length': evPayload.length
        }
      }, resEv => {
        let body = '';
        resEv.on('data', d => body += d);
        resEv.on('end', () => {
          console.log(`[PDF WhatsApp] Evolution response ${resEv.statusCode}: ${body.substring(0, 200)}`);
          if (resEv.statusCode >= 400) reject(new Error(`Evolution API: ${resEv.statusCode} ${body}`));
          else resolve(resEv.statusCode);
        });
      });
      reqEv.on('error', reject);
      reqEv.write(evPayload);
      reqEv.end();
    });

    console.log(`[PDF WhatsApp] Orden ${orderId} → ${fullPhone}: ENVIADO (${evStatusCode})`);
    res.json({ success: true, paciente: order.patient_name, phone: fullPhone });

  } catch (err) {
    console.error('[PDF WhatsApp]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

module.exports = router;

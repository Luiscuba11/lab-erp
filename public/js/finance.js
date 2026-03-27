/* ── Finance Dashboard Module ────────────────────────────────────────────── */
'use strict';

const Finance = (() => {

  let _editingFcId = null;

  async function load() {
    try {
      const stats = await API.getFinanceStats();
      renderSummary(stats);
      renderBarChart(stats.last30 || []);
      renderPaymentMethods(stats.byMethod || []);
      renderTopTests(stats.topTests || []);
      renderPnL(stats);
      renderFixedCosts(stats.fixedCosts || []);
    } catch (err) {
      App.toast('Error al cargar estadísticas: ' + err.message, 'error');
    }
  }

  function renderSummary(stats) {
    const el = document.getElementById('finance-summary');
    if (!el) return;
    const today   = stats.today   || {};
    const pending = stats.pending || {};
    const monthly = stats.monthly || {};
    const cards = [
      { label: 'Hoy',             value: `S/. ${(today.total_today || 0).toFixed(2)}`,   icon: '📅', color: 'var(--primary)' },
      { label: 'Este Mes',        value: `S/. ${(monthly.total || 0).toFixed(2)}`,        icon: '📆', color: 'var(--success)' },
      { label: 'Cobros Hoy',      value: today.payments_today || 0,                       icon: '📋', color: '#7b1fa2' },
      { label: 'Cobros Mes',      value: monthly.count || 0,                              icon: '📊', color: '#0097a7' },
      { label: 'Pendiente Cobro', value: `S/. ${(pending.total || 0).toFixed(2)}`,        icon: '⏳', color: 'var(--warning)' },
    ];
    el.innerHTML = cards.map(c => `
      <div class="card" style="text-align:center;padding:20px 16px;">
        <div style="font-size:28px;margin-bottom:4px;">${c.icon}</div>
        <div style="font-size:22px;font-weight:700;color:${c.color}">${c.value}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${c.label}</div>
      </div>
    `).join('');
  }

  function renderBarChart(daily) {
    const el = document.getElementById('finance-bar-chart');
    if (!el) return;
    if (!daily.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px;">Sin datos</div>';
      return;
    }
    const max = Math.max(...daily.map(d => d.total), 1);
    el.innerHTML = daily.map(d => {
      const pct = Math.max(4, Math.round((d.total / max) * 180));
      // backend returns 'day' field
      const dateStr = d.day || d.date || '';
      const label = dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
      return `
        <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:20px;" title="${dateStr}: S/. ${(d.total||0).toFixed(2)}">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;">${d.total > 0 ? 'S/'+Math.round(d.total) : ''}</div>
          <div style="width:100%;background:var(--primary);border-radius:3px 3px 0 0;height:${pct}px;opacity:0.85;"></div>
          <div style="font-size:8px;color:var(--text-muted);margin-top:3px;writing-mode:vertical-lr;transform:rotate(180deg);">${label}</div>
        </div>
      `;
    }).join('');
  }

  function renderPaymentMethods(methods) {
    const el = document.getElementById('finance-payment-methods');
    if (!el) return;
    if (!methods.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Sin datos</div>';
      return;
    }
    const total = methods.reduce((s, m) => s + (m.total || 0), 0);
    const colors = ['#1565c0','#1e88e5','#43a047','#fb8c00','#8e24aa','#e53935'];
    el.innerHTML = methods.map((m, i) => {
      const pct = total > 0 ? Math.round((m.total / total) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:12px;height:12px;border-radius:50%;background:${colors[i % colors.length]};flex-shrink:0;"></div>
          <div style="flex:1;font-size:13px;">${esc(m.payment_method || 'Sin método')}</div>
          <div style="font-size:11px;color:var(--text-muted);">${pct}%</div>
          <div style="font-weight:600;font-size:13px;">S/. ${(m.total||0).toFixed(2)}</div>
        </div>
        <div style="height:6px;background:#f0f0f0;border-radius:3px;margin-bottom:8px;">
          <div style="height:6px;background:${colors[i % colors.length]};border-radius:3px;width:${pct}%;"></div>
        </div>
      `;
    }).join('');
  }

  function renderTopTests(tests) {
    const tbody = document.getElementById('finance-top-tests-tbody');
    if (!tbody) return;
    if (!tests.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Sin datos</td></tr>`;
      return;
    }
    tbody.innerHTML = tests.map((t, i) => `
      <tr>
        <td style="font-weight:700;color:var(--text-muted)">#${i+1}</td>
        <td><strong>${esc(t.name || t.test_name || '')}</strong></td>
        <td style="text-align:right">${t.times || t.count || 0}</td>
        <td style="text-align:right;font-weight:700;color:var(--primary)">S/. ${(t.revenue||0).toFixed(2)}</td>
      </tr>
    `).join('');
  }

  function renderPnL(stats) {
    const el = document.getElementById('finance-pnl-cards');
    if (!el) return;
    const revenue = (stats.monthly?.total || 0);
    const costs   = (stats.monthlyFixed || 0);
    const margin  = (stats.netMargin ?? revenue - costs);
    el.innerHTML = `
      <div class="pnl-card">
        <label>Ingresos Mes</label>
        <div class="pnl-value" style="color:var(--primary)">S/. ${revenue.toFixed(2)}</div>
      </div>
      <div class="pnl-card pnl-negative">
        <label>Gastos Fijos (est. mensual)</label>
        <div class="pnl-value">S/. ${costs.toFixed(2)}</div>
      </div>
      <div class="pnl-card ${margin >= 0 ? 'pnl-positive' : 'pnl-negative'}">
        <label>Margen Neto</label>
        <div class="pnl-value">S/. ${margin.toFixed(2)}</div>
      </div>
    `;
  }

  function renderFixedCosts(list) {
    const tbody = document.getElementById('finance-fixed-costs-tbody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Sin gastos fijos registrados.</td></tr>`;
      return;
    }
    const typeLabels = { PERSONAL:'Personal', LOCAL:'Local', SERVICIOS:'Servicios', IMPUESTOS:'Impuestos', EQUIPOS:'Equipos', OTRO:'Otro' };
    tbody.innerHTML = list.map(c => {
      const monthly = c.period === 'MENSUAL' ? c.amount : c.amount / 12;
      return `
        <tr>
          <td><span class="badge">${typeLabels[c.type] || c.type}</span></td>
          <td>${esc(c.description)}</td>
          <td style="text-align:right;font-weight:600">S/. ${(c.amount||0).toFixed(2)}</td>
          <td>${c.period === 'MENSUAL' ? 'Mensual' : 'Anual'}</td>
          <td style="text-align:right;color:var(--text-muted);font-size:12px">S/. ${monthly.toFixed(2)}/mes</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="Finance.openFixedCost(${c.id})">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="Finance.deleteFixedCost(${c.id})">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openFixedCost(id) {
    _editingFcId = id || null;
    document.getElementById('fixed-cost-title').textContent = id ? 'Editar Gasto Fijo' : 'Nuevo Gasto Fijo';
    document.getElementById('fc-type').value = 'PERSONAL';
    document.getElementById('fc-period').value = 'MENSUAL';
    document.getElementById('fc-description').value = '';
    document.getElementById('fc-amount').value = '0';
    if (id) {
      try {
        const list = await API.getFixedCosts();
        const c = list.find(x => x.id === id);
        if (c) {
          document.getElementById('fc-type').value = c.type;
          document.getElementById('fc-period').value = c.period;
          document.getElementById('fc-description').value = c.description;
          document.getElementById('fc-amount').value = c.amount;
        }
      } catch(e) {}
    }
    App.openModal('modal-overlay-fixed-cost');
  }

  async function submitFixedCost() {
    const type = document.getElementById('fc-type').value;
    const period = document.getElementById('fc-period').value;
    const description = document.getElementById('fc-description').value.trim();
    const amount = parseFloat(document.getElementById('fc-amount').value);
    if (!description) return App.toast('Descripción requerida', 'error');
    if (!amount || isNaN(amount)) return App.toast('Monto inválido', 'error');
    try {
      if (_editingFcId) {
        await API.updateFixedCost(_editingFcId, { type, description, amount, period });
        App.toast('Gasto actualizado');
      } else {
        await API.createFixedCost({ type, description, amount, period });
        App.toast('Gasto registrado');
      }
      App.closeModal('modal-overlay-fixed-cost');
      load();
    } catch(err) { App.toast(err.message, 'error'); }
  }

  async function deleteFixedCost(id) {
    if (!confirm('¿Eliminar este gasto fijo?')) return;
    try {
      await API.deleteFixedCost(id);
      App.toast('Eliminado');
      load();
    } catch(err) { App.toast(err.message, 'error'); }
  }

  function exportData() {
    const from = document.getElementById('fin-export-from')?.value;
    const to   = document.getElementById('fin-export-to')?.value;
    API.exportFinance(from, to);
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, export: exportData, openFixedCost, submitFixedCost, deleteFixedCost };
})();

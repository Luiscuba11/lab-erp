/* ── Dashboard ────────────────────────────────────────────────────────────── */
'use strict';

const Dashboard = (() => {

  async function load() {
    const tbodyLoad = document.getElementById('recent-orders-tbody');
    if (tbodyLoad) tbodyLoad.innerHTML = `<tr><td colspan="5" class="table-empty">Cargando...</td></tr>`;
    try {
      const data = await API.getDashboardStats();
      renderStats(data);
      renderCritical(data.criticalResults || []);
      renderRecentOrders(data.recentOrders || []);
    } catch (err) {
      App.toast('Error al cargar el panel: ' + err.message, 'error');
    }

    // Load supply alerts separately (non-blocking)
    try {
      const alerts = await API.getSupplyAlerts();
      renderSupplyAlerts(alerts);
    } catch { /* ignore if supplies module not loaded */ }
  }

  function renderStats(data) {
    setText('stat-today',     data.todayOrders);
    setText('stat-pending',   data.pendingOrders);
    setText('stat-completed', data.completedToday);
    setText('stat-delivered', data.deliveredToday);
    setText('stat-patients',  data.totalPatients);
    setText('stat-patients-today', `${data.todayPatients} registrado(s) hoy`);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
  }

  function renderCritical(criticals) {
    const section = document.getElementById('critical-section');
    const tbody   = document.getElementById('critical-tbody');
    if (!criticals.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');

    tbody.innerHTML = criticals.map(c => `
      <tr>
        <td><strong>${esc(c.patient_name)}</strong><br><small class="text-muted">${esc(c.id_number)}</small></td>
        <td><a href="#" onclick="Dashboard.viewOrder(${c.order_id})" style="color:var(--primary);font-family:monospace">${esc(c.order_number)}</a></td>
        <td>${esc(c.test_name)}</td>
        <td><span class="badge badge-CRITICAL">${c.value} ${esc(c.unit)} !!!</span></td>
        <td class="text-muted">${c.ref_min_adult_m} – ${c.ref_max_adult_m} ${esc(c.unit)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="Dashboard.viewOrder(${c.order_id})">Ver Orden</button>
        </td>
      </tr>
    `).join('');
  }

  function renderRecentOrders(orders) {
    const tbody = document.getElementById('recent-orders-tbody');
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><span class="empty-icon">📋</span>Sin órdenes hoy</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><span style="font-family:monospace;font-size:12px;">${esc(o.order_number)}</span></td>
        <td>${esc(o.patient_name)}</td>
        <td>${o.test_count} ${o.test_count !== 1 ? 'pruebas' : 'prueba'}</td>
        <td>${App.statusBadge(o.status)}</td>
        <td class="text-muted">${App.formatDateTime(o.created_at)}</td>
      </tr>
    `).join('');
  }

  function renderSupplyAlerts(alerts) {
    const el = document.getElementById('dash-supply-alerts');
    if (!el) return;
    if (!alerts || (alerts.critical === 0 && alerts.low === 0)) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const top5 = (alerts.items || []).slice(0, 5);
    el.innerHTML = `
      <div class="card-header">
        <span class="card-title" style="color:var(--warning)">📦 Alertas de Insumos</span>
        <div>
          ${alerts.critical > 0 ? `<span class="badge badge-CRITICAL">${alerts.critical} CRÍTICO</span> ` : ''}
          ${alerts.low > 0 ? `<span class="badge" style="background:var(--warning);color:#fff">${alerts.low} BAJO</span>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="App.showSection('supplies')" style="margin-left:8px">Ver todos →</button>
        </div>
      </div>
      <div style="padding:8px 0;">
        ${top5.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
            <div>
              <strong>${esc(s.name)}</strong>
              <span class="text-muted text-sm" style="margin-left:8px">${s.stock_current} ${esc(s.unit)} restantes</span>
            </div>
            <span style="font-weight:600;color:${s.status === 'CRITICO' ? 'var(--danger)' : 'var(--warning)'}">
              ${s.status === 'CRITICO' ? '🔴 CRÍTICO' : '🟡 BAJO'}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function viewOrder(orderId) {
    // Switch to orders section and highlight the order
    App.showSection('orders');
    setTimeout(() => Orders.openDetail(orderId), 400);
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { load, viewOrder };
})();

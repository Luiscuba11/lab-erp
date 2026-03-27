/* ── Billing Module ───────────────────────────────────────────────────────── */
'use strict';

const Billing = (() => {
  let currentTab = 'pending';
  let payingOrderId = null;
  let payingOrderTotal = 0;

  async function load() {
    showTab('pending');
  }

  function showTab(tab) {
    currentTab = tab;
    const pendingPanel = document.getElementById('billing-pending-panel');
    const historyPanel = document.getElementById('billing-history-panel');
    const btnPending   = document.getElementById('billing-tab-pending');
    const btnHistory   = document.getElementById('billing-tab-history');

    if (tab === 'pending') {
      pendingPanel.classList.remove('hidden');
      historyPanel.classList.add('hidden');
      btnPending.style.background = 'var(--primary)';
      btnPending.style.color = '#fff';
      btnHistory.style.background = '';
      btnHistory.style.color = '';
      loadPending();
    } else {
      pendingPanel.classList.add('hidden');
      historyPanel.classList.remove('hidden');
      btnPending.style.background = '';
      btnPending.style.color = '';
      btnHistory.style.background = 'var(--primary)';
      btnHistory.style.color = '#fff';
      // Set default date range: last 30 days
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const toInput = document.getElementById('billing-to');
      const fromInput = document.getElementById('billing-from');
      if (toInput && !toInput.value) toInput.value = to.toISOString().slice(0,10);
      if (fromInput && !fromInput.value) fromInput.value = from.toISOString().slice(0,10);
      loadHistory();
    }
  }

  async function loadPending() {
    try {
      const orders = await API.getBillingPending();
      renderPending(orders);
    } catch (err) {
      App.toast('Error al cargar pendientes: ' + err.message, 'error');
    }
  }

  function renderPending(orders) {
    const tbody = document.getElementById('billing-pending-tbody');
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><span class="empty-icon">💰</span>No hay órdenes pendientes de pago</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><span style="font-family:monospace;font-weight:600;color:var(--primary)">${esc(o.order_number)}</span></td>
        <td>
          <strong>${esc(o.patient_name)}</strong>
          <div class="text-muted text-sm">${esc(o.patient_id_number || '')}</div>
        </td>
        <td>${o.test_count} prueba(s)</td>
        <td>${o.status ? App.statusBadge(o.status) : '<span class="text-muted text-sm">—</span>'}</td>
        <td style="text-align:right;font-weight:700;color:var(--primary)">S/. ${(o.total_price||0).toFixed(2)}</td>
        <td><span class="badge badge-pay-${(o.payment_status||'PENDIENTE').toLowerCase()}">${o.payment_status||'PENDIENTE'}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="Billing.openPay(${o.id}, ${o.total_price||0}, '${esc(o.order_number)}')">Cobrar</button>
          <button class="btn btn-outline btn-sm" style="margin-left:4px;" onclick="window.open('/report/receipt/${o.id}','_blank')">🖨</button>
        </td>
      </tr>
    `).join('');
  }

  async function loadHistory() {
    const from = document.getElementById('billing-from')?.value;
    const to   = document.getElementById('billing-to')?.value;
    try {
      const orders = await API.getBillingHistory(from, to);
      renderHistory(orders);
    } catch (err) {
      App.toast('Error al cargar historial: ' + err.message, 'error');
    }
  }

  function renderHistory(payments) {
    const tbody = document.getElementById('billing-history-tbody');
    if (!payments.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><span class="empty-icon">📋</span>No se encontraron registros en el rango seleccionado</td></tr>`;
      return;
    }
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td><span style="font-family:monospace;font-weight:600;color:var(--primary)">${esc(p.order_number)}</span></td>
        <td><strong>${esc(p.patient_name)}</strong></td>
        <td class="text-muted text-sm">${p.created_at ? p.created_at.slice(0,10) : '—'}</td>
        <td style="text-align:right;font-weight:700">S/. ${(p.amount||p.total_price||0).toFixed(2)}</td>
        <td>${esc(p.payment_method || '—')}</td>
        <td><span style="font-weight:600;color:var(--success)">PAGADO</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="window.open('/report/receipt/${p.order_id}','_blank')">🖨 Recibo</button>
        </td>
      </tr>
    `).join('');
  }

  function openPay(orderId, total, orderNum) {
    payingOrderId = orderId;
    payingOrderTotal = total;
    document.getElementById('billing-pay-title').textContent = `Registrar Pago — ${orderNum}`;
    document.getElementById('billing-pay-total').textContent = `S/. ${total.toFixed(2)}`;
    document.getElementById('billing-selected-method').value = '';
    document.getElementById('billing-pay-notes').value = '';
    // Reset button styles
    document.querySelectorAll('.pay-method-btn').forEach(b => {
      b.style.background = '#fff';
      b.style.borderColor = 'var(--border)';
      b.style.color = '';
    });
    App.openModal('modal-overlay-billing-pay');
  }

  function selectMethod(method) {
    document.getElementById('billing-selected-method').value = method;
    document.querySelectorAll('.pay-method-btn').forEach(b => {
      const selected = b.dataset.method === method;
      b.style.background = selected ? 'var(--primary)' : '#fff';
      b.style.borderColor = selected ? 'var(--primary)' : 'var(--border)';
      b.style.color = selected ? '#fff' : '';
    });
  }

  async function confirmPay() {
    const method = document.getElementById('billing-selected-method').value;
    const notes  = document.getElementById('billing-pay-notes').value;
    if (!method) {
      App.toast('Seleccione un método de pago', 'warning');
      return;
    }
    const btn = document.getElementById('btn-confirm-pay');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    try {
      await API.payOrder(payingOrderId, { payment_method: method, notes });
      App.toast('Pago registrado correctamente', 'success');
      App.closeModal('modal-overlay-billing-pay');
      loadPending();
    } catch (err) {
      App.toast('Error al registrar pago: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar Pago';
    }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, showTab, loadPending, loadHistory, openPay, selectMethod, confirmPay };
})();

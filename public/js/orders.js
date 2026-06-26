/* ── Orders Module ───────────────────────────────────────────────────────── */
'use strict';

const Orders = (() => {
  let allTests = [];
  let patientSearchTimer = null;

  async function load() {
    const status = document.getElementById('order-status-filter')?.value || '';
    try {
      const orders = await API.getOrders({ status });
      render(orders);
    } catch (err) {
      App.toast('Error al cargar órdenes: ' + err.message, 'error');
    }
  }

  function payLabel(status) {
    const labels = { PENDIENTE: 'Pendiente', PAGADO: 'Pagado', CREDITO: 'Crédito', EXONERADO: 'Exonerado' };
    return labels[status] || (status || 'Pendiente');
  }

  function render(orders) {
    const tbody = document.getElementById('orders-tbody');
    const user  = App.getUser();

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><span class="empty-icon">📋</span>No se encontraron órdenes</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const criticalBadge = o.critical_count > 0
        ? `<span class="badge badge-CRITICAL">${o.critical_count} CRITICAL</span>`
        : '<span class="text-muted text-sm">—</span>';

      return `
        <tr>
          <td>
            <a href="#" onclick="Orders.openDetail(${o.id}); return false;"
               style="font-family:monospace;font-size:12px;color:var(--primary);font-weight:600">${esc(o.order_number)}</a>
          </td>
          <td>
            <strong>${esc(o.patient_name)}</strong>
            <div class="text-muted text-sm">${esc(o.patient_id_number)}</div>
          </td>
          <td>
            ${o.test_count} ${o.test_count !== 1 ? 'pruebas' : 'prueba'}
            <div class="text-sm text-muted">${o.completed_count}/${o.test_count} ingresadas</div>
          </td>
          <td>${App.statusBadge(o.status)}</td>
          <td>${criticalBadge}</td>
          <td style="font-weight:600;color:var(--primary)">S/. ${o.total_price?.toFixed(2) || '0.00'}</td>
          <td><span class="badge badge-pay-${o.payment_status || 'PENDIENTE'}">${payLabel(o.payment_status)}</span></td>
          <td class="text-muted text-sm">${App.formatDateTime(o.created_at)}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="Orders.openDetail(${o.id})">Detalle</button>
            ${(o.completed_count > 0)
              ? `<button class="btn btn-sm btn-ghost" onclick="window.open('/report/${o.id}','_blank')">Informe</button>`
              : ''}
            ${(o.completed_count > 0)
              ? `<button class="btn btn-sm" onclick="Orders.enviarWhatsApp(${o.id})"
                   title="Enviar resultados por WhatsApp"
                   style="background:#25D366;border:none;color:white;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px">
                   📱 WhatsApp
                 </button>`
              : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openCreate() {
    // Load test catalog
    try {
      allTests = await API.getCatalog();
    } catch {
      App.toast('Error al cargar catálogo de pruebas', 'error');
      return;
    }

    // Reset form
    document.getElementById('order-patient-search').value = '';
    document.getElementById('order-patient-id').value = '';
    document.getElementById('order-notes').value = '';
    document.getElementById('order-selected-patient').classList.add('hidden');
    document.getElementById('order-patient-dropdown').classList.add('hidden');

    // Build test selector
    buildTestSelector();

    App.openModal('modal-overlay-order');
  }

  let selectedTestIds = new Set();

  function buildTestSelector() {
    selectedTestIds = new Set();
    const container = document.getElementById('test-catalog-selector');
    container.innerHTML = `
      <div class="test-search-bar">
        <input type="text" id="test-search-input" placeholder="Buscar prueba por nombre o muestra..."
               oninput="Orders.filterTests(this.value)" autocomplete="off">
      </div>
      <div id="test-list-body" class="test-list-body"></div>
      <div id="order-price-summary"></div>
    `;
    renderTestList('');
    updateTestCount();
  }

  function renderTestList(query) {
    const q = query.toLowerCase();
    const filtered = q
      ? allTests.filter(t =>
          t.name.toLowerCase().includes(q) ||
          t.sample_type.toLowerCase().includes(q) ||
          (t.code && t.code.toLowerCase().includes(q))
        )
      : allTests;

    // Selected tests first, then unselected
    const selected   = filtered.filter(t => selectedTestIds.has(t.id));
    const unselected = filtered.filter(t => !selectedTestIds.has(t.id));
    const ordered    = [...selected, ...unselected];

    const body = document.getElementById('test-list-body');
    if (!body) return;

    if (!ordered.length) {
      body.innerHTML = `<div class="test-empty">No se encontraron pruebas</div>`;
      return;
    }

    body.innerHTML = ordered.map(t => {
      const checked = selectedTestIds.has(t.id);
      const refM = (t.ref_min_adult_m != null && t.ref_max_adult_m != null)
        ? `${t.ref_min_adult_m}–${t.ref_max_adult_m} ${esc(t.unit)}`
        : null;
      return `
        <label class="test-list-row${checked ? ' selected' : ''}" data-test-id="${t.id}" onclick="">
          <input type="checkbox" name="order-test" value="${t.id}" ${checked ? 'checked' : ''}
                 onchange="Orders.toggleTest(${t.id}, this.checked)">
          <div class="test-list-info">
            <div class="test-list-name">${esc(t.name)}</div>
            <div class="test-list-meta">${esc(t.sample_type)} · ${esc(t.unit)}${refM ? ` <span class="test-ref">Ref: ${refM}</span>` : ''}</div>
          </div>
          <div style="font-size:12px;font-weight:600;color:var(--primary);white-space:nowrap;margin-left:8px;">S/. ${t.price?.toFixed(2) || '0.00'}</div>
        </label>
      `;
    }).join('');
  }

  function renderPriceSummary() {
    const catalog = allTests || [];
    const selectedIds = Array.from(document.querySelectorAll('.test-list-row.selected'))
      .map(el => parseInt(el.dataset.testId)).filter(Boolean);
    const selected = catalog.filter(t => selectedIds.includes(t.id));
    const total = selected.reduce((s, t) => s + (t.price || 0), 0);

    let el = document.getElementById('order-price-summary');
    if (!el) return;

    if (selected.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;">
        <table style="width:100%;font-size:12px;">
          ${selected.map(t => `<tr><td>${esc(t.name)}</td><td style="text-align:right;color:var(--text-muted)">S/. ${(t.price||0).toFixed(2)}</td></tr>`).join('')}
          <tr style="font-weight:700;border-top:1px solid var(--border);">
            <td>TOTAL</td>
            <td style="text-align:right;color:var(--primary);font-size:14px;">S/. ${total.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    `;
  }

  function filterTests(query) {
    renderTestList(query);
  }

  function toggleTest(id, checked) {
    if (checked) selectedTestIds.add(id);
    else selectedTestIds.delete(id);
    updateTestCount();
    // Re-render to reorder (selected to top) — preserve search query
    const q = document.getElementById('test-search-input')?.value || '';
    renderTestList(q);
    renderPriceSummary();
  }

  function updateTestCount() {
    const label = document.getElementById('test-count-label');
    if (label) {
      const n = selectedTestIds.size;
      label.textContent = n ? `${n} prueba(s) seleccionada(s)` : '';
    }
  }

  function searchPatient(query) {
    clearTimeout(patientSearchTimer);
    const dropdown = document.getElementById('order-patient-dropdown');

    if (!query || query.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }

    patientSearchTimer = setTimeout(async () => {
      try {
        const patients = await API.getPatients(query);
        if (!patients.length) {
          dropdown.innerHTML = `<div class="dropdown-item text-muted">No se encontraron pacientes</div>`;
        } else {
          dropdown.innerHTML = patients.slice(0, 8).map(p => `
            <div class="dropdown-item" onclick="Orders.selectPatient(${p.id}, '${esc(p.name)}', '${esc(p.id_number)}', '${esc(p.dob)}', '${p.gender}')">
              <strong>${esc(p.name)}</strong>
              <span class="text-muted text-sm" style="margin-left:8px">${esc(p.id_number)}</span>
            </div>
          `).join('');
        }
        dropdown.classList.remove('hidden');
      } catch { /* ignore */ }
    }, 300);
  }

  function selectPatient(id, name, idNum, dob, gender) {
    document.getElementById('order-patient-id').value = id;
    document.getElementById('order-patient-search').value = '';
    document.getElementById('order-patient-dropdown').classList.add('hidden');

    const chip = document.getElementById('order-selected-patient');
    chip.innerHTML = `
      <div class="selected-patient-chip">
        <div>
          <div class="chip-name">${esc(name)}</div>
          <div class="chip-meta">${esc(idNum)} · ${gender === 'M' ? 'Masculino' : 'Femenino'} · ${App.calcAge(dob)} años</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Orders.clearPatient()">✕</button>
      </div>
    `;
    chip.classList.remove('hidden');
  }

  function clearPatient() {
    document.getElementById('order-patient-id').value = '';
    document.getElementById('order-selected-patient').classList.add('hidden');
    document.getElementById('order-patient-search').value = '';
  }

  async function submit() {
    const patient_id = document.getElementById('order-patient-id').value;
    const notes      = document.getElementById('order-notes').value.trim();
    const test_ids   = Array.from(selectedTestIds);

    if (!patient_id) {
      App.toast('Por favor seleccione un paciente', 'warning');
      return;
    }
    if (!test_ids.length) {
      App.toast('Por favor seleccione al menos una prueba', 'warning');
      return;
    }

    try {
      const order = await API.createOrder({ patient_id: parseInt(patient_id), notes, test_ids });
      App.toast(`Orden ${order.order_number} creada`, 'success');
      App.closeModal('modal-overlay-order');
      load();
      App.workflowAdvance('orders');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function openDetail(orderId) {
    try {
      const order = await API.getOrder(orderId);
      showDetailModal(order);
    } catch (err) {
      App.toast('Error al cargar la orden: ' + err.message, 'error');
    }
  }

  function showDetailModal(order) {
    // We'll show the detail in the result entry modal (re-used as read-only detail)
    const modal = document.getElementById('modal-overlay-result');
    const title = document.getElementById('result-modal-title');
    const body  = document.getElementById('result-modal-body');
    const btn   = document.getElementById('btn-save-results');

    title.textContent = `Orden ${order.order_number}`;
    btn.classList.add('hidden');

    const patientAge = App.calcAge(order.patient_dob);
    const ageGroup = patientAge < 18 ? 'child' : patientAge < 65 ? 'adult' : 'elder';
    const g = order.patient_gender === 'M' ? 'm' : 'f';

    function getRef(item) {
      const min = item[`ref_min_${ageGroup}_${g}`];
      const max = item[`ref_max_${ageGroup}_${g}`];
      if (min == null) return 'N/A';
      return `${min} – ${max} ${item.unit}`;
    }

    body.innerHTML = `
      <div class="order-detail-header">
        <div class="info-grid">
          <div class="info-item"><label>Paciente</label><span>${esc(order.patient_name)}</span></div>
          <div class="info-item"><label>N° Doc.</label><span>${esc(order.patient_id_number)}</span></div>
          <div class="info-item"><label>F. Nac.</label><span>${esc(order.patient_dob)} (${patientAge} años)</span></div>
          <div class="info-item"><label>Sexo</label><span>${order.patient_gender === 'M' ? 'Masculino' : 'Femenino'}</span></div>
          <div class="info-item"><label>Estado</label><span>${App.statusBadge(order.status)}</span></div>
          <div class="info-item"><label>Creado</label><span>${App.formatDateTime(order.created_at)}</span></div>
          ${order.notes ? `<div class="info-item" style="grid-column:1/-1"><label>Notas</label><span>${esc(order.notes)}</span></div>` : ''}
        </div>
      </div>
      <h4 style="margin-bottom:10px;font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Resultados de Pruebas</h4>
      <table class="data-table">
        <thead>
          <tr><th>Prueba</th><th>Muestra</th><th>Resultado</th><th>Estado</th><th>Val. Referencia</th><th>Validado</th></tr>
        </thead>
        <tbody>
          ${order.items.map(item => `
            <tr>
              <td><strong>${esc(item.test_name)}</strong></td>
              <td>${esc(item.sample_type)}</td>
              <td>${item.value != null ? `<strong>${item.value} ${esc(item.unit)}</strong>` : '<span class="text-muted">Pendiente</span>'}</td>
              <td>${item.value != null ? App.flagBadge(item.flag, item.is_critical) : '—'}</td>
              <td class="text-muted text-sm">${getRef(item)}</td>
              <td>${item.is_locked
                ? `<span style="color:var(--success)">✓ ${esc(item.validated_by_name)}</span>`
                : '<span class="text-muted">—</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:16px;text-align:right;">
        <button class="btn btn-outline btn-sm" onclick="window.open('/report/${order.id}', '_blank')">🖨 Imprimir Informe</button>
      </div>
    `;

    App.openModal('modal-overlay-result');
  }

  async function enviarWhatsApp(orderId) {
    try {
      App.toast('Enviando WhatsApp...', 'info', 2000);

      const response = await fetch(`/api/orders/${orderId}/whatsapp`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Error del servidor');
      const data = await response.json();

      if (data.sinTelefono) {
        App.toast(`⚠️ ${data.paciente} no tiene teléfono registrado`, 'warning', 4000);
      } else {
        App.toast(`✅ WhatsApp enviado a ${data.paciente}`, 'success', 3000);
      }
    } catch (err) {
      App.toast('Error enviando WhatsApp', 'error');
    }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, openCreate, searchPatient, selectPatient, clearPatient, submit, openDetail, updateTestCount, filterTests, toggleTest, renderPriceSummary, enviarWhatsApp };
})();

/* ── Results Module (Entry + Validation) ─────────────────────────────────── */
'use strict';

const Results = (() => {
  let currentOrder = null;
  let currentRefRanges = {};
  let lastEntryOrders = [];
  let lastValidationOrders = [];

  function filterBySearch(orders, query) {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.patient_name || '').toLowerCase().includes(q)
    );
  }

  // ─── Results Entry (Technician) ──────────────────────────────────────────

  async function loadEntry() {
    const tbodyLoad = document.getElementById('results-entry-tbody');
    if (tbodyLoad) tbodyLoad.innerHTML = `<tr><td colspan="6" class="table-empty">Cargando...</td></tr>`;
    try {
      // Show orders that need results entered (PENDING or IN_PROCESS)
      const orders = await API.getOrders({ limit: 100 });
      const pending = orders.filter(o => o.status === 'PENDING' || o.status === 'IN_PROCESS');
      lastEntryOrders = pending;
      renderEntryList(filterBySearch(pending, document.getElementById('results-entry-search')?.value || ''));
    } catch (err) {
      App.toast('Error al cargar órdenes: ' + err.message, 'error');
    }
  }

  function searchEntry(query) {
    renderEntryList(filterBySearch(lastEntryOrders, query));
  }

  function renderEntryList(orders) {
    const tbody = document.getElementById('results-entry-tbody');

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><span class="empty-icon">🧪</span>No hay órdenes pendientes. ¡Todos los resultados han sido ingresados!</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const progress = `${o.completed_count}/${o.test_count}`;
      const pct = o.test_count > 0 ? Math.round((o.completed_count / o.test_count) * 100) : 0;
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:12px;font-weight:600;color:var(--primary)">${esc(o.order_number)}</span></td>
          <td>
            <strong>${esc(o.patient_name)}</strong>
            <div class="text-muted text-sm">${esc(o.patient_id_number)} · ${o.patient_gender === 'M' ? 'M' : 'F'} · ${App.calcAge(o.patient_dob)} años</div>
          </td>
          <td>${o.test_count} ${o.test_count !== 1 ? 'pruebas' : 'prueba'}</td>
          <td>
            <span>${progress}</span>
            <div style="height:4px;background:#e0e0e0;border-radius:2px;margin-top:4px;width:80px;">
              <div style="height:4px;background:var(--primary);border-radius:2px;width:${pct}%"></div>
            </div>
          </td>
          <td>${App.statusBadge(o.status)}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="Results.openEntryModal(${o.id})">Ingresar Resultados</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openEntryModal(orderId) {
    try {
      const order = await API.getOrder(orderId);
      currentOrder = order;
      buildEntryModal(order);
      App.openModal('modal-overlay-result');
    } catch (err) {
      App.toast('Error al cargar la orden: ' + err.message, 'error');
    }
  }

  function buildEntryModal(order) {
    const title = document.getElementById('result-modal-title');
    const body  = document.getElementById('result-modal-body');
    const btn   = document.getElementById('btn-save-results');

    title.textContent = `Ingresar Resultados — ${order.order_number}`;
    btn.classList.remove('hidden');

    const patientAge = App.calcAge(order.patient_dob);
    const ageGroup = patientAge < 18 ? 'child' : patientAge < 65 ? 'adult' : 'elder';
    const g = order.patient_gender === 'M' ? 'm' : 'f';

    const ageGroupLabel = ageGroup === 'child' ? 'niño' : ageGroup === 'adult' ? 'adulto' : 'adulto mayor';

    // Store ref ranges for live flag calculation (NUMERIC tests)
    currentRefRanges = {};
    for (const item of order.items) {
      currentRefRanges[item.id] = {
        min: item[`ref_min_${ageGroup}_${g}`],
        max: item[`ref_max_${ageGroup}_${g}`],
        unit: item.unit
      };
    }

    body.innerHTML = `
      <div class="order-detail-header" style="margin-bottom:16px;">
        <div class="info-grid">
          <div class="info-item"><label>Paciente</label><span>${esc(order.patient_name)}</span></div>
          <div class="info-item"><label>F. Nac.</label><span>${esc(order.patient_dob)} (${patientAge} años, ${ageGroupLabel})</span></div>
          <div class="info-item"><label>Sexo</label><span>${order.patient_gender === 'M' ? 'Masculino' : 'Femenino'}</span></div>
        </div>
      </div>

      <div id="result-entry-rows">
        ${order.items.map(item => {
          const rt = item.result_type || 'NUMERIC';
          const isLocked = item.is_locked;
          const existingResult = {
            value: item.value,
            value_text: item.value_text,
            flag: item.flag
          };

          if (isLocked) {
            const rt2 = item.result_type || 'NUMERIC';
            let displayVal;
            if (rt2 === 'NUMERIC') {
              displayVal = item.value != null ? `${item.value} ${esc(item.unit)}` : '—';
            } else if (rt2 === 'MULTI_PARAMETER') {
              let paramCount = 0;
              try { paramCount = Object.keys(JSON.parse(item.value_text || '{}')).length; } catch {}
              displayVal = `${paramCount} parámetro(s)`;
            } else {
              displayVal = item.value_text || '—';
            }
            return `
              <div class="result-entry-row" id="row-${item.id}" style="grid-template-columns:1fr auto auto;">
                <div>
                  <div class="test-name">${esc(item.test_name)}</div>
                  <div class="test-meta">${esc(item.sample_type)} · ${esc(item.unit)}</div>
                  <div style="color:var(--success);font-size:11px;font-weight:600;">✓ Validado</div>
                </div>
                <div style="font-weight:700;font-size:14px;">${displayVal}</div>
                <div></div>
              </div>
            `;
          }

          if (rt === 'MULTI_PARAMETER') {
            let params = [];
            try { params = JSON.parse(item.parameters || '[]'); } catch {}
            return `
              <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:12px;" id="row-${item.id}">
                <div style="font-weight:700;margin-bottom:8px;font-size:13px;">${esc(item.test_name)}
                  <span class="text-muted text-sm" style="margin-left:4px;">${esc(item.sample_type)}</span>
                </div>
                ${buildResultInput(item, existingResult, ageGroup, g)}
              </div>
            `;
          }

          const ref = currentRefRanges[item.id];
          const refStr = (ref && ref.min != null) ? `${ref.min} – ${ref.max}` : 'N/A';
          const existingVal = item.value != null ? item.value : (item.value_text || '');
          const existingFlag = item.flag || '';

          return `
            <div class="result-entry-row" id="row-${item.id}">
              <div>
                <div class="test-name">${esc(item.test_name)}</div>
                <div class="test-meta">${esc(item.sample_type)} · ${esc(item.unit)}</div>
              </div>
              ${buildResultInput(item, existingResult, ageGroup, g)}
              <div id="flag-${item.id}" class="result-flag-preview ${existingFlag ? 'badge badge-' + existingFlag : ''}">
                ${existingFlag || '—'}
              </div>
              <div class="text-muted text-sm">${refStr} ${esc(item.unit)}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="margin-top:12px;padding:10px 12px;background:var(--primary-light);border-radius:var(--radius);font-size:12px;color:var(--text-muted);">
        Valores de referencia para: <strong>${order.patient_gender === 'M' ? 'Masculino' : 'Femenino'}</strong>, <strong>${ageGroupLabel}</strong> (${patientAge} años)
      </div>
    `;
  }

  function buildResultInput(item, existing, ageGroup, g) {
    const rt = item.result_type || 'NUMERIC';
    const currentVal = existing?.value_text || (existing?.value != null ? existing.value : '');

    if (rt === 'NUMERIC') {
      return `<input type="number" step="any"
                 id="val-${item.id}"
                 data-item-id="${item.id}"
                 value="${currentVal !== 0 && currentVal !== '0' ? currentVal : (currentVal === 0 ? 0 : '')}"
                 placeholder="0.00"
                 oninput="Results.updateFlag(${item.id})"
                 style="padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;width:100%;outline:none;"
                 onfocus="this.style.borderColor='var(--primary)'"
                 onblur="this.style.borderColor='var(--border)'">`;
    }

    // Parse parameters
    let params = [];
    try { params = JSON.parse(item.parameters || '[]'); } catch {}

    if (rt === 'MULTI_PARAMETER') {
      let prevSection = null;
      return params.map(p => {
        let html = '';
        if (p.section && p.section !== prevSection) {
          prevSection = p.section;
          html += `<div class="param-section-header">${esc(p.section)}</div>`;
        }
        html += `<div class="result-entry-row" style="grid-template-columns:1fr 160px 100px;margin-bottom:6px;">
          <div class="test-name">${esc(p.name)}<span class="test-meta"> ${esc(p.unit || '')}</span></div>
          ${buildParamInput(p, item, existing)}
          <div class="result-flag-preview" id="flag-${item.id}-${p.id}">—</div>
        </div>`;
        return html;
      }).join('');
    }

    // Single-param non-numeric types
    if (params.length > 0) {
      return buildParamInput(params[0], item, existing);
    }
    return `<textarea class="result-value-input" data-item-id="${item.id}" rows="3" placeholder="Ingrese resultado...">${esc(String(currentVal || ''))}</textarea>`;
  }

  function buildParamInput(param, item, existing) {
    let currentVal = '';
    if (existing?.value_text) {
      try {
        const vals = JSON.parse(existing.value_text);
        currentVal = vals[param.id] ?? '';
      } catch { currentVal = existing.value_text || ''; }
    }

    const paramType = param.type || 'NUMERIC';

    if (paramType === 'NUMERIC') {
      return `<input type="number" class="param-value-input"
        data-param-id="${param.id}" data-item-id="${item.id}"
        step="any" placeholder="—" value="${currentVal !== '' ? currentVal : ''}"
        oninput="Results.updateParamFlag(this, ${JSON.stringify(param).replace(/"/g,'&quot;')}, '${esc(item.gender || '')}', '${esc(item.patient_dob || '')}')">`;
    }

    if (paramType === 'QUALITATIVE' || paramType === 'TITER') {
      const options = param.options || [];
      return `<select class="param-value-input" data-param-id="${param.id}" data-item-id="${item.id}">
        <option value="">— Seleccionar —</option>
        ${options.map(o => `<option value="${esc(o)}" ${currentVal === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    }

    if (paramType === 'SEMI_QUANTITATIVE') {
      const options = param.options || [];
      return `<div class="semi-quant-group" data-param-id="${param.id}" data-item-id="${item.id}">
        ${options.map(o => `<button type="button" class="semi-quant-btn ${currentVal === o ? 'active' : ''}"
          onclick="Results.selectSemiQuant(this,'${item.id}','${param.id}')"
          data-value="${esc(o)}" data-param-id="${param.id}" data-item-id="${item.id}">${esc(o)}</button>`).join('')}
      </div>`;
    }

    if (paramType === 'TEXT') {
      return `<textarea class="param-value-input" data-param-id="${param.id}" data-item-id="${item.id}"
        rows="2" placeholder="Descripción...">${esc(String(currentVal || ''))}</textarea>`;
    }

    return `<input type="text" class="param-value-input" data-param-id="${param.id}" data-item-id="${item.id}" value="${esc(String(currentVal || ''))}">`;
  }

  function updateParamFlag(input, param, gender, dob) {
    const val = parseFloat(input.value);
    const flagEl = document.getElementById(`flag-${input.dataset.itemId}-${param.id}`);
    if (!flagEl || isNaN(val)) { if (flagEl) flagEl.textContent = '—'; return; }
    const g = (gender || '').toUpperCase() === 'M' ? 'm' : 'f';
    const birth = new Date(dob), now = new Date();
    const age = (now - birth) / (365.25 * 24 * 60 * 60 * 1000);
    const ag = age < 18 ? 'child' : age < 65 ? 'adult' : 'elder';
    const ref = param.ref?.[`${ag}_${g}`];
    if (!ref) { flagEl.textContent = '—'; return; }
    if (val < ref.min) { flagEl.textContent = 'BAJO'; flagEl.style.color = '#1565c0'; }
    else if (val > ref.max) { flagEl.textContent = 'ALTO'; flagEl.style.color = '#d32f2f'; }
    else { flagEl.textContent = 'NORMAL'; flagEl.style.color = '#2e7d32'; }
  }

  function selectSemiQuant(btn, itemId, paramId) {
    const group = btn.closest('.semi-quant-group');
    if (!group) return;
    group.querySelectorAll('.semi-quant-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function updateFlag(itemId) {
    const input = document.getElementById(`val-${itemId}`);
    const flagEl = document.getElementById(`flag-${itemId}`);
    if (!input || !flagEl) return;

    const val = parseFloat(input.value);
    const ref = currentRefRanges[itemId];

    if (isNaN(val) || !ref) {
      flagEl.className = 'result-flag-preview';
      flagEl.textContent = '—';
      return;
    }

    let flag = 'NORMAL', isCritical = false;
    if (ref.min != null && val < ref.min) flag = 'LOW';
    if (ref.max != null && val > ref.max) flag = 'HIGH';
    if (flag !== 'NORMAL') {
      isCritical = ref.max != null && (val > ref.max * 2 || (ref.min > 0 && val < ref.min / 2));
    }

    flagEl.className = `result-flag-preview badge badge-${isCritical ? 'CRITICAL' : flag}`;
    const spanishFlag = flag === 'HIGH' ? 'ALTO' : flag === 'LOW' ? 'BAJO' : 'NORMAL';
    flagEl.textContent = isCritical ? `CRÍTICO ${spanishFlag} !!!` : spanishFlag;
  }

  async function saveEntries() {
    if (!currentOrder) return;

    const items = currentOrder.items.filter(item => !item.is_locked);
    const toSave = [];

    for (const item of items) {
      const rt = item.result_type || 'NUMERIC';

      if (rt === 'NUMERIC') {
        const input = document.getElementById(`val-${item.id}`);
        if (!input) continue;
        const val = input.value.trim();
        if (val === '') continue;
        const num = parseFloat(val);
        if (isNaN(num)) {
          App.toast(`Valor inválido para ${item.test_name}`, 'warning');
          return;
        }
        toSave.push({ itemId: item.id, payload: { value: num } });

      } else if (rt === 'MULTI_PARAMETER') {
        const inputs = document.querySelectorAll(`.param-value-input[data-item-id="${item.id}"]`);
        if (!inputs.length) continue;
        const valuesObj = {};
        let hasAny = false;
        inputs.forEach(inp => {
          const pid = inp.dataset.paramId;
          let v = '';
          if (inp.tagName === 'SELECT') {
            v = inp.value;
          } else if (inp.classList.contains('semi-quant-group')) {
            const active = inp.querySelector('.semi-quant-btn.active');
            v = active ? active.dataset.value : '';
          } else {
            v = inp.value.trim();
          }
          if (v !== '') hasAny = true;
          valuesObj[pid] = v;
        });
        // Also collect semi-quant buttons
        const semiGroups = document.querySelectorAll(`.semi-quant-group[data-item-id="${item.id}"]`);
        semiGroups.forEach(grp => {
          const pid = grp.dataset.paramId;
          const active = grp.querySelector('.semi-quant-btn.active');
          if (active) { valuesObj[pid] = active.dataset.value; hasAny = true; }
        });
        if (!hasAny) continue;
        toSave.push({ itemId: item.id, payload: { value_text: JSON.stringify(valuesObj) } });

      } else {
        // Single non-numeric: qualitative, titer, semi_quantitative, text
        // Check for param-value-input
        const paramInput = document.querySelector(`.param-value-input[data-item-id="${item.id}"]`);
        const semiGroup  = document.querySelector(`.semi-quant-group[data-item-id="${item.id}"]`);
        let val = '';
        if (semiGroup) {
          const active = semiGroup.querySelector('.semi-quant-btn.active');
          val = active ? active.dataset.value : '';
        } else if (paramInput) {
          val = paramInput.value.trim();
        } else {
          // Fallback textarea
          const ta = document.querySelector(`textarea.result-value-input[data-item-id="${item.id}"]`);
          if (ta) val = ta.value.trim();
        }
        if (val === '') continue;
        toSave.push({ itemId: item.id, payload: { value_text: val } });
      }
    }

    if (!toSave.length) {
      App.toast('No se ingresaron valores', 'warning');
      return;
    }

    const btn = document.getElementById('btn-save-results');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      let saved = 0;
      for (const entry of toSave) {
        await API.enterResult(entry.itemId, entry.payload);
        saved++;
      }
      App.toast(`${saved} resultado(s) guardado(s) correctamente`, 'success');
      App.closeModal('modal-overlay-result');
      loadEntry();
      App.workflowAdvance('results');
    } catch (err) {
      App.toast('Error al guardar resultados: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar Resultados';
    }
  }

  // ─── Validation (Biochemist) ─────────────────────────────────────────────

  async function loadValidation() {
    const tbodyLoad = document.getElementById('results-validation-tbody');
    if (tbodyLoad) tbodyLoad.innerHTML = `<tr><td colspan="6" class="table-empty">Cargando...</td></tr>`;
    try {
      const orders = await API.getOrders({ limit: 100 });
      // Show orders that have at least some results entered
      const toValidate = orders.filter(o =>
        o.status === 'IN_PROCESS' || o.status === 'COMPLETED'
      );
      lastValidationOrders = toValidate;
      renderValidationList(filterBySearch(toValidate, document.getElementById('results-validation-search')?.value || ''));
    } catch (err) {
      App.toast('Error al cargar órdenes: ' + err.message, 'error');
    }
  }

  function searchValidation(query) {
    renderValidationList(filterBySearch(lastValidationOrders, query));
  }

  function renderValidationList(orders) {
    const tbody = document.getElementById('results-validation-tbody');

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><span class="empty-icon">✅</span>No hay órdenes pendientes de validación</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const allValidated = o.validated_count === o.test_count && o.test_count > 0;
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:12px;font-weight:600;color:var(--primary)">${esc(o.order_number)}</span></td>
          <td>
            <strong>${esc(o.patient_name)}</strong>
            <div class="text-muted text-sm">${esc(o.patient_id_number)}</div>
          </td>
          <td>${o.test_count}</td>
          <td>
            <span style="color:${allValidated ? 'var(--success)' : 'var(--warning)'}">
              ${o.validated_count}/${o.test_count} validado(s)
            </span>
          </td>
          <td>${App.statusBadge(o.status)}</td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="Results.openValidationModal(${o.id})">
              ${allValidated ? 'Ver Resultados' : 'Validar'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function openValidationModal(orderId) {
    try {
      const order = await API.getOrder(orderId);
      currentOrder = order;
      buildValidationModal(order);
      App.openModal('modal-overlay-validation');
    } catch (err) {
      App.toast('Error al cargar la orden: ' + err.message, 'error');
    }
  }

  function buildValidationModal(order) {
    const title = document.getElementById('validation-modal-title');
    const body  = document.getElementById('validation-modal-body');
    const btn   = document.getElementById('btn-validate-all');

    title.textContent = `Validar Resultados — ${order.order_number}`;

    const patientAge = App.calcAge(order.patient_dob);
    const ageGroup = patientAge < 18 ? 'child' : patientAge < 65 ? 'adult' : 'elder';
    const g = order.patient_gender === 'M' ? 'm' : 'f';

    const ageGroupLabel = ageGroup === 'child' ? 'niño' : ageGroup === 'adult' ? 'adulto' : 'adulto mayor';

    const hasUnvalidated = order.items.some(i => i.result_id && !i.is_locked);
    if (hasUnvalidated) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }

    body.innerHTML = `
      <div class="order-detail-header" style="margin-bottom:16px;">
        <div class="info-grid">
          <div class="info-item"><label>Paciente</label><span>${esc(order.patient_name)}</span></div>
          <div class="info-item"><label>F. Nac.</label><span>${esc(order.patient_dob)} (${patientAge} años, ${ageGroupLabel})</span></div>
          <div class="info-item"><label>Sexo</label><span>${order.patient_gender === 'M' ? 'Masculino' : 'Femenino'}</span></div>
          <div class="info-item"><label>Orden</label><span style="font-family:monospace">${esc(order.order_number)}</span></div>
          <div class="info-item"><label>Estado</label><span>${App.statusBadge(order.status)}</span></div>
        </div>
      </div>

      ${order.items.some(i => i.is_critical) ? `
        <div class="critical-alert" style="margin-bottom:16px;">
          <span class="alert-icon">⚠</span>
          <div>
            <div class="alert-title">Valores Críticos Detectados</div>
            <div class="alert-desc">Uno o más resultados superan 2× el rango de referencia. Revise cuidadosamente antes de validar.</div>
          </div>
        </div>` : ''}

      <table class="data-table">
        <thead>
          <tr>
            <th>Prueba</th>
            <th style="text-align:center">Resultado</th>
            <th style="text-align:center">Estado</th>
            <th>Val. Referencia</th>
            <th style="text-align:center">Validación</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map(item => {
            const min = item[`ref_min_${ageGroup}_${g}`];
            const max = item[`ref_max_${ageGroup}_${g}`];
            const refStr = (min != null) ? `${min} – ${max} ${esc(item.unit)}` : 'N/A';
            const vrt = item.result_type || 'NUMERIC';
            let displayVal;
            if (vrt === 'NUMERIC') {
              displayVal = item.value != null
                ? `<span style="font-size:16px;font-weight:700;">${item.value}</span> <span class="text-muted text-sm">${esc(item.unit)}</span>`
                : '<span class="text-muted">No ingresado</span>';
            } else if (item.value_text != null) {
              if (vrt === 'MULTI_PARAMETER') {
                let paramCount = 0;
                try { paramCount = Object.keys(JSON.parse(item.value_text || '{}')).length; } catch {}
                displayVal = `<span style="font-weight:600;">${paramCount} parámetro(s)</span>`;
              } else {
                displayVal = `<span style="font-weight:600;font-size:15px;">${esc(item.value_text)}</span>`;
              }
            } else {
              displayVal = '<span class="text-muted">No ingresado</span>';
            }

            return `
              <tr style="${item.is_critical ? 'background:#fff5f5;' : ''}">
                <td>
                  <strong>${esc(item.test_name)}</strong>
                  <div class="text-muted text-sm">${esc(item.sample_type)}</div>
                </td>
                <td style="text-align:center;">${displayVal}</td>
                <td style="text-align:center;">
                  ${(item.value != null || item.value_text != null) ? App.flagBadge(item.flag || 'NORMAL', item.is_critical, item.result_type) : '—'}
                </td>
                <td class="text-muted text-sm">${refStr}</td>
                <td style="text-align:center;">
                  ${item.is_locked
                    ? `<span style="color:var(--success);font-size:13px;">✓ ${esc(item.validated_by_name)}<br><span class="text-sm text-muted">${App.formatDateTime(item.validated_at)}</span></span>`
                    : item.result_id
                      ? `<button class="btn btn-success btn-sm" onclick="Results.validateSingle(${item.result_id})">Validar</button>`
                      : '<span class="text-muted text-sm">Sin resultado</span>'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div style="margin-top:16px;text-align:right;">
        <button class="btn btn-outline btn-sm" onclick="window.open('/report/${order.id}', '_blank')">🖨 Vista Previa del Informe</button>
      </div>
    `;
  }

  async function validateSingle(resultId) {
    try {
      await API.validateResult(resultId);
      App.toast('Resultado validado', 'success');
      // Refresh modal
      const order = await API.getOrder(currentOrder.id);
      currentOrder = order;
      buildValidationModal(order);
      loadValidation();
    } catch (err) {
      App.toast('Error de validación: ' + err.message, 'error');
    }
  }

  async function validateAll() {
    if (!currentOrder) return;

    const btn = document.getElementById('btn-validate-all');
    btn.disabled = true;
    btn.textContent = 'Validando...';

    try {
      await API.validateAllOrder(currentOrder.id);
      App.toast('Todos los resultados validados y orden entregada', 'success');
      App.closeModal('modal-overlay-validation');
      loadValidation();
    } catch (err) {
      App.toast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✓ Validar Todo y Entregar';
    }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    loadEntry, searchEntry, openEntryModal, updateFlag, saveEntries,
    loadValidation, searchValidation, openValidationModal, validateSingle, validateAll,
    updateParamFlag, selectSemiQuant
  };
})();

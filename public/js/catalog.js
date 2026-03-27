/* ── Test Catalog Module ─────────────────────────────────────────────────── */
'use strict';

const Catalog = (() => {
  let editingId    = null;
  let allTests     = [];
  let filterQuery  = '';
  let multiParams  = [];
  let currentStep  = 1;
  let wizardTest   = null; // test being created/edited

  async function load() {
    try {
      allTests = await API.getCatalog();
      render(allTests);
    } catch (err) {
      App.toast('Error al cargar catálogo: ' + err.message, 'error');
    }
  }

  function filterTests(query) {
    filterQuery = query.toLowerCase();
    const filtered = filterQuery
      ? allTests.filter(t =>
          t.name.toLowerCase().includes(filterQuery) ||
          t.code.toLowerCase().includes(filterQuery) ||
          t.sample_type.toLowerCase().includes(filterQuery)
        )
      : allTests;
    render(filtered);
  }

  function render(tests) {
    const tbody   = document.getElementById('catalog-tbody');
    const user    = App.getUser();
    const isAdmin = user && user.role === 'ADMIN';

    if (!tests.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><span class="empty-icon">🔬</span>No hay pruebas en el catálogo</td></tr>`;
      return;
    }

    tbody.innerHTML = tests.map(t => `
      <tr>
        <td><span style="font-family:monospace;font-weight:600;color:var(--primary)">${esc(t.code)}</span></td>
        <td>
          <strong>${esc(t.name)}</strong>
          <span class="badge" style="font-size:10px;margin-left:4px;">${t.result_type || 'NUMERIC'}</span>
        </td>
        <td>${esc(t.sample_type)}</td>
        <td>${esc(t.unit)}</td>
        <td class="text-muted text-sm">${t.ref_min_adult_m ?? '—'} – ${t.ref_max_adult_m ?? '—'}</td>
        <td class="text-muted text-sm">${t.ref_min_adult_f ?? '—'} – ${t.ref_max_adult_f ?? '—'}</td>
        <td style="font-weight:600;color:var(--primary)">S/. ${t.price?.toFixed(2) || '—'}</td>
        <td class="text-muted text-sm">${t.estimated_time ? t.estimated_time + ' min' : '—'}</td>
        <td>
          ${isAdmin
            ? `<button class="btn btn-sm btn-outline" onclick="Catalog.openEdit(${t.id})">✏ Editar</button>
               <button class="btn btn-sm btn-ghost" style="color:var(--danger);margin-left:4px" onclick="Catalog.deleteTest(${t.id}, '${esc(t.name)}')">🗑</button>`
            : '—'}
        </td>
      </tr>
    `).join('');
  }

  function openCreate() {
    editingId   = null;
    wizardTest  = null;
    multiParams = [];
    currentStep = 1;
    document.getElementById('catalog-modal-title').textContent = 'Nueva Prueba';
    buildWizard(null);
    App.openModal('modal-overlay-catalog');
  }

  async function openEdit(id) {
    try {
      const test = await API.getCatalogItem(id);
      editingId   = id;
      wizardTest  = test;
      multiParams = [];
      currentStep = 1;
      try {
        const parsed = JSON.parse(test.parameters || '[]');
        if (Array.isArray(parsed)) multiParams = parsed;
      } catch {}
      document.getElementById('catalog-modal-title').textContent = `Editar — ${test.name}`;
      buildWizard(test);
      App.openModal('modal-overlay-catalog');
    } catch (err) {
      App.toast('Error al cargar prueba: ' + err.message, 'error');
    }
  }

  // ── Wizard scaffold ───────────────────────────────────────────────────────
  function buildWizard(test) {
    const rt = test?.result_type || 'NUMERIC';
    const SAMPLES = ['Suero', 'Sangre Total', 'Orina', 'LCR', 'Heces', 'Secreción', 'Aliento', 'Otro'];

    document.getElementById('catalog-modal-body').innerHTML = `
      <!-- Step indicators -->
      <div style="display:flex;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin-bottom:20px;">
        ${[{n:1,l:'1. Información'},{n:2,l:'2. Tipo'},{n:3,l:'3. Configurar'},{n:4,l:'4. Vista Previa'}].map(s => `
          <div id="cat-ind-${s.n}" style="flex:1;padding:8px 4px;text-align:center;font-size:12px;font-weight:600;
            background:${s.n===1?'var(--primary)':'var(--bg-alt)'};
            color:${s.n===1?'#fff':'var(--text-muted)'};
            border-right:${s.n<4?'1px solid var(--border)':'none'};transition:all .2s;">${s.l}</div>
        `).join('')}
      </div>

      <!-- Step 1: Basic Info -->
      <div id="cat-step-1">
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Código *</label>
            <input type="text" id="cat-code" placeholder="Ej: HBA1C" value="${esc(test?.code||'')}"
              ${editingId?'disabled':''} style="text-transform:uppercase;font-family:monospace;">
          </div>
          <div class="form-group">
            <label>Nombre de Prueba *</label>
            <input type="text" id="cat-name" placeholder="Nombre completo" value="${esc(test?.name||'')}">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Tipo de Muestra *</label>
            <div style="display:flex;gap:6px;">
              <select id="cat-sample-sel" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;"
                onchange="document.getElementById('cat-sample').value=this.value==='Otro'?'':this.value">
                ${SAMPLES.map(s => `<option ${(test?.sample_type===s)?'selected':''}>${s}</option>`).join('')}
              </select>
              <input type="text" id="cat-sample" placeholder="Ej: Suero" value="${esc(test?.sample_type||'')}"
                style="flex:2;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;">
            </div>
          </div>
          <div class="form-group">
            <label>Unidad *</label>
            <input type="text" id="cat-unit" placeholder="Ej: mg/dL, g/L, UI/mL" value="${esc(test?.unit||'')}">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:4px;">
          <div class="form-group">
            <label>Precio (S/.)</label>
            <input type="number" id="cat-price" min="0" step="0.50" placeholder="0.00"
              value="${test?.price!=null?test.price:''}">
          </div>
          <div class="form-group">
            <label>Tiempo estimado (min)</label>
            <input type="number" id="cat-time" min="0" step="5" placeholder="30"
              value="${test?.estimated_time!=null?test.estimated_time:''}">
          </div>
        </div>
      </div>

      <!-- Step 2: Result Type -->
      <div id="cat-step-2" style="display:none;">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Seleccione cómo se registrará el resultado de esta prueba:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${[
            {v:'NUMERIC',       icon:'🔢', title:'Numérico',         desc:'Un número con rangos de referencia (min/max)'},
            {v:'QUALITATIVE',   icon:'📋', title:'Cualitativo',      desc:'Seleccionar de opciones (Positivo/Negativo)'},
            {v:'SEMI_QUANTITATIVE',icon:'📊',title:'Semi-cuantitativo',desc:'Sistema de cruces: Negativo / + / ++ / +++'},
            {v:'TITER',         icon:'🧪', title:'Título / Dilución', desc:'Títulos serológicos: No reactivo / 1/20 / 1/40...'},
            {v:'TEXT',          icon:'📝', title:'Texto libre',       desc:'Descripción o hallazgos en texto abierto'},
            {v:'MULTI_PARAMETER',icon:'🔬',title:'Multi-parámetro',  desc:'Múltiples sub-parámetros (Hemograma, Orina...)'},
          ].map(opt => `
            <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:2px solid var(--border);
              border-radius:8px;cursor:pointer;transition:border-color .2s;"
              onclick="Catalog.selectType('${opt.v}', this)">
              <input type="radio" name="result-type" value="${opt.v}" ${rt===opt.v?'checked':''} style="margin-top:3px;">
              <div>
                <div style="font-size:20px;margin-bottom:4px;">${opt.icon}</div>
                <div style="font-weight:700;font-size:13px;">${opt.title}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${opt.desc}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Step 3: Configure -->
      <div id="cat-step-3" style="display:none;">
        <div id="cat-type-fields"></div>
      </div>

      <!-- Step 4: Preview -->
      <div id="cat-step-4" style="display:none;">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Así se verá el formulario de ingreso de resultados:</p>
        <div id="cat-preview-body" style="border:2px dashed var(--border);border-radius:8px;padding:16px;background:var(--bg-alt);"></div>
      </div>
    `;

    // Highlight pre-selected type card
    setTimeout(() => {
      document.querySelectorAll('input[name="result-type"]').forEach(r => {
        if (r.checked) r.closest('label')?.style && (r.closest('label').style.borderColor = 'var(--primary)');
      });
    }, 0);

    showStep(1);
  }

  function selectType(value, labelEl) {
    // Update radio
    const radio = labelEl.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    // Update card borders
    document.querySelectorAll('input[name="result-type"]').forEach(r => {
      const card = r.closest('label');
      if (card) card.style.borderColor = r.checked ? 'var(--primary)' : 'var(--border)';
    });
  }

  function showStep(n) {
    currentStep = n;
    // Update indicators
    for (let i = 1; i <= 4; i++) {
      const ind = document.getElementById(`cat-ind-${i}`);
      if (ind) {
        ind.style.background = i === n ? 'var(--primary)' : (i < n ? '#bbdefb' : 'var(--bg-alt)');
        ind.style.color = i <= n ? (i === n ? '#fff' : '#1565c0') : 'var(--text-muted)';
      }
      const step = document.getElementById(`cat-step-${i}`);
      if (step) step.style.display = i === n ? '' : 'none';
    }
    // Update footer buttons
    const btnPrev = document.getElementById('cat-btn-prev');
    const btnNext = document.getElementById('cat-btn-next');
    const btnSave = document.getElementById('cat-btn-save');
    if (btnPrev) { btnPrev.classList.toggle('hidden', n === 1); }
    if (btnNext) { btnNext.classList.toggle('hidden', n === 4); }
    if (btnSave) { btnSave.classList.toggle('hidden', n !== 4); }

    // When entering step 3, render type-specific fields
    if (n === 3) {
      const rt = document.querySelector('input[name="result-type"]:checked')?.value || 'NUMERIC';
      renderTypeFields(rt, wizardTest);
    }
    // When entering step 4, render preview
    if (n === 4) buildPreview();
  }

  function nextStep() {
    if (currentStep === 1) {
      // Validate basic info
      const name    = document.getElementById('cat-name')?.value.trim();
      const sample  = document.getElementById('cat-sample')?.value.trim();
      const unit    = document.getElementById('cat-unit')?.value.trim();
      const code    = document.getElementById('cat-code')?.value.trim();
      if (!name) { App.toast('El nombre de la prueba es requerido', 'warning'); return; }
      if (!sample) { App.toast('El tipo de muestra es requerido', 'warning'); return; }
      if (!unit) { App.toast('La unidad es requerida', 'warning'); return; }
      if (!editingId && !code) { App.toast('El código es requerido', 'warning'); return; }
    }
    if (currentStep < 4) showStep(currentStep + 1);
  }

  function prevStep() {
    if (currentStep > 1) showStep(currentStep - 1);
  }

  function buildPreview() {
    const body = document.getElementById('cat-preview-body');
    if (!body) return;
    const name   = document.getElementById('cat-name')?.value || '(sin nombre)';
    const unit   = document.getElementById('cat-unit')?.value || '';
    const sample = document.getElementById('cat-sample')?.value || '';
    const rt     = document.querySelector('input[name="result-type"]:checked')?.value || 'NUMERIC';

    const typeLabels = {
      NUMERIC:'🔢 Numérico', QUALITATIVE:'📋 Cualitativo',
      SEMI_QUANTITATIVE:'📊 Semi-cuantitativo', TITER:'🧪 Título',
      TEXT:'📝 Texto libre', MULTI_PARAMETER:'🔬 Multi-parámetro'
    };

    let inputPreview = '';
    if (rt === 'NUMERIC') {
      inputPreview = `<input type="number" disabled placeholder="0.00"
        style="padding:8px;border:1.5px solid var(--border);border-radius:6px;width:140px;font-size:14px;">
        <span style="margin-left:6px;font-size:13px;color:var(--text-muted);">${esc(unit)}</span>`;
    } else if (rt === 'TEXT') {
      inputPreview = `<textarea disabled rows="3" placeholder="Descripción libre..."
        style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;"></textarea>`;
    } else if (rt === 'MULTI_PARAMETER') {
      const count = multiParams.length;
      inputPreview = `<div style="padding:10px;border:1px solid var(--border);border-radius:6px;background:#fff;font-size:12px;color:var(--text-muted);">
        ${count > 0
          ? multiParams.map(p => `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;">${esc(p.name||'Parámetro')} <span style="color:#aaa;">${esc(p.unit||'')}</span></div>`).join('')
          : 'Sin parámetros definidos'}
      </div>`;
    } else {
      // Options-based types
      let options = [];
      const container = document.getElementById('cat-type-fields');
      if (rt === 'QUALITATIVE') {
        container?.querySelectorAll('.qual-opt-text').forEach(inp => { if (inp.value.trim()) options.push(inp.value.trim()); });
      } else if (rt === 'SEMI_QUANTITATIVE') {
        container?.querySelectorAll('.semi-opt-input').forEach(inp => { if (inp.value.trim()) options.push(inp.value.trim()); });
      } else if (rt === 'TITER') {
        container?.querySelectorAll('.titer-opt-input').forEach(inp => { if (inp.value.trim()) options.push(inp.value.trim()); });
      }
      if (options.length <= 6) {
        inputPreview = `<div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${options.map(o => `<button disabled style="padding:6px 12px;border:2px solid var(--border);border-radius:6px;background:#fff;font-size:12px;font-weight:600;">${esc(o)}</button>`).join('')}
        </div>`;
      } else {
        inputPreview = `<select disabled style="padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
          ${options.map(o => `<option>${esc(o)}</option>`).join('')}
        </select>`;
      }
    }

    body.innerHTML = `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
        <strong style="font-size:14px;color:var(--text);">${esc(name)}</strong>
        <span style="margin-left:8px;">${esc(sample)}</span>
        <span class="badge" style="margin-left:8px;font-size:10px;">${typeLabels[rt]||rt}</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:16px;padding:12px;background:#fff;border-radius:6px;">
        <div style="flex:1;">${inputPreview}</div>
        <div style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text-muted);">— Estado —</div>
      </div>
    `;
  }

  // keep legacy alias for anything that calls buildForm
  function buildForm(test) { wizardTest = test; buildWizard(test); }

  function renderTypeFields(type, test) {
    const container = document.getElementById('cat-type-fields');
    const groups = [
      { label: 'Niño (< 18 años)',       key: 'child' },
      { label: 'Adulto (18–64 años)',     key: 'adult' },
      { label: 'Adulto Mayor (65+ años)', key: 'elder' },
    ];

    if (type === 'NUMERIC') {
      container.innerHTML = `
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
          Rangos de referencia — deje en blanco si no aplica
        </p>
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>Grupo de Edad</th>
              <th colspan="2" style="text-align:center;">Rango Masculino (mín / máx)</th>
              <th colspan="2" style="text-align:center;">Rango Femenino (mín / máx)</th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(g => `
              <tr>
                <td><strong>${g.label}</strong></td>
                <td style="text-align:center;">
                  <input type="number" step="any" class="ref-range-input"
                    id="rng_min_${g.key}_m" value="${test?.[`ref_min_${g.key}_m`] ?? ''}" placeholder="mín">
                </td>
                <td style="text-align:center;">
                  <input type="number" step="any" class="ref-range-input"
                    id="rng_max_${g.key}_m" value="${test?.[`ref_max_${g.key}_m`] ?? ''}" placeholder="máx">
                </td>
                <td style="text-align:center;">
                  <input type="number" step="any" class="ref-range-input"
                    id="rng_min_${g.key}_f" value="${test?.[`ref_min_${g.key}_f`] ?? ''}" placeholder="mín">
                </td>
                <td style="text-align:center;">
                  <input type="number" step="any" class="ref-range-input"
                    id="rng_max_${g.key}_f" value="${test?.[`ref_max_${g.key}_f`] ?? ''}" placeholder="máx">
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'QUALITATIVE') {
      let existingOptions = [], existingAbnormal = [];
      try {
        const params = JSON.parse(test?.parameters || '[]');
        if (params.length > 0) {
          existingOptions = params[0].options || [];
          existingAbnormal = params[0].abnormal_values || [];
        }
      } catch {}
      if (!existingOptions.length) existingOptions = ['Positivo', 'Negativo'];
      if (!existingAbnormal.length) existingAbnormal = ['Positivo'];
      container.innerHTML = `
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13px;">Opciones de resultado</strong>
          <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.addQualOption()">+ Agregar opción</button>
        </div>
        <div id="qual-options-list" style="margin-bottom:4px;">
          ${existingOptions.map(opt => `
            <div class="qual-option-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <input type="text" class="qual-opt-text" value="${esc(opt)}" placeholder="Opción..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
              <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                <input type="checkbox" class="qual-is-abnormal" ${existingAbnormal.includes(opt) ? 'checked' : ''}> Anormal
              </label>
              <button type="button" onclick="Catalog.removeQualOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
            </div>
          `).join('')}
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Marque "Anormal" en las opciones que indican un resultado patológico.</p>
      `;
    } else if (type === 'SEMI_QUANTITATIVE') {
      let existingOptions = [], existingThreshold = 1;
      try {
        const params = JSON.parse(test?.parameters || '[]');
        if (params.length > 0) {
          existingOptions = params[0].options || [];
          existingThreshold = params[0].abnormal_threshold ?? 1;
        }
      } catch {}
      if (!existingOptions.length) existingOptions = ['Negativo', '+', '++', '+++', '++++'];
      container.innerHTML = `
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13px;">Valores (de menor a mayor)</strong>
          <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.addSemiOption()">+ Agregar valor</button>
        </div>
        <div id="semi-options-list" style="margin-bottom:12px;">
          ${existingOptions.map((opt, i) => `
            <div class="semi-opt-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:11px;color:var(--text-muted);width:20px;text-align:right;">${i + 1}.</span>
              <input type="text" class="semi-opt-input" value="${esc(opt)}" placeholder="Valor..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" oninput="Catalog.refreshSemiThreshold()">
              <button type="button" onclick="Catalog.removeSemiOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="form-group">
          <label>Considerar anormal desde:</label>
          <select id="semi-threshold-select" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
            ${existingOptions.map((opt, i) => `<option value="${i}" ${i === existingThreshold ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (type === 'TITER') {
      let existingOptions = [], existingSigThreshold = '';
      try {
        const params = JSON.parse(test?.parameters || '[]');
        if (params.length > 0) {
          existingOptions = params[0].options || [];
          existingSigThreshold = params[0].significant_threshold || '';
        }
      } catch {}
      if (!existingOptions.length) existingOptions = ['No reactivo', '1/2', '1/4', '1/8', '1/16', '1/32'];
      container.innerHTML = `
        <div style="margin-bottom:10px;">
          <strong style="font-size:13px;display:block;margin-bottom:6px;">Presets rápidos</strong>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.applyTiterPreset('vdrl')">VDRL estándar</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.applyTiterPreset('widal')">Widal</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.applyTiterPreset('aso')">ASO / Brucella</button>
          </div>
        </div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13px;">Valores de dilución</strong>
          <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.addTiterOption()">+ Agregar</button>
        </div>
        <div id="titer-options-list" style="margin-bottom:12px;">
          ${existingOptions.map(opt => `
            <div class="titer-opt-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <input type="text" class="titer-opt-input" value="${esc(opt)}" placeholder="Dilución..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" oninput="Catalog.refreshTiterThreshold()">
              <button type="button" onclick="Catalog.removeTiterOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="form-group">
          <label>Significativo desde:</label>
          <select id="titer-sig-select" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
            ${existingOptions.map(opt => `<option value="${esc(opt)}" ${opt === existingSigThreshold ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (type === 'TEXT') {
      container.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);">Este tipo acepta texto libre como resultado. No se requieren opciones adicionales.</p>
      `;
    } else if (type === 'MULTI_PARAMETER') {
      renderMultiParamBuilder(test);
    }
  }

  function renderMultiParamBuilder(test) {
    const container = document.getElementById('cat-type-fields');
    container.innerHTML = `
      <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:13px;">Parámetros</strong>
        <button type="button" class="btn btn-sm btn-outline" onclick="Catalog.addMultiParam()">+ Agregar Parámetro</button>
      </div>
      <div id="multi-param-list"></div>
    `;
    renderMultiParamList();
  }

  function renderMultiParamList() {
    const list = document.getElementById('multi-param-list');
    if (!list) return;

    if (!multiParams.length) {
      list.innerHTML = `<p class="text-muted text-sm" style="padding:8px;">Sin parámetros. Haga clic en "Agregar Parámetro".</p>`;
      return;
    }

    list.innerHTML = multiParams.map((p, idx) => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px;background:var(--bg-alt);">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <strong style="font-size:12px;color:var(--primary);">Parámetro ${idx + 1}</strong>
          <button type="button" class="btn btn-sm btn-ghost" style="color:var(--danger);" onclick="Catalog.removeMultiParam(${idx})">✕ Eliminar</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Nombre *</label>
            <input type="text" class="mp-name" data-idx="${idx}" placeholder="Ej: Glucosa" value="${esc(p.name || '')}" oninput="Catalog.updateMultiParam(${idx},'name',this.value)">
          </div>
          <div class="form-group">
            <label>Unidad</label>
            <input type="text" class="mp-unit" data-idx="${idx}" placeholder="mg/dL" value="${esc(p.unit || '')}" oninput="Catalog.updateMultiParam(${idx},'unit',this.value)">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo</label>
            <select class="mp-type" data-idx="${idx}" onchange="Catalog.updateMultiParam(${idx},'type',this.value)">
              <option value="NUMERIC" ${(p.type||'NUMERIC')==='NUMERIC'?'selected':''}>Numérico</option>
              <option value="QUALITATIVE" ${p.type==='QUALITATIVE'?'selected':''}>Cualitativo</option>
              <option value="SEMI_QUANTITATIVE" ${p.type==='SEMI_QUANTITATIVE'?'selected':''}>Semi-cuantitativo</option>
              <option value="TEXT" ${p.type==='TEXT'?'selected':''}>Texto</option>
              <option value="TITER" ${p.type==='TITER'?'selected':''}>Título</option>
            </select>
          </div>
          <div class="form-group">
            <label>Sección <span class="text-muted text-sm">(agrupador)</span></label>
            <input type="text" class="mp-section" data-idx="${idx}" placeholder="Ej: Química Básica" value="${esc(p.section || '')}" oninput="Catalog.updateMultiParam(${idx},'section',this.value)">
          </div>
        </div>
        <div class="form-group">
          <label>Ref. Adulto Masc. (mín–máx)</label>
          <div class="form-row" style="gap:8px;">
            <input type="number" step="any" placeholder="mín" value="${p.ref?.adult_m?.min ?? ''}" oninput="Catalog.updateMultiParamRef(${idx},'adult_m','min',this.value)" style="flex:1;">
            <input type="number" step="any" placeholder="máx" value="${p.ref?.adult_m?.max ?? ''}" oninput="Catalog.updateMultiParamRef(${idx},'adult_m','max',this.value)" style="flex:1;">
          </div>
        </div>
        <div class="form-group">
          <label>Ref. Adulto Fem. (mín–máx)</label>
          <div class="form-row" style="gap:8px;">
            <input type="number" step="any" placeholder="mín" value="${p.ref?.adult_f?.min ?? ''}" oninput="Catalog.updateMultiParamRef(${idx},'adult_f','min',this.value)" style="flex:1;">
            <input type="number" step="any" placeholder="máx" value="${p.ref?.adult_f?.max ?? ''}" oninput="Catalog.updateMultiParamRef(${idx},'adult_f','max',this.value)" style="flex:1;">
          </div>
        </div>
      </div>
    `).join('');
  }

  function addMultiParam() {
    multiParams.push({ id: Date.now(), name: '', unit: '', type: 'NUMERIC', section: '', ref: {} });
    renderMultiParamList();
  }

  function removeMultiParam(idx) {
    multiParams.splice(idx, 1);
    renderMultiParamList();
  }

  function updateMultiParam(idx, field, value) {
    if (multiParams[idx]) multiParams[idx][field] = value;
  }

  function updateMultiParamRef(idx, group, minMax, value) {
    if (!multiParams[idx]) return;
    if (!multiParams[idx].ref) multiParams[idx].ref = {};
    if (!multiParams[idx].ref[group]) multiParams[idx].ref[group] = {};
    multiParams[idx].ref[group][minMax] = value !== '' ? parseFloat(value) : null;
  }

  // ── QUALITATIVE option helpers ──────────────────────────────────────────
  function addQualOption() {
    const list = document.getElementById('qual-options-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'qual-option-row';
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="qual-opt-text" placeholder="Opción..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
      <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;">
        <input type="checkbox" class="qual-is-abnormal"> Anormal
      </label>
      <button type="button" onclick="Catalog.removeQualOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
    `;
    list.appendChild(div);
  }

  function removeQualOption(btn) {
    btn.closest('.qual-option-row')?.remove();
  }

  // ── SEMI_QUANTITATIVE option helpers ─────────────────────────────────────
  function addSemiOption() {
    const list = document.getElementById('semi-options-list');
    if (!list) return;
    const idx = list.querySelectorAll('.semi-opt-row').length;
    const div = document.createElement('div');
    div.className = 'semi-opt-row';
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    div.innerHTML = `
      <span style="font-size:11px;color:var(--text-muted);width:20px;text-align:right;">${idx + 1}.</span>
      <input type="text" class="semi-opt-input" placeholder="Valor..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" oninput="Catalog.refreshSemiThreshold()">
      <button type="button" onclick="Catalog.removeSemiOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
    `;
    list.appendChild(div);
  }

  function removeSemiOption(btn) {
    btn.closest('.semi-opt-row')?.remove();
    refreshSemiThreshold();
  }

  function refreshSemiThreshold() {
    const inputs = document.querySelectorAll('#semi-options-list .semi-opt-input');
    const sel = document.getElementById('semi-threshold-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = Array.from(inputs).map((inp, i) =>
      `<option value="${i}" ${String(i) === prev ? 'selected' : ''}>${esc(inp.value || `Valor ${i+1}`)}</option>`
    ).join('');
  }

  // ── TITER option helpers ──────────────────────────────────────────────────
  const TITER_PRESETS = {
    vdrl: ['No reactivo', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64', '1/128'],
    widal: ['No reactivo', '1/20', '1/40', '1/80', '1/160', '1/320'],
    aso: ['No reactivo', '1/50', '1/100', '1/200', '1/400', '1/800'],
  };

  function applyTiterPreset(key) {
    const options = TITER_PRESETS[key];
    if (!options) return;
    const list = document.getElementById('titer-options-list');
    if (!list) return;
    list.innerHTML = options.map(opt => `
      <div class="titer-opt-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <input type="text" class="titer-opt-input" value="${esc(opt)}" style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" oninput="Catalog.refreshTiterThreshold()">
        <button type="button" onclick="Catalog.removeTiterOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
      </div>
    `).join('');
    refreshTiterThreshold();
  }

  function addTiterOption() {
    const list = document.getElementById('titer-options-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'titer-opt-row';
    div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="titer-opt-input" placeholder="Dilución..." style="flex:1;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" oninput="Catalog.refreshTiterThreshold()">
      <button type="button" onclick="Catalog.removeTiterOption(this)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
    `;
    list.appendChild(div);
    refreshTiterThreshold();
  }

  function removeTiterOption(btn) {
    btn.closest('.titer-opt-row')?.remove();
    refreshTiterThreshold();
  }

  function refreshTiterThreshold() {
    const inputs = document.querySelectorAll('#titer-options-list .titer-opt-input');
    const sel = document.getElementById('titer-sig-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = Array.from(inputs).map(inp => {
      const v = inp.value.trim();
      return `<option value="${esc(v)}" ${v === prev ? 'selected' : ''}>${esc(v || '—')}</option>`;
    }).join('');
  }

  async function submit() {
    const code        = document.getElementById('cat-code')?.value.trim().toUpperCase();
    const name        = document.getElementById('cat-name')?.value.trim();
    const sample_type = document.getElementById('cat-sample')?.value.trim();
    const unit        = document.getElementById('cat-unit')?.value.trim();
    const priceEl     = document.getElementById('cat-price');
    const timeEl      = document.getElementById('cat-time');
    const result_type = document.querySelector('input[name="result-type"]:checked')?.value || 'NUMERIC';

    if (!name || !sample_type || !unit || (!editingId && !code)) {
      App.toast('Por favor complete todos los campos requeridos', 'warning');
      return;
    }

    const data = { name, sample_type, unit, result_type };
    if (!editingId) data.code = code;

    // Price and time
    if (priceEl && priceEl.value !== '') data.price = parseFloat(priceEl.value);
    if (timeEl && timeEl.value !== '') data.estimated_time = parseInt(timeEl.value);

    if (result_type === 'NUMERIC') {
      const groups  = ['child', 'adult', 'elder'];
      const genders = ['m', 'f'];
      for (const g of groups) {
        for (const sex of genders) {
          const minEl = document.getElementById(`rng_min_${g}_${sex}`);
          const maxEl = document.getElementById(`rng_max_${g}_${sex}`);
          data[`ref_min_${g}_${sex}`] = minEl?.value !== '' ? parseFloat(minEl.value) : null;
          data[`ref_max_${g}_${sex}`] = maxEl?.value !== '' ? parseFloat(maxEl.value) : null;
        }
      }
    } else if (result_type === 'QUALITATIVE') {
      const rows = document.querySelectorAll('#qual-options-list .qual-option-row');
      const options = [], abnormal_values = [];
      rows.forEach(row => {
        const text = row.querySelector('.qual-opt-text')?.value.trim();
        const isAbnormal = row.querySelector('.qual-is-abnormal')?.checked;
        if (text) { options.push(text); if (isAbnormal) abnormal_values.push(text); }
      });
      if (!options.length) { App.toast('Agregue al menos una opción', 'warning'); return; }
      data.parameters = JSON.stringify([{ id: 1, name, unit, type: 'QUALITATIVE', options, abnormal_values }]);
    } else if (result_type === 'SEMI_QUANTITATIVE') {
      const inputs = document.querySelectorAll('#semi-options-list .semi-opt-input');
      const options = Array.from(inputs).map(r => r.value.trim()).filter(Boolean);
      const thresholdIdx = parseInt(document.getElementById('semi-threshold-select')?.value || '1');
      if (!options.length) { App.toast('Agregue al menos un valor', 'warning'); return; }
      data.parameters = JSON.stringify([{ id: 1, name, unit, type: 'SEMI_QUANTITATIVE', options, abnormal_threshold: thresholdIdx }]);
    } else if (result_type === 'TITER') {
      const inputs = document.querySelectorAll('#titer-options-list .titer-opt-input');
      const options = Array.from(inputs).map(r => r.value.trim()).filter(Boolean);
      const sigThreshold = document.getElementById('titer-sig-select')?.value || '';
      if (!options.length) { App.toast('Agregue al menos un valor de dilución', 'warning'); return; }
      data.parameters = JSON.stringify([{ id: 1, name, unit, type: 'TITER', options, significant_threshold: sigThreshold }]);
    } else if (result_type === 'TEXT') {
      data.parameters = JSON.stringify([{ id: 1, name, unit, type: 'TEXT' }]);
    } else if (result_type === 'MULTI_PARAMETER') {
      data.parameters = JSON.stringify(multiParams);
    }

    try {
      if (editingId) {
        await API.updateCatalogItem(editingId, data);
        App.toast('Prueba actualizada', 'success');
      } else {
        await API.createCatalogItem(data);
        App.toast('Prueba creada', 'success');
      }
      App.closeModal('modal-overlay-catalog');
      load();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function deleteTest(id, name) {
    if (!confirm(`¿Eliminar la prueba "${name}"?\n\nSi tiene órdenes asociadas, será desactivada en lugar de eliminada.`)) return;
    try {
      const res = await API.deleteCatalogItem(id);
      App.toast(res.deactivated ? `"${name}" desactivada (tiene órdenes asociadas)` : `"${name}" eliminada`, 'success');
      load();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    load, filterTests, openCreate, openEdit, submit, deleteTest,
    nextStep, prevStep, selectType,
    addMultiParam, removeMultiParam, updateMultiParam, updateMultiParamRef,
    addQualOption, removeQualOption,
    addSemiOption, removeSemiOption, refreshSemiThreshold,
    applyTiterPreset, addTiterOption, removeTiterOption, refreshTiterThreshold,
  };
})();

/* ── Supplies Module ─────────────────────────────────────────────────────── */
'use strict';

const Supplies = (() => {

  let _supplies = [];
  let _filtered = [];
  let _editId   = null;
  let _movId    = null;
  let _activeTab = 'stock';
  let _poItems   = [];
  let _allTests  = [];

  // ─── Load & Tab control ────────────────────────────────────────────────

  async function load() {
    showTab('stock');
    loadAlerts();
  }

  function showTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.sup-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.sup-tab-panel').forEach(p => {
      p.classList.toggle('hidden', p.dataset.tab !== tab);
    });
    if (tab === 'stock')    loadStock();
    if (tab === 'abc')      loadABC();
    if (tab === 'coverage') loadCoverage();
    if (tab === 'linkages') loadLinkages();
    if (tab === 'po')       loadPO();
  }

  // ─── Alerts bar ───────────────────────────────────────────────────────

  async function loadAlerts() {
    try {
      const { critical, low, items } = await API.getSupplyAlerts();
      const bar = document.getElementById('supply-alerts-bar');
      if (!bar) return;
      if (!items.length) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      const isRed = critical > 0;
      bar.innerHTML = `
        <div style="background:${isRed?'#fff3f3':'#fff8e1'};border:1.5px solid ${isRed?'#e53935':'#ffa000'};border-radius:var(--radius);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:20px;">${isRed?'⛔':'⚠️'}</span>
          <div style="flex:1">
            <strong style="color:${isRed?'#b71c1c':'#e65100'}">
              ${critical>0?`${critical} crítico(s)`:''}${critical>0&&low>0?' — ':''}${low>0?`${low} bajo(s)`:''}
            </strong>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              ${items.slice(0,3).map(s=>`${esc(s.name)} (${s.stock_current} ${esc(s.unit)})`).join(' · ')}
              ${items.length>3?` · +${items.length-3} más`:''}
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="Supplies.showTab('po')">🛒 Crear OC</button>
        </div>`;
    } catch (_) {}
  }

  // ─── Tab: Stock ───────────────────────────────────────────────────────

  async function loadStock() {
    const tbody = document.getElementById('supplies-tbody');
    if (!tbody) return;
    try {
      _supplies = await API.getSupplies();
      _filtered = [..._supplies];
      renderStock();
    } catch (err) { App.toast('Error: '+err.message,'error'); }
  }

  function filterSupplies(q) {
    q = q.toLowerCase();
    _filtered = q
      ? _supplies.filter(s=>s.name.toLowerCase().includes(q)||s.code.toLowerCase().includes(q)||s.category.toLowerCase().includes(q))
      : [..._supplies];
    renderStock();
  }

  function renderStock() {
    const tbody = document.getElementById('supplies-tbody');
    if (!tbody) return;
    if (!_filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><span class="empty-icon">📦</span>Sin insumos</td></tr>`;
      return;
    }
    tbody.innerHTML = _filtered.map(s => {
      const st = s.status||'OK';
      const stColor = st==='CRITICO'?'#b71c1c':st==='BAJO'?'#e65100':'#2e7d32';
      const stBg    = st==='CRITICO'?'#fff3f3':st==='BAJO'?'#fff8e1':'#f1f8f1';
      const pct = s.stock_min>0 ? Math.min(100, Math.round((s.stock_current/s.stock_min)*100)) : 100;
      const barColor = st==='CRITICO'?'#e53935':st==='BAJO'?'#ffa000':'#43a047';
      return `<tr>
        <td><span style="font-family:monospace;font-size:12px;color:var(--text-muted)">${esc(s.code)}</span></td>
        <td><strong>${esc(s.name)}</strong>${s.brand?`<br><span style="font-size:11px;color:var(--text-muted)">${esc(s.brand)}</span>`:''}</td>
        <td><span style="font-size:11px;padding:2px 7px;background:#e3f2fd;border-radius:10px;color:#1565c0;">${esc(s.category)}</span></td>
        <td style="text-align:right">
          <span style="font-weight:700;color:${stColor}">${s.stock_current}</span>
          <span style="font-size:11px;color:var(--text-muted)"> ${esc(s.unit)}</span>
          <div style="height:4px;background:#eee;border-radius:2px;margin-top:3px;width:72px;margin-left:auto">
            <div style="height:4px;background:${barColor};border-radius:2px;width:${pct}%"></div>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-muted)">${s.stock_min} / ${s.stock_critical}</td>
        <td style="font-size:12px">${s.determinations_per_unit>1?`${s.determinations_per_unit} det/u`:'—'}</td>
        <td style="font-size:12px">${s.price_per_unit>0?`S/. ${Number(s.price_per_unit).toFixed(2)}`:'—'}</td>
        <td><span style="padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${stBg};color:${stColor}">${st}</span></td>
        <td>
          <div class="flex gap-1">
            <button class="btn btn-outline btn-sm" title="Movimiento" onclick="Supplies.openMovement(${s.id},'${esc(s.name).replace(/'/g,"\\'")}','${esc(s.unit)}')">±</button>
            <button class="btn btn-outline btn-sm" onclick="Supplies.openHistory(${s.id},'${esc(s.name).replace(/'/g,"\\'")}')">📋</button>
            <button class="btn btn-outline btn-sm" onclick="Supplies.openEdit(${s.id})">✏️</button>
            <button class="btn btn-outline btn-sm" onclick="Supplies.deleteSupply(${s.id})" style="color:var(--danger)">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ─── Tab: ABC ─────────────────────────────────────────────────────────

  async function loadABC() {
    const el = document.getElementById('supply-abc-body');
    if (!el) return;
    el.innerHTML = '<tr><td colspan="8" class="table-empty">Calculando...</td></tr>';
    try {
      const data = await API.getSupplyABC();
      if (!data.length) { el.innerHTML = '<tr><td colspan="8" class="table-empty">Sin datos de consumo en los últimos 90 días</td></tr>'; return; }
      const abcC = {A:'#b71c1c',B:'#e65100',C:'#2e7d32'};
      const abcBg= {A:'#fff3f3',B:'#fff8e1',C:'#f1f8f1'};
      el.innerHTML = data.map((s,i)=>`
        <tr>
          <td style="text-align:center;font-weight:700;color:var(--text-muted)">${i+1}</td>
          <td style="font-family:monospace;font-size:11px">${esc(s.code)}</td>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.category)}</td>
          <td style="text-align:right">${(s.total_consumed||0).toFixed(1)} ${esc(s.unit)}</td>
          <td style="text-align:right">S/. ${(s.value_consumed||0).toFixed(2)}</td>
          <td style="text-align:right">${(s.cumulative_pct||0).toFixed(1)}%</td>
          <td style="text-align:center"><span style="padding:3px 10px;border-radius:10px;font-weight:700;font-size:13px;background:${abcBg[s.abc_class]};color:${abcC[s.abc_class]}">${s.abc_class}</span></td>
        </tr>`).join('');
      const el2 = document.getElementById('supply-abc-summary');
      if (el2) {
        const counts={A:0,B:0,C:0},vals={A:0,B:0,C:0};
        data.forEach(s=>{counts[s.abc_class]++;vals[s.abc_class]+=(s.value_consumed||0);});
        const total = Object.values(vals).reduce((a,b)=>a+b,0);
        el2.innerHTML = ['A','B','C'].map(cls=>`
          <div class="card" style="text-align:center;padding:16px;border-top:4px solid ${abcC[cls]}">
            <div style="font-size:28px;font-weight:900;color:${abcC[cls]}">${cls}</div>
            <div style="font-weight:700">${counts[cls]} ítems</div>
            <div style="color:var(--text-muted);font-size:12px">S/. ${vals[cls].toFixed(2)}</div>
            <div style="color:var(--text-muted);font-size:11px">${total>0?((vals[cls]/total)*100).toFixed(1):0}% del valor</div>
          </div>`).join('');
      }
    } catch(e){el.innerHTML=`<tr><td colspan="8" class="table-empty">Error: ${esc(e.message)}</td></tr>`;}
  }

  // ─── Tab: Coverage ────────────────────────────────────────────────────

  async function loadCoverage() {
    const el = document.getElementById('supply-coverage-body');
    if (!el) return;
    el.innerHTML = '<tr><td colspan="6" class="table-empty">Calculando cobertura...</td></tr>';
    try {
      const data = await API.getSupplyCoverage();
      el.innerHTML = data.map(s=>{
        const days = s.days_remaining>=9999?'Sin datos':Math.round(s.days_remaining)+' días';
        const dN = s.days_remaining>=9999?999:s.days_remaining;
        const c = dN<7?'#b71c1c':dN<14?'#e65100':'#2e7d32';
        const bg= dN<7?'#fff3f3':dN<14?'#fff8e1':'';
        return `<tr style="background:${bg}">
          <td style="font-family:monospace;font-size:11px">${esc(s.code)}</td>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.category)}</td>
          <td style="text-align:right">${s.stock_current} ${esc(s.unit)}</td>
          <td style="text-align:right;font-weight:700;color:${c}">${days}</td>
          <td><span style="padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${bg||'#f1f8f1'};color:${c}">${s.status||'OK'}</span></td>
        </tr>`;
      }).join('');
    } catch(e){el.innerHTML=`<tr><td colspan="6" class="table-empty">Error: ${esc(e.message)}</td></tr>`;}
  }

  // ─── Tab: Test Linkages ───────────────────────────────────────────────

  async function loadLinkages() {
    const el = document.getElementById('supply-links-body');
    if (!el) return;
    el.innerHTML = '<tr><td colspan="5" class="table-empty">Cargando vínculos...</td></tr>';
    try {
      const [links, tests] = await Promise.all([API.getTestLinks(), API.getCatalog()]);
      _allTests = tests||[];
      if (!_supplies.length) _supplies = await API.getSupplies();
      if (!links.length) {
        el.innerHTML = '<tr><td colspan="5" class="table-empty">Sin vínculos. Use + Agregar Vínculo para configurar consumos por prueba.</td></tr>';
        return;
      }
      const byTest = {};
      links.forEach(l=>{
        if (!byTest[l.test_id]) byTest[l.test_id]={name:l.test_name,code:l.test_code,items:[]};
        byTest[l.test_id].items.push(l);
      });
      el.innerHTML = Object.values(byTest).map(g=>`
        <tr style="background:#f0f6ff"><td colspan="5" style="font-weight:700;color:#1565c0;padding:8px 12px">🔬 ${esc(g.name)} <span style="font-weight:400;font-size:11px;color:var(--text-muted)">(${esc(g.code)})</span></td></tr>
        ${g.items.map(l=>`<tr>
          <td style="padding-left:24px">${esc(l.supply_name)}</td>
          <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${esc(l.supply_code)}</td>
          <td style="font-size:12px">${esc(l.unit)}</td>
          <td style="text-align:center">
            <input type="number" value="${l.quantity_per_test}" min="0.001" step="0.001"
              style="width:80px;padding:4px 6px;border:1.5px solid var(--border);border-radius:4px;text-align:center;font-size:13px"
              onchange="Supplies.updateLink(${l.id},this.value)">
          </td>
          <td style="text-align:center"><button class="btn btn-outline btn-sm" onclick="Supplies.deleteLink(${l.id})" style="color:var(--danger)">🗑</button></td>
        </tr>`).join('')}`).join('');
    } catch(e){el.innerHTML=`<tr><td colspan="5" class="table-empty">Error: ${esc(e.message)}</td></tr>`;}
  }

  async function updateLink(id, qty) {
    try { await API.updateTestLink(id,{quantity_per_test:parseFloat(qty)}); App.toast('Actualizado','success'); }
    catch(e){App.toast(e.message,'error');}
  }

  async function deleteLink(id) {
    if(!confirm('¿Eliminar vínculo?')) return;
    try { await API.deleteTestLink(id); App.toast('Eliminado','success'); loadLinkages(); }
    catch(e){App.toast(e.message,'error');}
  }

  function openAddLink() {
    if (!_supplies.length||!_allTests.length) { App.toast('Cargue primero la sección de vínculos','error'); return; }
    const supsOpts = _supplies.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join('');
    const testOpts = _allTests.map(t=>`<option value="${t.id}">${esc(t.name)} (${esc(t.code)})</option>`).join('');
    document.getElementById('link-supply-select').innerHTML = '<option value="">— Insumo —</option>'+supsOpts;
    document.getElementById('link-test-select').innerHTML   = '<option value="">— Prueba —</option>'+testOpts;
    document.getElementById('link-qty').value = '1';
    App.openModal('modal-overlay-supply-link');
  }

  async function submitLink() {
    const test_id   = document.getElementById('link-test-select').value;
    const supply_id = document.getElementById('link-supply-select').value;
    const qty = parseFloat(document.getElementById('link-qty').value)||1;
    if(!test_id||!supply_id) return App.toast('Seleccione prueba e insumo','error');
    try {
      await API.createTestLink({test_id,supply_id,quantity_per_test:qty});
      App.closeModal('modal-overlay-supply-link');
      App.toast('Vínculo creado','success');
      loadLinkages();
    } catch(e){App.toast(e.message,'error');}
  }

  // ─── Tab: Purchase Orders ─────────────────────────────────────────────

  async function loadPO() {
    const el = document.getElementById('supply-po-body');
    if (!el) return;
    el.innerHTML = '<tr><td colspan="7" class="table-empty">Cargando...</td></tr>';
    try {
      const orders = await API.getPurchaseOrders();
      if (!orders.length) {
        el.innerHTML = '<tr><td colspan="7" class="table-empty"><span class="empty-icon">🛒</span>Sin órdenes de compra</td></tr>';
        return;
      }
      const stColors={DRAFT:'#607d8b',CONFIRMED:'#1565c0',RECEIVED:'#2e7d32',CANCELLED:'#e53935'};
      const stLabels={DRAFT:'Borrador',CONFIRMED:'Confirmada',RECEIVED:'Recibida',CANCELLED:'Cancelada'};
      el.innerHTML = orders.map(po=>`
        <tr>
          <td><strong style="font-family:monospace;font-size:12px">${esc(po.po_number)}</strong></td>
          <td>${esc(po.supplier)}</td>
          <td style="font-size:12px;color:var(--text-muted)">${new Date(po.created_at).toLocaleDateString('es-ES')}</td>
          <td style="text-align:right">${po.item_count||0} ítem(s)</td>
          <td style="text-align:right;font-weight:700;color:var(--primary)">S/. ${Number(po.total_amount||0).toFixed(2)}</td>
          <td><span style="padding:3px 9px;border-radius:10px;font-size:11px;font-weight:700;background:${stColors[po.status]}22;color:${stColors[po.status]}">${stLabels[po.status]||po.status}</span></td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-outline btn-sm" onclick="Supplies.viewPO(${po.id})" title="Ver">👁</button>
              <button class="btn btn-outline btn-sm" onclick="Supplies.printPO(${po.id})" title="Imprimir">🖨</button>
              ${po.status==='DRAFT'?`<button class="btn btn-outline btn-sm" onclick="Supplies.confirmPO(${po.id})" title="Confirmar" style="color:#1565c0">✓</button>`:''}
              ${po.status==='CONFIRMED'?`<button class="btn btn-outline btn-sm" onclick="Supplies.receivePO(${po.id})" title="Recibida" style="color:#2e7d32">📥</button>`:''}
            </div>
          </td>
        </tr>`).join('');
    } catch(e){el.innerHTML=`<tr><td colspan="7" class="table-empty">Error: ${esc(e.message)}</td></tr>`;}
  }

  function openCreatePO() {
    _poItems = [];
    document.getElementById('po-supplier').value = '';
    document.getElementById('po-notes').value = '';
    renderPOItems();
    App.openModal('modal-overlay-po');
  }

  function renderPOItems() {
    const el = document.getElementById('po-items-list');
    if (!el) return;
    const supsOpts = _supplies.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.unit)})</option>`).join('');
    if (!_poItems.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Use "+ Agregar Ítem" para añadir insumos</div>';
    } else {
      el.innerHTML = _poItems.map((item,idx)=>`
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px;">
          <select onchange="Supplies.updatePOItem(${idx},'supply_id',this.value)" style="padding:7px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
            <option value="">— Insumo —</option>${supsOpts.replace(`value="${item.supply_id}"`,`value="${item.supply_id}" selected`)}
          </select>
          <input type="number" placeholder="Cantidad" value="${item.quantity_ordered||''}" min="0.01" step="any"
            oninput="Supplies.updatePOItem(${idx},'quantity_ordered',this.value)"
            style="padding:7px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
          <input type="number" placeholder="S/. Unitario" value="${item.unit_price||''}" min="0" step="0.01"
            oninput="Supplies.updatePOItem(${idx},'unit_price',this.value)"
            style="padding:7px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
          <input type="text" placeholder="Marca" value="${esc(item.brand||'')}"
            oninput="Supplies.updatePOItem(${idx},'brand',this.value)"
            style="padding:7px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
          <button onclick="Supplies.removePOItem(${idx})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;padding:4px">✕</button>
        </div>`).join('');
    }
    const total = _poItems.reduce((s,i)=>s+(parseFloat(i.quantity_ordered)||0)*(parseFloat(i.unit_price)||0),0);
    const el2 = document.getElementById('po-total');
    if (el2) el2.textContent = `Total: S/. ${total.toFixed(2)}`;
  }

  function addPOItem() { _poItems.push({supply_id:'',quantity_ordered:'',unit_price:'',brand:''}); renderPOItems(); }
  function removePOItem(idx) { _poItems.splice(idx,1); renderPOItems(); }
  function updatePOItem(idx,field,val) { _poItems[idx][field]=val; }

  async function submitPO() {
    const supplier = document.getElementById('po-supplier').value.trim();
    const notes    = document.getElementById('po-notes').value.trim();
    if (!supplier) return App.toast('Ingrese el proveedor','error');
    const items = _poItems.filter(i=>i.supply_id&&i.quantity_ordered>0);
    if (!items.length) return App.toast('Agregue al menos un ítem válido','error');
    try {
      await API.createPurchaseOrder({supplier,notes,items});
      App.closeModal('modal-overlay-po');
      App.toast('Orden de compra creada','success');
      loadPO();
    } catch(e){App.toast(e.message,'error');}
  }

  async function viewPO(id) {
    try {
      const po = await API.getPurchaseOrder(id);
      const stL={DRAFT:'Borrador',CONFIRMED:'Confirmada',RECEIVED:'Recibida',CANCELLED:'Cancelada'};
      document.getElementById('po-detail-title').textContent = `OC: ${po.po_number}`;
      document.getElementById('po-detail-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px">
          <div><strong>Proveedor:</strong> ${esc(po.supplier)}</div>
          <div><strong>Estado:</strong> ${stL[po.status]||po.status}</div>
          <div><strong>Creada:</strong> ${new Date(po.created_at).toLocaleString('es-ES')}</div>
          <div><strong>Total:</strong> <span style="color:var(--primary);font-weight:700">S/. ${Number(po.total_amount||0).toFixed(2)}</span></div>
          ${po.notes?`<div style="grid-column:1/-1"><strong>Notas:</strong> ${esc(po.notes)}</div>`:''}
        </div>
        <table class="data-table"><thead><tr><th>Insumo</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th><th>Marca</th></tr></thead>
        <tbody>${po.items.map(i=>`<tr>
          <td>${esc(i.supply_name)}</td>
          <td style="text-align:right">${i.quantity_ordered} ${esc(i.unit||'')}</td>
          <td style="text-align:right">S/. ${Number(i.unit_price||0).toFixed(2)}</td>
          <td style="text-align:right;font-weight:600">S/. ${(i.quantity_ordered*(i.unit_price||0)).toFixed(2)}</td>
          <td>${esc(i.brand||'—')}</td>
        </tr>`).join('')}</tbody></table>`;
      App.openModal('modal-overlay-po-detail');
    } catch(e){App.toast(e.message,'error');}
  }

  async function confirmPO(id) {
    if(!confirm('¿Confirmar OC?')) return;
    try { await API.updatePOStatus(id,'CONFIRMED'); App.toast('OC confirmada','success'); loadPO(); }
    catch(e){App.toast(e.message,'error');}
  }

  async function receivePO(id) {
    if(!confirm('¿Marcar como recibida? Esto actualizará el stock automáticamente.')) return;
    try { await API.updatePOStatus(id,'RECEIVED'); App.toast('Stock actualizado','success'); loadPO(); loadAlerts(); if(typeof Notifications!=='undefined')Notifications.poll(); }
    catch(e){App.toast(e.message,'error');}
  }

  function printPO(id) { window.open(`/report/purchase-order/${id}`,'_blank'); }

  // ─── Supply Create/Edit ────────────────────────────────────────────────

  function openCreate() {
    _editId = null;
    document.getElementById('supply-modal-title').textContent = 'Nuevo Insumo';
    ['sup-code','sup-name','sup-unit','sup-supplier','sup-notes','sup-brand'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    ['sup-price','sup-determ','sup-lead'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=id==='sup-price'?'0':id==='sup-determ'?'1':'7';});
    document.getElementById('sup-category').value='';
    document.getElementById('sup-min').value='0';
    document.getElementById('sup-critical').value='0';
    const ce=document.getElementById('sup-code');if(ce)ce.removeAttribute('readonly');
    App.openModal('modal-overlay-supply');
  }

  async function openEdit(id) {
    try {
      const all = await API.getSupplies();
      const s = all.find(x=>x.id===id);
      if (!s) return;
      _editId = id;
      document.getElementById('supply-modal-title').textContent = 'Editar Insumo';
      document.getElementById('sup-code').value = s.code||'';
      document.getElementById('sup-name').value = s.name||'';
      document.getElementById('sup-category').value = s.category||'';
      document.getElementById('sup-unit').value = s.unit||'';
      document.getElementById('sup-min').value = s.stock_min??0;
      document.getElementById('sup-critical').value = s.stock_critical??0;
      document.getElementById('sup-supplier').value = s.supplier||'';
      document.getElementById('sup-notes').value = s.notes||'';
      const b=document.getElementById('sup-brand');if(b)b.value=s.brand||'';
      const p=document.getElementById('sup-price');if(p)p.value=s.price_per_unit||0;
      const d=document.getElementById('sup-determ');if(d)d.value=s.determinations_per_unit||1;
      const l=document.getElementById('sup-lead');if(l)l.value=s.lead_time_days||7;
      const ce=document.getElementById('sup-code');if(ce)ce.setAttribute('readonly',true);
      App.openModal('modal-overlay-supply');
    } catch(e){App.toast(e.message,'error');}
  }

  async function submitSupply() {
    const data = {
      code: document.getElementById('sup-code').value.trim().toUpperCase(),
      name: document.getElementById('sup-name').value.trim(),
      category: document.getElementById('sup-category').value,
      unit: document.getElementById('sup-unit').value.trim(),
      stock_min: parseFloat(document.getElementById('sup-min').value)||0,
      stock_critical: parseFloat(document.getElementById('sup-critical').value)||0,
      supplier: document.getElementById('sup-supplier').value.trim(),
      notes: document.getElementById('sup-notes').value.trim(),
      brand: document.getElementById('sup-brand')?.value.trim()||'',
      price_per_unit: parseFloat(document.getElementById('sup-price')?.value)||0,
      determinations_per_unit: parseFloat(document.getElementById('sup-determ')?.value)||1,
      lead_time_days: parseInt(document.getElementById('sup-lead')?.value)||7,
    };
    if(!data.code||!data.name||!data.category||!data.unit) return App.toast('Campos requeridos incompletos','error');
    try {
      if (_editId) { await API.updateSupply(_editId,data); App.toast('Insumo actualizado','success'); }
      else { await API.createSupply(data); App.toast('Insumo creado','success'); }
      App.closeModal('modal-overlay-supply');
      loadStock();
    } catch(e){App.toast(e.message,'error');}
  }

  async function deleteSupply(id) {
    if(!confirm('¿Eliminar este insumo?')) return;
    try { await API.deleteSupply(id); App.toast('Insumo eliminado','success'); loadStock(); }
    catch(e){App.toast(e.message,'error');}
  }

  // ─── Movements ────────────────────────────────────────────────────────

  function openMovement(id, name, unit) {
    _movId = id;
    document.getElementById('mov-supply-name').textContent = name;
    const s = _supplies.find(x=>x.id===id);
    document.getElementById('mov-current-stock').textContent = s ? `Stock actual: ${s.stock_current} ${s.unit}` : '';
    document.getElementById('mov-unit-label').textContent = `(${unit})`;
    document.getElementById('mov-type').value = 'IN';
    document.getElementById('mov-quantity').value = '';
    document.getElementById('mov-reason').value = '';
    document.getElementById('mov-reference').value = '';
    App.openModal('modal-overlay-movement');
  }

  async function submitMovement() {
    const data = {
      type: document.getElementById('mov-type').value,
      quantity: parseFloat(document.getElementById('mov-quantity').value),
      reason: document.getElementById('mov-reason').value.trim(),
      reference: document.getElementById('mov-reference').value.trim(),
    };
    if (!data.quantity||data.quantity<=0) return App.toast('Ingrese cantidad válida','error');
    try {
      await API.addSupplyMovement(_movId,data);
      App.closeModal('modal-overlay-movement');
      App.toast('Movimiento registrado','success');
      loadStock(); loadAlerts();
      if(typeof Notifications!=='undefined') Notifications.poll();
    } catch(e){App.toast(e.message,'error');}
  }

  async function openHistory(id, name) {
    try {
      const rows = await API.getSupplyMovements(id);
      document.getElementById('history-supply-title').textContent = `Historial — ${name}`;
      const body = document.getElementById('history-supply-body');
      body.innerHTML = rows.length ? `
        <table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Referencia</th><th>Usuario</th></tr></thead>
        <tbody>${rows.map(r=>`<tr>
          <td style="font-size:12px">${new Date(r.created_at).toLocaleString('es-ES')}</td>
          <td><span style="font-weight:700;color:${r.type==='IN'?'#2e7d32':'#e53935'}">${r.type==='IN'?'▲ Entrada':'▼ Salida'}</span></td>
          <td style="text-align:right;font-weight:600">${r.quantity}</td>
          <td>${esc(r.reason||'—')}</td>
          <td style="font-size:11px;color:var(--text-muted)">${esc(r.reference||'—')}</td>
          <td style="font-size:11px">${esc(r.user_name||'—')}</td>
        </tr>`).join('')}</tbody></table>` :
        '<p style="color:var(--text-muted);padding:16px">Sin movimientos registrados.</p>';
      App.openModal('modal-overlay-supply-history');
    } catch(e){App.toast(e.message,'error');}
  }

  function openReplenishReport() { window.open('/report/supplies/replenish','_blank'); }

  function esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    load, showTab, filterSupplies,
    loadABC, loadCoverage, loadLinkages, loadPO,
    openCreate, openEdit, submitSupply, deleteSupply,
    openMovement, submitMovement, openHistory, openReplenishReport,
    updateLink, deleteLink, openAddLink, submitLink,
    openCreatePO, addPOItem, removePOItem, updatePOItem, submitPO,
    viewPO, confirmPO, receivePO, printPO,
  };
})();

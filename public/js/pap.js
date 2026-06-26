'use strict';

const BETHESDA_LABELS = {
  NILM:               { label: 'NILM',        color: '#065f46', bg: '#d1fae5' },
  ASCUS:              { label: 'ASCUS',        color: '#92400e', bg: '#fef3c7' },
  AGUS:               { label: 'AGUS',         color: '#92400e', bg: '#fef3c7' },
  LSIL:               { label: 'LSIL',         color: '#c2410c', bg: '#ffedd5' },
  HSIL:               { label: 'HSIL',         color: '#991b1b', bg: '#fee2e2' },
  CARCINOMA_ESCAMOSO: { label: 'CA. ESCAMOSO', color: '#7f1d1d', bg: '#fca5a5' },
  ADENOCARCINOMA:     { label: 'ADENOCA.',     color: '#7f1d1d', bg: '#fca5a5' },
  INSATISFACTORIO:    { label: 'INSATIS.',     color: '#374151', bg: '#f3f4f6' },
};

function bethesdaBadge(codigo) {
  const b = BETHESDA_LABELS[codigo] || { label: codigo || '—', color: '#374151', bg: '#f3f4f6' };
  return `<span style="background:${b.bg};color:${b.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${b.label}</span>`;
}

// ─── MÓDULO PAQUETES ──────────────────────────────────────────────────────────
const PapPaquetes = (() => {
  let paquetes = [];

  const load = async () => {
    try {
      paquetes = await fetch('/api/pap/paquetes', { credentials: 'include' }).then(r => r.json());
      render();
    } catch (e) { console.error('PAP paquetes:', e); }
  };

  const render = () => {
    const el = document.getElementById('pap-paquetes-list');
    if (!el) return;
    if (!paquetes.length) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:60px;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">🔬</div>
        <p>No hay paquetes PAP registrados</p>
        <button class="btn btn-primary" onclick="PapPaquetes.openCreate()" style="margin-top:12px">+ Registrar primer paquete</button>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="card">
      <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>PAQUETE</th>
            <th>FECHA</th>
            <th style="text-align:center">LÁMINAS</th>
            <th style="text-align:center">CODIFICADOS</th>
            <th style="text-align:center">ESTADO</th>
            <th style="text-align:center">ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${paquetes.map(p => `
            <tr>
              <td>
                <div style="font-weight:600;font-size:13px">${p.nombre}</div>
                <div style="font-size:11px;color:#94a3b8">${p.indicacion || 'PARTICULAR'}</div>
              </td>
              <td>${p.fecha_recepcion}</td>
              <td style="text-align:center;font-weight:600">${p.total_laminas}</td>
              <td style="text-align:center">
                <span class="badge ${p.codificados == p.total_laminas ? 'badge-DELIVERED' : 'badge-IN_PROCESS'}">
                  ${p.codificados || 0}/${p.total_laminas}
                </span>
              </td>
              <td style="text-align:center">
                <span class="badge ${p.estado === 'COMPLETADO' ? 'badge-DELIVERED' : 'badge-IN_PROCESS'}">
                  ${p.estado}
                </span>
              </td>
              <td style="text-align:center">
                <button onclick="PapPaquetes.verDetalle(${p.id})"
                  class="btn btn-primary btn-sm">Ver detalle</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  };

  const openCreate = () => {
    const overlay = document.createElement('div');
    overlay.id = 'pap-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>🔬 Nuevo Paquete PAP</h3>
          <button class="modal-close" onclick="document.getElementById('pap-modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="form-group">
            <label>NOMBRE DEL PAQUETE *</label>
            <input id="pap-nombre" type="text" placeholder="Ej: Paquete Marzo 2026 - ANCO">
          </div>
          <div class="form-group">
            <label>FECHA DE RECEPCIÓN *</label>
            <input id="pap-fecha" type="date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>INDICACIÓN</label>
            <select id="pap-indicacion">
              <option value="PARTICULAR">PARTICULAR</option>
              <option value="SIS">SIS</option>
              <option value="ESSALUD">ESSALUD</option>
            </select>
          </div>
          <div class="form-group">
            <label>OBSERVACIONES</label>
            <textarea id="pap-obs" rows="2" placeholder="Observaciones generales del paquete..."></textarea>
          </div>
          <p style="font-size:12px;color:#64748b;margin:0">
            💡 Los pacientes se cargan desde el Generador PAP tras procesar el Excel.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('pap-modal-overlay').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="PapPaquetes.guardar()">Crear Paquete</button>
        </div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  const guardar = async () => {
    const nombre       = document.getElementById('pap-nombre')?.value?.trim();
    const fecha        = document.getElementById('pap-fecha')?.value;
    const indicacion   = document.getElementById('pap-indicacion')?.value;
    const observaciones= document.getElementById('pap-obs')?.value?.trim();
    if (!nombre || !fecha) { App.showToast('Completa los campos requeridos', 'error'); return; }
    try {
      const res = await fetch('/api/pap/paquetes', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, fecha_recepcion: fecha, indicacion, observaciones, pacientes: [] })
      });
      const data = await res.json();
      if (data.paqueteId) {
        App.showToast('Paquete creado correctamente', 'success');
        document.getElementById('pap-modal-overlay')?.remove();
        load();
      } else throw new Error(data.error);
    } catch (e) { App.showToast('Error: ' + e.message, 'error'); }
  };

  const verDetalle = async (id) => {
    try {
      const data = await fetch(`/api/pap/paquetes/${id}`, { credentials: 'include' }).then(r => r.json());
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-wide" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>🔬 ${data.nombre}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
          </div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
              <div class="stat-card"><div class="stat-label">FECHA RECEPCIÓN</div><div class="stat-value" style="font-size:16px">${data.fecha_recepcion}</div></div>
              <div class="stat-card"><div class="stat-label">INDICACIÓN</div><div class="stat-value" style="font-size:16px">${data.indicacion}</div></div>
              <div class="stat-card"><div class="stat-label">TOTAL LÁMINAS</div><div class="stat-value">${data.total_laminas}</div></div>
            </div>
            ${data.resultados?.length ? `
            <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>
                <th>CÓDIGO</th><th>IPRESS</th><th>PACIENTE</th>
                <th style="text-align:center">EDAD</th><th style="text-align:center">RESULTADO</th>
              </tr></thead>
              <tbody>
                ${data.resultados.map(r => `
                  <tr>
                    <td style="font-family:monospace;font-weight:600;color:#1d4ed8">${r.codigo}</td>
                    <td>${r.ipress}</td>
                    <td>${r.paciente}</td>
                    <td style="text-align:center">${r.edad || '—'}</td>
                    <td style="text-align:center">${bethesdaBadge(r.resultado_bethesda)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
            </div>` : '<p class="table-empty"><span class="empty-icon">🔬</span>Sin láminas codificadas aún</p>'}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          </div>
        </div>`;
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    } catch (e) { App.showToast('Error cargando detalle', 'error'); }
  };

  return { load, render, openCreate, guardar, verDetalle };
})();

// ─── MÓDULO RESULTADOS ────────────────────────────────────────────────────────
const PapResultados = (() => {
  let todos = [];

  const load = async () => {
    try {
      const params = new URLSearchParams({
        q:        document.getElementById('pap-search')?.value          || '',
        bethesda: document.getElementById('pap-filter-bethesda')?.value || '',
        ipress:   document.getElementById('pap-filter-ipress')?.value   || '',
        desde:    document.getElementById('pap-filter-desde')?.value    || '',
        hasta:    document.getElementById('pap-filter-hasta')?.value    || '',
      });
      todos = await fetch(`/api/pap/resultados?${params}`, { credentials: 'include' }).then(r => r.json());
      render();
    } catch (e) { console.error('PAP resultados:', e); }
  };

  const filtrar = () => load();

  const render = () => {
    const el = document.getElementById('pap-resultados-list');
    if (!el) return;
    if (!todos.length) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:60px;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:12px">📊</div>
        <p>No se encontraron resultados con los filtros aplicados</p>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">${todos.length} resultado(s) encontrado(s)</div>
      <div class="card">
      <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>CÓDIGO PAP</th><th>IPRESS</th><th>PACIENTE</th>
            <th style="text-align:center">EDAD</th><th style="text-align:center">RESULTADO</th>
            <th>FECHA</th><th>PAQUETE</th>
          </tr>
        </thead>
        <tbody>
          ${todos.map(r => `
            <tr>
              <td style="font-family:monospace;font-weight:700;color:#1d4ed8;white-space:nowrap">${r.codigo}</td>
              <td style="font-size:12px">${r.ipress}</td>
              <td>${r.paciente}</td>
              <td style="text-align:center">${r.edad || '—'}</td>
              <td style="text-align:center">${bethesdaBadge(r.resultado_bethesda)}</td>
              <td style="font-size:12px;white-space:nowrap">${r.fecha_recepcion || '—'}</td>
              <td style="font-size:11px;color:#64748b">${r.paquete_nombre || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
      </div>`;
  };

  const exportar = () => {
    if (!todos.length) { App.showToast('No hay datos para exportar', 'error'); return; }
    const headers = ['Código PAP','IPRESS','Paciente','Edad','Resultado Bethesda','Fecha Recepción','Paquete'];
    const rows = todos.map(r => [r.codigo, r.ipress, r.paciente, r.edad||'', r.resultado_bethesda, r.fecha_recepcion||'', r.paquete_nombre||'']);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resultados_PAP_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.showToast('Exportado correctamente', 'success');
  };

  return { load, filtrar, render, exportar };
})();

// ─── Inicialización ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('sectionChange', (e) => {
    if (e.detail === 'pap-paquetes')   PapPaquetes.load();
    if (e.detail === 'pap-resultados') PapResultados.load();
  });
});

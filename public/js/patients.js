/* ── Patients Module ─────────────────────────────────────────────────────── */
'use strict';

const Patients = (() => {
  let searchTimer = null;

  async function load(query = '') {
    try {
      const patients = await API.getPatients(query);
      render(patients);
    } catch (err) {
      App.toast('Error al cargar pacientes: ' + err.message, 'error');
    }
  }

  function search(query) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(query), 300);
  }

  function render(patients) {
    const tbody = document.getElementById('patients-tbody');
    const user  = App.getUser();
    const canEdit = user && (user.role === 'RECEPTIONIST' || user.role === 'ADMIN');

    if (!patients.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><span class="empty-icon">👤</span>No se encontraron pacientes. Pruebe otra búsqueda o registre un nuevo paciente.</td></tr>`;
      return;
    }

    tbody.innerHTML = patients.map(p => `
      <tr>
        <td>
          <strong>${esc(p.name)}</strong>
        </td>
        <td><span style="font-family:monospace">${esc(p.id_number)}</span></td>
        <td>${esc(p.dob)} <span class="text-muted text-sm">(${App.calcAge(p.dob)} años)</span></td>
        <td>${p.gender === 'M' ? 'Masculino' : 'Femenino'}</td>
        <td>${esc(p.contact) || '<span class="text-muted">—</span>'}</td>
        <td class="text-muted">${App.formatDate(p.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="Patients.viewHistory(${p.id}, '${esc(p.name)}')">Historial</button>
          ${canEdit ? `<button class="btn btn-sm btn-outline" onclick="Patients.openEdit(${p.id})">Editar</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  function openCreate() {
    clearForm();
    document.getElementById('patient-modal-title').textContent = 'Registrar Paciente';
    document.getElementById('patient-edit-id').value = '';
    App.openModal('modal-overlay-patient');
  }

  async function openEdit(id) {
    try {
      const p = await API.getPatient(id);
      document.getElementById('patient-modal-title').textContent = 'Editar Paciente';
      document.getElementById('patient-edit-id').value = p.id;
      document.getElementById('patient-name').value     = p.name;
      document.getElementById('patient-dob').value      = p.dob;
      document.getElementById('patient-gender').value   = p.gender;
      document.getElementById('patient-id-number').value = p.id_number;
      document.getElementById('patient-contact').value  = p.contact || '';
      App.openModal('modal-overlay-patient');
    } catch (err) {
      App.toast('Error al cargar paciente: ' + err.message, 'error');
    }
  }

  async function submit() {
    const id      = document.getElementById('patient-edit-id').value;
    const name    = document.getElementById('patient-name').value.trim();
    const dob     = document.getElementById('patient-dob').value;
    const gender  = document.getElementById('patient-gender').value;
    const id_num  = document.getElementById('patient-id-number').value.trim();
    const contact = document.getElementById('patient-contact').value.trim();

    if (!name || !dob || !gender || !id_num) {
      App.toast('Por favor complete todos los campos requeridos', 'warning');
      return;
    }

    try {
      if (id) {
        await API.updatePatient(id, { name, dob, gender, id_number: id_num, contact });
        App.toast('Paciente actualizado correctamente', 'success');
      } else {
        await API.createPatient({ name, dob, gender, id_number: id_num, contact });
        App.toast('Paciente registrado correctamente', 'success');
      }
      App.closeModal('modal-overlay-patient');
      load(document.getElementById('patient-search').value);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function viewHistory(id, name) {
    document.getElementById('history-modal-title').textContent = `Historial — ${name}`;
    document.getElementById('history-modal-body').innerHTML = '<div style="text-align:center;padding:20px">Cargando...</div>';
    App.openModal('modal-overlay-history');

    try {
      const [patient, orders] = await Promise.all([
        API.getPatient(id),
        API.getPatientOrders(id)
      ]);

      const info = `
        <div class="order-detail-header" style="margin-bottom:16px;">
          <div class="info-grid">
            <div class="info-item"><label>Nombre</label><span>${esc(patient.name)}</span></div>
            <div class="info-item"><label>F. Nacimiento</label><span>${esc(patient.dob)} (${App.calcAge(patient.dob)} años)</span></div>
            <div class="info-item"><label>Sexo</label><span>${patient.gender === 'M' ? 'Masculino' : 'Femenino'}</span></div>
            <div class="info-item"><label>N° Documento</label><span>${esc(patient.id_number)}</span></div>
            <div class="info-item"><label>Contacto</label><span>${esc(patient.contact) || '—'}</span></div>
          </div>
        </div>
      `;

      const ordersHtml = orders.length
        ? `<table class="data-table">
            <thead><tr><th>N° Orden</th><th>Pruebas</th><th>Estado</th><th>Validado</th><th>Fecha</th><th>Informe</th></tr></thead>
            <tbody>
              ${orders.map(o => `
                <tr>
                  <td style="font-family:monospace;font-size:12px;">${esc(o.order_number)}</td>
                  <td>${o.test_count}</td>
                  <td>${App.statusBadge(o.status)}</td>
                  <td>${o.validated_count}/${o.test_count}</td>
                  <td>${App.formatDate(o.created_at)}</td>
                  <td>
                    ${o.validated_count > 0
                      ? `<button class="btn btn-sm btn-outline" onclick="window.open('/report/${o.id}', '_blank')">Informe</button>`
                      : '<span class="text-muted text-sm">Pendiente</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
           </table>`
        : `<div class="table-empty"><span class="empty-icon">📋</span>No se encontraron órdenes para este paciente</div>`;

      document.getElementById('history-modal-body').innerHTML = info + ordersHtml;
    } catch (err) {
      document.getElementById('history-modal-body').innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
    }
  }

  function clearForm() {
    ['patient-name','patient-dob','patient-gender','patient-id-number','patient-contact']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, search, openCreate, openEdit, submit, viewHistory };
})();

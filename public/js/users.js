/* ── Users Module (Admin only) ───────────────────────────────────────────── */
'use strict';

const Users = (() => {
  let editingId = null;
  let lastUsers = [];

  const ROLE_LABELS = {
    RECEPTIONIST: 'Recepcionista',
    TECHNICIAN:   'Técnico',
    BIOCHEMIST:   'Bioquímico',
    ADMIN:        'Administrador',
  };

  async function load() {
    const tbodyLoad = document.getElementById('users-tbody');
    if (tbodyLoad) tbodyLoad.innerHTML = `<tr><td colspan="6" class="table-empty">Cargando...</td></tr>`;
    try {
      const users = await API.getUsers();
      lastUsers = users;
      render(filterBySearch(users, document.getElementById('users-search')?.value || ''));
    } catch (err) {
      App.toast('Error al cargar usuarios: ' + err.message, 'error');
    }
  }

  function filterBySearch(users, query) {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.username  || '').toLowerCase().includes(q)
    );
  }

  function search(query) {
    render(filterBySearch(lastUsers, query));
  }

  function render(users) {
    const tbody = document.getElementById('users-tbody');
    const me    = App.getUser();

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><span class="empty-icon">👥</span>No se encontraron usuarios</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr style="${!u.active ? 'opacity:.5;' : ''}">
        <td>
          <strong>${esc(u.full_name)}</strong>
          ${u.id === me?.id ? '<span class="text-muted text-sm">(tú)</span>' : ''}
        </td>
        <td><span style="font-family:monospace">${esc(u.username)}</span></td>
        <td><span class="badge badge-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
        <td>
          <span style="color:${u.active ? 'var(--success)' : 'var(--danger)'}">
            ${u.active ? '● Activo' : '○ Inactivo'}
          </span>
        </td>
        <td class="text-muted">${App.formatDate(u.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="Users.openEdit(${u.id})">Editar</button>
          ${u.id !== me?.id
            ? `<button class="btn btn-sm btn-ghost" style="color:${u.active ? 'var(--danger)' : 'var(--success)'}"
                 onclick="Users.toggleActive(${u.id}, ${u.active ? 0 : 1})">
                 ${u.active ? 'Desactivar' : 'Activar'}
               </button>`
            : ''}
        </td>
      </tr>
    `).join('');
  }

  function openCreate() {
    editingId = null;
    clearForm();
    document.getElementById('user-modal-title').textContent = 'Agregar Usuario';
    document.getElementById('user-username').disabled = false;
    document.getElementById('pwd-label-hint').textContent = '(requerida)';
    App.openModal('modal-overlay-user');
  }

  async function openEdit(id) {
    try {
      const users = await API.getUsers();
      const u = users.find(x => x.id === id);
      if (!u) { App.toast('User not found', 'error'); return; }

      editingId = id;
      document.getElementById('user-modal-title').textContent = 'Editar Usuario';
      document.getElementById('user-fullname').value  = u.full_name;
      document.getElementById('user-username').value  = u.username;
      document.getElementById('user-username').disabled = true;
      document.getElementById('user-password').value  = '';
      document.getElementById('user-role').value      = u.role;
      document.getElementById('pwd-label-hint').textContent = '(dejar en blanco para mantener actual)';

      App.openModal('modal-overlay-user');
    } catch (err) {
      App.toast('Failed to load user: ' + err.message, 'error');
    }
  }

  async function submit() {
    const full_name = document.getElementById('user-fullname').value.trim();
    const username  = document.getElementById('user-username').value.trim();
    const password  = document.getElementById('user-password').value;
    const role      = document.getElementById('user-role').value;

    if (!full_name || (!editingId && !username) || !role) {
      App.toast('Por favor complete todos los campos requeridos', 'warning');
      return;
    }

    if (!editingId && !password) {
      App.toast('La contraseña es requerida para nuevos usuarios', 'warning');
      return;
    }

    try {
      if (editingId) {
        const body = { full_name, role };
        if (password) body.password = password;
        await API.updateUser(editingId, body);
        App.toast('Usuario actualizado', 'success');
      } else {
        await API.createUser({ username, password, full_name, role });
        App.toast('Usuario creado', 'success');
      }
      App.closeModal('modal-overlay-user');
      load();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function toggleActive(id, newActive) {
    if (!confirm(`¿Está seguro de que desea ${newActive ? 'activar' : 'desactivar'} este usuario?`)) return;

    try {
      if (!newActive) {
        await API.deleteUser(id);
      } else {
        await API.updateUser(id, { active: 1 });
      }
      App.toast(newActive ? 'Usuario activado' : 'Usuario desactivado', 'success');
      load();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function clearForm() {
    ['user-fullname', 'user-username', 'user-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.disabled = false; }
    });
    document.getElementById('user-role').value = '';
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load, search, openCreate, openEdit, submit, toggleActive };
})();

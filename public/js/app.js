/* ── App Core ────────────────────────────────────────────────────────────── */
'use strict';

const App = (() => {
  let currentUser = null;
  let currentSection = 'dashboard';

  // ─── Navigation config per role ────────────────────────────────────────
  const NAV_CONFIG = {
    RECEPTIONIST: [
      { id: 'dashboard', label: 'Panel Principal',         icon: '📊' },
      { id: 'patients',  label: 'Pacientes',               icon: '👤' },
      { id: 'orders',    label: 'Órdenes',                 icon: '📋' },
      { id: 'billing',   label: 'Caja / Cobros',           icon: '💰' },
    ],
    TECHNICIAN: [
      { id: 'dashboard', label: 'Panel Principal',         icon: '📊' },
      { id: 'results',   label: 'Ingreso de Resultados',   icon: '🧪' },
      { id: 'supplies',  label: 'Control de Insumos',      icon: '📦' },
    ],
    BIOCHEMIST: [
      { id: 'dashboard',   label: 'Panel Principal',       icon: '📊' },
      { id: 'validation',  label: 'Validación',            icon: '✅' },
    ],
    ADMIN: [
      { id: 'dashboard',   label: 'Panel Principal',       icon: '🏠' },
      { id: 'patients',    label: 'Pacientes',             icon: '👤' },
      { id: 'orders',      label: 'Órdenes',               icon: '📋' },
      { id: 'results',     label: 'Ingreso de Resultados', icon: '🧪' },
      { id: 'validation',  label: 'Validación',            icon: '✅' },
      { id: 'catalog',     label: 'Catálogo de Pruebas',   icon: '🔬' },
      { id: 'supplies',    label: 'Control de Insumos',    icon: '📦' },
      { id: 'users',       label: 'Usuarios',              icon: '👥' },
      { id: 'billing',     label: 'Caja / Cobros',         icon: '💰' },
      { id: 'finance',     label: 'Finanzas',              icon: '📊' },
    ]
  };

  // ─── Section → on-load callback mapping ────────────────────────────────
  const SECTION_LOADERS = {
    dashboard:  () => typeof Dashboard !== 'undefined' && Dashboard.load(),
    patients:   () => typeof Patients  !== 'undefined' && Patients.load(),
    orders:     () => typeof Orders    !== 'undefined' && Orders.load(),
    results:    () => typeof Results   !== 'undefined' && Results.loadEntry(),
    validation: () => typeof Results   !== 'undefined' && Results.loadValidation(),
    catalog:    () => typeof Catalog   !== 'undefined' && Catalog.load(),
    supplies:   () => typeof Supplies  !== 'undefined' && Supplies.load(),
    users:      () => typeof Users     !== 'undefined' && Users.load(),
    billing:    () => typeof Billing   !== 'undefined' && Billing.load(),
    finance:    () => typeof Finance   !== 'undefined' && Finance.load(),
  };

  // ─── Init ────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const { user } = await API.me();
      loginSuccess(user);
    } catch {
      showLoginPage();
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Clock
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateClock() {
    const el = document.getElementById('current-datetime');
    if (el) el.textContent = new Date().toLocaleString('es-ES', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ─── Auth ────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';

    try {
      const { user } = await API.login(username, password);
      loginSuccess(user);
    } catch (err) {
      errEl.textContent = err.message || 'Error al iniciar sesión';
      errEl.style.display = 'block';
    }
  }

  async function handleLogout() {
    await API.logout().catch(() => {});
    currentUser = null;
    showLoginPage();
  }

  function loginSuccess(user) {
    currentUser = user;
    buildSidebar(user);
    updateUserChip(user);
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    showSection('dashboard');
    if (typeof Notifications !== 'undefined') Notifications.init();
  }

  function showLoginPage() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
  }

  // ─── Sidebar ─────────────────────────────────────────────────────────────
  function buildSidebar(user) {
    const nav = document.getElementById('sidebar-nav');
    const items = NAV_CONFIG[user.role] || [];
    nav.innerHTML = items.map(item => `
      <div class="nav-item" id="nav-${item.id}" onclick="App.showSection('${item.id}')">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </div>
    `).join('');
  }

  function roleLabel(role) {
    const labels = {
      ADMIN:        'Administrador',
      RECEPTIONIST: 'Recepcionista',
      TECHNICIAN:   'Técnico',
      BIOCHEMIST:   'Bioquímico',
    };
    return labels[role] || role;
  }

  function updateUserChip(user) {
    const initials = user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('sidebar-username').textContent = user.full_name;
    document.getElementById('sidebar-role').textContent = roleLabel(user.role);
  }

  // ─── Section Navigation ──────────────────────────────────────────────────
  function showSection(id) {
    // Hide all
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target
    const section = document.getElementById(`section-${id}`);
    const navItem = document.getElementById(`nav-${id}`);
    if (section) section.classList.add('active');
    if (navItem) navItem.classList.add('active');

    // Update breadcrumb
    const labels = {
      dashboard: 'Panel Principal', patients: 'Pacientes', orders: 'Órdenes',
      results: 'Ingreso de Resultados', validation: 'Validación de Resultados',
      catalog: 'Catálogo de Pruebas', supplies: 'Control de Insumos', users: 'Gestión de Usuarios',
      billing: 'Caja / Cobros', finance: 'Finanzas'
    };
    document.getElementById('breadcrumb').textContent = labels[id] || id;

    currentSection = id;

    // Trigger loader
    if (SECTION_LOADERS[id]) {
      SECTION_LOADERS[id]();
    }
  }

  // ─── Modals ──────────────────────────────────────────────────────────────
  function openModal(overlayId) {
    const el = document.getElementById(overlayId);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(overlayId) {
    const el = document.getElementById(overlayId);
    if (el) el.classList.add('hidden');
  }

  function closeModalOverlay(event, overlayId) {
    if (event.target.id === overlayId) closeModal(overlayId);
  }

  // ─── Toast Notifications ─────────────────────────────────────────────────
  function toast(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function getUser() { return currentUser; }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function calcAge(dob) {
    const d = new Date(dob), now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() - d.getMonth() < 0 || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  }

  function statusBadge(status) {
    const labels = {
      PENDING:    'PENDIENTE',
      IN_PROCESS: 'EN PROCESO',
      COMPLETED:  'COMPLETADO',
      DELIVERED:  'ENTREGADO',
    };
    const label = labels[status] || status.replace('_', ' ');
    return `<span class="badge badge-${status}">${label}</span>`;
  }

  function flagBadge(flag, critical, resultType) {
    if (resultType === 'TEXT' || flag === 'INFORMATIVO')
      return `<span class="badge" style="background:#e0e0e0;color:#555;">INFORMATIVO</span>`;
    if (resultType === 'TITER') {
      const sig = flag === 'SIGNIFICANT';
      return `<span class="badge" style="background:${sig?'#ffebee':'#e8f5e9'};color:${sig?'#c62828':'#2e7d32'};">${sig?'SIGNIFICATIVO':'NO SIGNIFICATIVO'}</span>`;
    }
    if (flag === 'ABNORMAL' || (resultType && resultType !== 'NUMERIC' && flag === 'HIGH'))
      return `<span class="badge badge-HIGH">ANORMAL</span>`;
    if (flag === 'NOT_SIGNIFICANT')
      return `<span class="badge" style="background:#e8f5e9;color:#2e7d32;">NO SIGNIFICATIVO</span>`;
    if (critical) {
      const critLabel = flag === 'HIGH' ? '¡¡¡CRÍTICO ALTO!!!' : '¡¡¡CRÍTICO BAJO!!!';
      return `<span class="badge badge-CRITICAL">${critLabel}</span>`;
    }
    const labels = { NORMAL: 'NORMAL', HIGH: 'ALTO', LOW: 'BAJO' };
    const label = labels[flag] || flag;
    return `<span class="badge badge-${flag}">${label}</span>`;
  }

  // ─── Expose ──────────────────────────────────────────────────────────────
  return {
    init, showSection, openModal, closeModal, closeModalOverlay,
    toast, getUser, formatDate, formatDateTime, calcAge, statusBadge, flagBadge
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

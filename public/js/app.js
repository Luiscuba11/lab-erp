/* ── App Core ────────────────────────────────────────────────────────────── */
'use strict';

const App = (() => {
  let currentUser = null;
  let currentSection = 'dashboard';

  // ─── Iconos SVG de línea (trazo = currentColor) por módulo ─────────────
  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    patients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6.4 7-6.4s7 2.8 7 6.4"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h6"/></svg>',
    results: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v8.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 10.5V2"/><path d="M9 2h6M7.5 14h9"/></svg>',
    validation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5.5"/></svg>',
    catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6L4.3 18.5A1.6 1.6 0 0 0 5.8 21h12.4a1.6 1.6 0 0 0 1.5-2.5L15 8V2"/><path d="M9 2h6M5.5 16h13"/></svg>',
    supplies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5-9 5-9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 13.2c2.6.4 4.5 2.6 4.5 5.3"/></svg>',
    billing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M2.5 9.5h4M17.5 9.5h4M2.5 15.5h4M17.5 15.5h4"/></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M11 19V4M18 19v-6"/><path d="M2.5 19h19"/></svg>',
    'pap-generator': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21h6M11 17h2"/><path d="M9.5 17c-1.2-1-2-2.7-2-4.6C7.5 8.6 9.6 5 12 5s4.5 3.6 4.5 7.4c0 1.9-.8 3.6-2 4.6"/><path d="M9.5 9.5h5"/><circle cx="18.5" cy="5.5" r="2"/></svg>',
    'pap-paquetes': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg>',
    'pap-resultados': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
  };

  // ─── Navigation config per role ────────────────────────────────────────
  const NAV_CONFIG = {
    RECEPTIONIST: [
      { id: 'dashboard', label: 'Panel Principal' },
      { id: 'patients',  label: 'Pacientes' },
      { id: 'orders',    label: 'Órdenes' },
      { id: 'billing',   label: 'Caja / Cobros' },
    ],
    TECHNICIAN: [
      { id: 'dashboard',        label: 'Panel Principal' },
      { id: 'results',          label: 'Ingreso de Resultados' },
      { id: 'supplies',         label: 'Control de Insumos' },
      { url: '/pap-generator', id: 'pap-generator', label: 'Generador PAP' },
      { id: 'pap-paquetes',     label: 'Paquetes PAP' },
      { id: 'pap-resultados',   label: 'Banco de Resultados PAP' },
    ],
    BIOCHEMIST: [
      { id: 'dashboard',        label: 'Panel Principal' },
      { id: 'validation',       label: 'Validación' },
      { url: '/pap-generator', id: 'pap-generator', label: 'Generador PAP' },
      { id: 'pap-paquetes',     label: 'Paquetes PAP' },
      { id: 'pap-resultados',   label: 'Banco de Resultados PAP' },
    ],
    ADMIN: [
      { id: 'dashboard',        label: 'Panel Principal' },
      { id: 'patients',         label: 'Pacientes' },
      { id: 'orders',           label: 'Órdenes' },
      { id: 'results',          label: 'Ingreso de Resultados' },
      { id: 'validation',       label: 'Validación' },
      { id: 'catalog',          label: 'Catálogo de Pruebas' },
      { id: 'supplies',         label: 'Control de Insumos' },
      { id: 'users',            label: 'Usuarios' },
      { id: 'billing',          label: 'Caja / Cobros' },
      { id: 'finance',          label: 'Finanzas' },
      { url: '/pap-generator', id: 'pap-generator', label: 'Generador PAP' },
      { id: 'pap-paquetes',     label: 'Paquetes PAP' },
      { id: 'pap-resultados',   label: 'Banco de Resultados PAP' },
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
    billing:         () => typeof Billing       !== 'undefined' && Billing.load(),
    finance:         () => typeof Finance       !== 'undefined' && Finance.load(),
    'pap-paquetes':  () => typeof PapPaquetes   !== 'undefined' && PapPaquetes.load(),
    'pap-resultados':() => typeof PapResultados !== 'undefined' && PapResultados.load(),
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
    buildAppsGrid(user);
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
    nav.innerHTML = items.map(item => item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer"
            id="nav-${item.url.replace(/\//g,'-').replace(/^-/,'')}"
            style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin:0 2px;border-radius:8px;text-decoration:none;color:#4ade80;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);font-size:13px;font-weight:600;transition:all 0.2s ease;flex-shrink:0;white-space:nowrap;"
            onmouseenter="this.style.background='rgba(74,222,128,0.25)';this.style.borderColor='rgba(74,222,128,0.7)';this.style.color='#86efac'"
            onmouseleave="this.style.background='rgba(74,222,128,0.1)';this.style.borderColor='rgba(74,222,128,0.3)';this.style.color='#4ade80'"
         ><span class="nav-icon" style="width:16px;height:16px;display:inline-flex">${ICONS[item.id]||''}</span> <span>${item.label}</span></a>`
      : `<div class="nav-item" id="nav-${item.id}" data-section="${item.id}" tabindex="0" role="button">
           <span class="nav-icon">${ICONS[item.id]||''}</span>
           <span class="nav-label">${item.label}</span>
         </div>`
    ).join('');
    nav.querySelectorAll('.nav-item[data-section]').forEach(function(el) {
      el.addEventListener('click', function() { App.showSection(el.getAttribute('data-section')); });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.showSection(el.getAttribute('data-section')); }
      });
    });
    updateNavScrollHint(nav);
  }

  // ─── Indicador de overflow (hay más opciones fuera de vista) ──────────
  function updateNavScrollHint(nav) {
    function refresh() {
      const hasOverflow = nav.scrollWidth > nav.clientWidth + 2;
      nav.classList.toggle('has-overflow-right', hasOverflow && nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 2);
      nav.classList.toggle('has-overflow-left', nav.scrollLeft > 2);
    }
    nav.addEventListener('scroll', refresh);
    window.addEventListener('resize', refresh);
    setTimeout(refresh, 50);
  }

  // ─── Apps grid (Panel Principal estilo Odoo) ───────────────────────────
  function buildAppsGrid(user) {
    const grid = document.getElementById('apps-grid');
    if (!grid) return;
    const items = (NAV_CONFIG[user.role] || []).filter(item => item.id !== 'dashboard');
    grid.innerHTML = items.map(item => item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="app-tile">
           <span class="app-tile-icon">${ICONS[item.id]||''}</span>
           <span class="app-tile-label">${item.label}</span>
         </a>`
      : `<div class="app-tile" data-section="${item.id}" tabindex="0" role="button">
           <span class="app-tile-icon">${ICONS[item.id]||''}</span>
           <span class="app-tile-label">${item.label}</span>
         </div>`
    ).join('');
    grid.querySelectorAll('.app-tile[data-section]').forEach(function(el) {
      el.addEventListener('click', function() { App.showSection(el.getAttribute('data-section')); });
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.showSection(el.getAttribute('data-section')); }
      });
    });
  }

  // ─── Flujo automático: al terminar un paso, avanzar al siguiente según rol ─
  const WORKFLOW_NEXT = {
    RECEPTIONIST: { patients: 'orders', orders: 'billing' },
    TECHNICIAN:   { results: 'dashboard' },
    ADMIN:        { patients: 'orders', orders: 'billing' },
  };

  function workflowAdvance(fromSection) {
    if (!currentUser) return;
    const next = (WORKFLOW_NEXT[currentUser.role] || {})[fromSection];
    if (!next) return;
    const allowed = (NAV_CONFIG[currentUser.role] || []).some(i => i.id === next);
    if (!allowed) return;
    toast(`Avanzando automáticamente a "${next === 'billing' ? 'Caja / Cobros' : next === 'orders' ? 'Órdenes' : next === 'dashboard' ? 'Panel Principal' : next}"…`, 'success');
    setTimeout(() => showSection(next), 900);
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

    // Update breadcrumb (clickeable al Panel Principal salvo que ya estemos ahí)
    const labels = {
      dashboard: 'Panel Principal', patients: 'Pacientes', orders: 'Órdenes',
      results: 'Ingreso de Resultados', validation: 'Validación de Resultados',
      catalog: 'Catálogo de Pruebas', supplies: 'Control de Insumos', users: 'Gestión de Usuarios',
      billing: 'Caja / Cobros', finance: 'Finanzas',
      'pap-paquetes': 'Paquetes PAP', 'pap-resultados': 'Banco de Resultados PAP'
    };
    const label = labels[id] || id;
    const crumb = document.getElementById('breadcrumb');
    crumb.innerHTML = id === 'dashboard'
      ? label
      : `<a href="#" onclick="App.showSection('dashboard');return false;" style="color:inherit;text-decoration:none;opacity:.55">Panel Principal</a>
         <span style="opacity:.35;margin:0 6px">/</span>${label}`;

    // Título de pestaña por sección
    document.title = id === 'dashboard' ? 'BIO PAP — Sistema de Laboratorio' : `${label} · BIO PAP`;

    // Volver al inicio del contenido al cambiar de sección
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;

    currentSection = id;

    // Trigger loader
    if (SECTION_LOADERS[id]) {
      SECTION_LOADERS[id]();
    }
    document.dispatchEvent(new CustomEvent('sectionChange', { detail: id }));
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
    toast, getUser, formatDate, formatDateTime, calcAge, statusBadge, flagBadge,
    workflowAdvance
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());


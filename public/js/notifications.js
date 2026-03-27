/* ── Notifications Bell ─────────────────────────────────────────────────── */
'use strict';

const Notifications = (() => {
  let _open = false;
  let _data = [];
  let _timer = null;

  function init() {
    poll();
    _timer = setInterval(poll, 60000); // refresh every 60s
    document.addEventListener('click', e => {
      const panel = document.getElementById('notif-panel');
      const bell  = document.getElementById('notif-bell');
      if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
        closePanel();
      }
    });
  }

  async function poll() {
    try {
      const { unread, notifications } = await API.getNotifications();
      _data = notifications || [];
      updateBadge(unread);
      if (_open) renderPanel();
    } catch (_) {}
  }

  function updateBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  function togglePanel() {
    _open = !_open;
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (_open) {
      renderPanel();
      panel.classList.remove('hidden');
    } else {
      closePanel();
    }
  }

  function closePanel() {
    _open = false;
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.add('hidden');
  }

  function renderPanel() {
    const container = document.getElementById('notif-list');
    if (!container) return;
    if (!_data.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:#90a4ae;font-size:13px;">Sin notificaciones</div>';
      return;
    }
    container.innerHTML = _data.map(n => {
      const icon = n.type === 'CRITICAL_STOCK' ? '⛔' : n.type === 'LOW_STOCK' ? '⚠️' : '🔔';
      const bg   = n.is_read ? '#fff' : '#f0f7ff';
      const time = new Date(n.created_at).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="notif-item${n.is_read ? '' : ' notif-unread'}" style="background:${bg};" onclick="Notifications.readItem(${n.id}, this)">
          <div class="notif-icon">${icon}</div>
          <div class="notif-content">
            <div class="notif-title">${esc(n.title)}</div>
            <div class="notif-msg">${esc(n.message)}</div>
            <div class="notif-time">${time}</div>
          </div>
        </div>`;
    }).join('');
  }

  async function readItem(id, el) {
    try {
      await API.markNotificationRead(id);
      el.classList.remove('notif-unread');
      el.style.background = '#fff';
      const n = _data.find(x => x.id === id);
      if (n) n.is_read = 1;
      const unread = _data.filter(x => !x.is_read).length;
      updateBadge(unread);
    } catch (_) {}
  }

  async function markAllRead() {
    try {
      await API.markAllRead();
      _data.forEach(n => n.is_read = 1);
      updateBadge(0);
      renderPanel();
    } catch (_) {}
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, togglePanel, readItem, markAllRead, poll };
})();

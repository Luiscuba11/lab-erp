/* ── API Client ──────────────────────────────────────────────────────────── */
'use strict';

async function apiRequest(method, url, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const API = {
  // Auth
  login:   (u, p) => apiRequest('POST', '/api/auth/login',  { username: u, password: p }),
  logout:  ()     => apiRequest('POST', '/api/auth/logout'),
  me:      ()     => apiRequest('GET',  '/api/auth/me'),

  // Patients
  getPatients:      (q = '')  => apiRequest('GET',  `/api/patients?search=${encodeURIComponent(q)}`),
  createPatient:    (d)       => apiRequest('POST', '/api/patients', d),
  getPatient:       (id)      => apiRequest('GET',  `/api/patients/${id}`),
  updatePatient:    (id, d)   => apiRequest('PUT',  `/api/patients/${id}`, d),
  getPatientOrders: (id)      => apiRequest('GET',  `/api/patients/${id}/orders`),

  // Orders
  getOrders:   (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))).toString();
    return apiRequest('GET', `/api/orders${qs ? '?' + qs : ''}`);
  },
  createOrder:      (d)       => apiRequest('POST', '/api/orders', d),
  getOrder:         (id)      => apiRequest('GET',  `/api/orders/${id}`),
  updateOrderStatus:(id, st)  => apiRequest('PUT',  `/api/orders/${id}/status`, { status: st }),

  // Catalog
  getCatalog:        ()       => apiRequest('GET',    '/api/catalog'),
  getCatalogItem:    (id)     => apiRequest('GET',    `/api/catalog/${id}`),
  createCatalogItem: (d)      => apiRequest('POST',   '/api/catalog', d),
  updateCatalogItem: (id, d)  => apiRequest('PUT',    `/api/catalog/${id}`, d),
  deleteCatalogItem: (id)     => apiRequest('DELETE', `/api/catalog/${id}`),

  // Supplies
  getSupplies:        ()       => apiRequest('GET',    '/api/supplies'),
  createSupply:       (d)      => apiRequest('POST',   '/api/supplies', d),
  updateSupply:       (id, d)  => apiRequest('PUT',    `/api/supplies/${id}`, d),
  deleteSupply:       (id)     => apiRequest('DELETE', `/api/supplies/${id}`),
  getSupplyMovements: (id)     => apiRequest('GET',    `/api/supplies/${id}/movements`),
  addSupplyMovement:  (id, d)  => apiRequest('POST',   `/api/supplies/${id}/movements`, d),
  getSupplyAlerts:    ()       => apiRequest('GET',    '/api/supplies/alerts'),

  // Results
  enterResult:    (itemId, d)  => apiRequest('POST', `/api/results/${itemId}`, d),
  validateResult: (id, d = {}) => apiRequest('PUT',  `/api/results/${id}/validate`, d),
  validateAllOrder:(orderId)   => apiRequest('PUT',  `/api/results/order/${orderId}/validate-all`),

  // Dashboard
  getDashboardStats: () => apiRequest('GET', '/api/dashboard/stats'),

  // Users
  getUsers:    ()        => apiRequest('GET',    '/api/users'),
  createUser:  (d)       => apiRequest('POST',   '/api/users', d),
  updateUser:  (id, d)   => apiRequest('PUT',    `/api/users/${id}`, d),
  deleteUser:  (id)      => apiRequest('DELETE', `/api/users/${id}`),

  // Billing
  getBillingPending: () => apiRequest('GET', '/api/billing/pending'),
  getBillingHistory: (from, to) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return apiRequest('GET', '/api/billing/history?' + p);
  },
  payOrder: (orderId, data) => apiRequest('POST', `/api/billing/${orderId}/pay`, data),
  updatePaymentStatus: (orderId, payment_status) => apiRequest('PUT', `/api/billing/${orderId}/status`, {payment_status}),

  // Finance
  getFinanceStats: () => apiRequest('GET', '/api/finance/stats'),
  getFixedCosts:   () => apiRequest('GET', '/api/finance/fixed-costs'),
  createFixedCost: (d) => apiRequest('POST', '/api/finance/fixed-costs', d),
  updateFixedCost: (id, d) => apiRequest('PUT', `/api/finance/fixed-costs/${id}`, d),
  deleteFixedCost: (id) => apiRequest('DELETE', `/api/finance/fixed-costs/${id}`),
  exportFinance: (from, to) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    window.open('/api/finance/export?' + p, '_blank');
  },

  // Supplies extended
  getSupplyABC:       () => apiRequest('GET', '/api/supplies/abc'),
  getSupplyCoverage:  () => apiRequest('GET', '/api/supplies/coverage'),
  getTestLinks:       () => apiRequest('GET', '/api/supplies/test-links'),
  getTestLinksByTest: (testId) => apiRequest('GET', `/api/supplies/test-links/${testId}`),
  createTestLink:     (d)  => apiRequest('POST',   '/api/supplies/test-links', d),
  updateTestLink:     (id, d) => apiRequest('PUT', `/api/supplies/test-links/${id}`, d),
  deleteTestLink:     (id) => apiRequest('DELETE', `/api/supplies/test-links/${id}`),

  // Purchase Orders
  getPurchaseOrders:     () => apiRequest('GET', '/api/supplies/purchase-orders'),
  getPurchaseOrder:      (id) => apiRequest('GET', `/api/supplies/purchase-orders/${id}`),
  createPurchaseOrder:   (d)  => apiRequest('POST', '/api/supplies/purchase-orders', d),
  updatePOStatus:        (id, status) => apiRequest('PUT', `/api/supplies/purchase-orders/${id}/status`, { status }),
  cancelPurchaseOrder:   (id) => apiRequest('DELETE', `/api/supplies/purchase-orders/${id}`),

  // Notifications
  getNotifications: () => apiRequest('GET', '/api/notifications'),
  markNotificationRead: (id) => apiRequest('PUT', `/api/notifications/${id}/read`),
  markAllRead: () => apiRequest('PUT', '/api/notifications/read-all'),
};

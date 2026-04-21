import axios from 'axios';

// Use same-origin requests in dev so Vite proxy handles ERPNext
// and browser session cookies are set/read reliably.
const BASE_URL = '';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
});

/* ── Intercept responses for Frappe-style errors ── */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data || {};
    let msg =
      extractFrappeServerMessage(data) ||
      data.exception ||
      data.message ||
      err.message ||
      'Request failed';
    if (typeof msg !== 'string') msg = String(msg);
    return Promise.reject(new Error(msg));
  }
);

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
export const login = (usr, pwd) =>
  api.post('/api/method/login', { usr, pwd });

export const logout = () =>
  api.get('/api/method/logout');

export const getCurrentUser = () =>
  api.get('/api/method/frappe.auth.get_logged_user');

export const getUserRoles = (user) =>
  api.get('/api/resource/User/' + encodeURIComponent(user), {
    params: { fields: JSON.stringify(['name', 'full_name', 'email', 'user_image', 'roles']) },
  });

/* ══════════════════════════════════════
   ITEMS / PRODUCTS
══════════════════════════════════════ */
export const getItems = async (params = {}) => {
  const res = await api.get('/api/resource/Item', {
    params: {
      fields: JSON.stringify(['name', 'item_name', 'item_code', 'item_group',
        'standard_rate', 'stock_uom', 'image', 'description']),
      filters: JSON.stringify([['disabled', '=', 0]]),
      limit_page_length: params.limit || 50,
      limit_start: params.start || 0,
      ...params,
    },
  });
  return withResolvedItemPrices(res);
};

export const searchItems = async (query) => {
  const res = await api.get('/api/resource/Item', {
    params: {
      fields: JSON.stringify(['name', 'item_name', 'item_code', 'item_group', 'standard_rate', 'stock_uom', 'image']),
      filters: JSON.stringify([['disabled', '=', 0], ['item_name', 'like', `%${query}%`]]),
      limit_page_length: 20,
    },
  });
  return withResolvedItemPrices(res);
};

/* ══════════════════════════════════════
   INVENTORY / STOCK
══════════════════════════════════════ */
export const getStockLedger = (params = {}) =>
  api.get('/api/resource/Bin', {
    params: {
      fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty',
        'reserved_qty', 'ordered_qty', 'valuation_rate']),
      limit_page_length: params.limit || 100,
      limit_start: params.start || 0,
    },
  });

export const getWarehouses = () =>
  api.get('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(['name', 'warehouse_name', 'warehouse_type']),
      limit_page_length: 50,
    },
  });

/* ══════════════════════════════════════
   SALES / POS INVOICES
══════════════════════════════════════ */
export const getSalesInvoices = (params = {}) =>
  api.get('/api/resource/Sales Invoice', {
    params: {
      fields: JSON.stringify(['name', 'customer', 'posting_date', 'grand_total',
        'outstanding_amount', 'status', 'items']),
      filters: JSON.stringify([['docstatus', '!=', 2]]),
      order_by: 'posting_date desc',
      limit_page_length: params.limit || 50,
      limit_start: params.start || 0,
    },
  });

export const createSalesInvoice = (payload) =>
  api.post('/api/resource/Sales Invoice', payload);

export const submitSalesInvoice = (name) =>
  api.put(`/api/resource/Sales Invoice/${encodeURIComponent(name)}`, { docstatus: 1 });

export const getSalesInvoice = (name) =>
  api.get(`/api/resource/Sales Invoice/${encodeURIComponent(name)}`);

export const createPOSInvoice = (payload) =>
  api.post('/api/resource/POS Invoice', payload);

export const submitPOSInvoice = (name) =>
  api.put(`/api/resource/POS Invoice/${encodeURIComponent(name)}`, { docstatus: 1 });

export const getPOSInvoice = (name) =>
  api.get(`/api/resource/POS Invoice/${encodeURIComponent(name)}`);

export const getMyPOSInvoices = (owner, params = {}) =>
  api.get('/api/resource/POS Invoice', {
    params: {
      fields: JSON.stringify(['name', 'customer', 'posting_date', 'grand_total', 'status', 'owner']),
      filters: JSON.stringify([
        ['owner', '=', owner],
        ['docstatus', '!=', 2],
      ]),
      order_by: 'creation desc',
      limit_page_length: params.limit || 20,
      limit_start: params.start || 0,
    },
  });

/* ══════════════════════════════════════
   CUSTOMERS
══════════════════════════════════════ */
export const getCustomers = (params = {}) =>
  api.get('/api/resource/Customer', {
    params: {
      fields: JSON.stringify([
        'name',
        'customer_name',
        'customer_group',
        'territory',
        'mobile_no',
        'tax_id',
        'national_id',
        'custom_national_id',
      ]),
      limit_page_length: params.limit || 50,
      limit_start: params.start || 0,
    },
  });

/* ══════════════════════════════════════
   USERS / ACCESS CONTROL
══════════════════════════════════════ */
export const getUsers = (params = {}) =>
  api.get('/api/resource/User', {
    params: {
      fields: JSON.stringify(['name', 'full_name', 'email', 'enabled', 'user_type', 'last_login']),
      filters: JSON.stringify([['name', '!=', 'Guest']]),
      order_by: 'modified desc',
      limit_page_length: params.limit || 100,
      limit_start: params.start || 0,
    },
  });

export const createUser = ({ email, first_name, enabled = 1, send_welcome_email = 0, role_profile_name }) =>
  api.post('/api/resource/User', {
    email,
    first_name,
    enabled,
    send_welcome_email,
    ...(role_profile_name ? { role_profile_name } : {}),
  });

export const setUserEnabled = (name, enabled) =>
  api.put(`/api/resource/User/${encodeURIComponent(name)}`, { enabled: enabled ? 1 : 0 });

export const deleteUser = (name) =>
  api.delete(`/api/resource/User/${encodeURIComponent(name)}`);

/* ══════════════════════════════════════
   DASHBOARD / REPORTS
══════════════════════════════════════ */
export const getDashboardStats = async () => {
  const [invoices, items, customers] = await Promise.allSettled([
    api.get('/api/resource/Sales Invoice', {
      params: {
        fields: JSON.stringify(['name', 'grand_total', 'status', 'posting_date']),
        filters: JSON.stringify([['docstatus', '!=', 2], ['posting_date', '>=', getMonthStart()]]),
        limit_page_length: 500,
      },
    }),
    api.get('/api/resource/Item', {
      params: { fields: JSON.stringify(['name']), filters: JSON.stringify([['disabled', '=', 0]]), limit_page_length: 1 },
    }),
    api.get('/api/resource/Customer', {
      params: { fields: JSON.stringify(['name']), limit_page_length: 1 },
    }),
  ]);

  const invoiceData = invoices.status === 'fulfilled' ? invoices.value.data.data : [];
  const itemCount = items.status === 'fulfilled' ? items.value.data.data.length : 0;
  const customerCount = customers.status === 'fulfilled' ? customers.value.data.data.length : 0;

  const revenue = invoiceData.reduce((s, i) => s + (i.grand_total || 0), 0);
  const paid = invoiceData.filter(i => i.status === 'Paid').length;

  return { revenue, invoiceCount: invoiceData.length, paidCount: paid, itemCount, customerCount, invoiceData };
};

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function withResolvedItemPrices(itemsResponse) {
  const items = itemsResponse?.data?.data || [];
  if (!items.length) return itemsResponse;

  try {
    const itemCodes = [...new Set(items.map(i => i.item_code).filter(Boolean))];
    if (!itemCodes.length) return itemsResponse;

    const priceRes = await api.get('/api/resource/Item Price', {
      params: {
        fields: JSON.stringify(['item_code', 'price_list_rate', 'selling', 'price_list']),
        filters: JSON.stringify([
          ['item_code', 'in', itemCodes],
          ['selling', '=', 1],
          ['price_list_rate', '>', 0],
        ]),
        order_by: 'price_list_rate desc',
        limit_page_length: Math.max(200, itemCodes.length * 3),
      },
    });

    const prices = priceRes?.data?.data || [];
    const bestPriceByItem = new Map();
    for (const row of prices) {
      if (!bestPriceByItem.has(row.item_code)) {
        bestPriceByItem.set(row.item_code, Number(row.price_list_rate) || 0);
      }
    }

    const merged = items.map((item) => {
      const fallback = Number(item.standard_rate) || 0;
      const resolved = bestPriceByItem.get(item.item_code);
      return { ...item, standard_rate: resolved ?? fallback };
    });

    return { ...itemsResponse, data: { ...itemsResponse.data, data: merged } };
  } catch {
    // If Item Price query is not permitted, keep original Item data.
    return itemsResponse;
  }
}

export default api;

function extractFrappeServerMessage(data) {
  try {
    const raw = data?._server_messages;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const first = JSON.parse(parsed[0]);
    return first?.message || null;
  } catch {
    return null;
  }
}

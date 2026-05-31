import axios from 'axios';
import { ERP_API_BASE } from '../config/erp';
import { normalizeERPError, logApiError } from '../utils/errorHandling';
import { captureException } from './observability';

export { extractERPError } from '../utils/errorHandling';

const API_TIMEOUT_MS = 30_000;

const api = axios.create({
  baseURL: ERP_API_BASE,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Exported so the reports layer (src/services/reports/reportApi.js) can
// reuse the same instance, inheriting CSRF + auth + error interceptors.
// Internal callers in this file still use the local `api` reference.
export { api };

/* ══════════════════════════════════════
   CSRF protection (Frappe v15)
   ──────────────────────────────────────
   Frappe validates `X-Frappe-CSRF-Token` on UNSAFE_HTTP_METHODS
   (POST/PUT/PATCH/DELETE) whenever the session has a token stored
   (frappe.auth.validate_csrf_token in apps/frappe/frappe/auth.py).
   The token is materialized server-side by frappe.sessions.get_csrf_token
   and persisted to session.data.csrf_token.

   We bind the token via `elmahdi.api.auth.get_session_identity` (the SPA
   bootstrap endpoint), which already runs on every app load and now also
   returns the per-session token. The cache is in-memory only — never
   localStorage, which would let an XSS exfiltrate it. On a CSRFTokenError
   the cache is dropped and the request retried once after re-priming.
   ══════════════════════════════════════ */
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let csrfToken = null;
let csrfFetchInflight = null;

/**
 * Allow the auth bootstrap path to seed the cache without an extra HTTP call.
 * `probeLoggedInUser` already calls `get_session_identity`; the value comes
 * back on that response, so we just hand it in here.
 */
export function primeCsrfToken(token) {
  if (typeof token === 'string' && token) csrfToken = token;
}

async function fetchCsrfToken() {
  // Dedupe concurrent fetches: any number of parallel mutations that hit a
  // missing-token state share the same in-flight promise.
  if (csrfFetchInflight) return csrfFetchInflight;
  csrfFetchInflight = (async () => {
    try {
      // Re-use the SPA bootstrap endpoint — guaranteed whitelisted and
      // capability-aware. Returns { message: { csrf_token, ... } }.
      const res = await api.get(
        '/api/method/elmahdi.api.auth.get_session_identity',
        { skipCsrfInject: true, silentApi: true },
      );
      csrfToken = res?.data?.message?.csrf_token || null;
      return csrfToken;
    } catch {
      // Likely 403 (no session yet) or network; leave token null so the
      // next attempt re-fetches.
      csrfToken = null;
      return null;
    } finally {
      csrfFetchInflight = null;
    }
  })();
  return csrfFetchInflight;
}

/**
 * Drop the cached CSRF token. Call on logout so a re-login under a different
 * user starts from a clean session-bound token.
 */
export function clearCsrfToken() {
  csrfToken = null;
  csrfFetchInflight = null;
}

api.interceptors.request.use(async (config) => {
  const method = String(config.method || 'get').toLowerCase();
  if (!UNSAFE_METHODS.has(method)) return config;
  // Skip injection where it would either be impossible (no session yet) or
  // would create an infinite loop (the token-fetch call itself).
  if (config.skipCsrfInject) return config;
  if (config.loginAttempt) return config;
  if (!csrfToken) await fetchCsrfToken();
  if (csrfToken) {
    config.headers = config.headers || {};
    config.headers['X-Frappe-CSRF-Token'] = csrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err?.config || {};
    // Retry once on Frappe CSRFTokenError. The 403 + exc_type pattern is the
    // canonical signal; we also accept the exception name in `exception` for
    // older Frappe builds.
    const status = err?.response?.status;
    const excType = String(err?.response?.data?.exc_type || '');
    const excField = String(err?.response?.data?.exception || '');
    const isCsrfError =
      status === 403 &&
      (excType.includes('CSRFTokenError') || excField.includes('CSRFTokenError'));
    if (isCsrfError && !cfg._csrfRetried && !cfg.skipCsrfInject) {
      cfg._csrfRetried = true;
      csrfToken = null;
      const fresh = await fetchCsrfToken();
      if (fresh) {
        cfg.headers = cfg.headers || {};
        cfg.headers['X-Frappe-CSRF-Token'] = fresh;
        return api.request(cfg);
      }
    }

    if (!cfg.silentAuthProbe && !cfg.silentApi) {
      logApiError(cfg.url || 'request', err);
    }

    // Forward to observability only for things the user can do nothing about:
    //  - 5xx server errors
    //  - network failures (no status)
    // 4xx (incl. CSRF, perm, validation) is expected business-logic flow.
    if (!cfg.silentAuthProbe && !cfg.silentApi && !cfg.loginAttempt) {
      const reportable = !status || status >= 500;
      if (reportable) {
        captureException(err, {
          layer: 'api',
          tags: { method: String(cfg.method || 'get').toUpperCase(), status: String(status || 'network') },
          extra: { url: cfg.url, baseURL: cfg.baseURL },
        });
      }
    }

    return Promise.reject(normalizeERPError(err));
  }
);

function authProbeConfig() {
  return { silentAuthProbe: true, silentApi: true };
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
export const login = (usr, pwd) =>
  api.post('/api/method/login', { usr, pwd }, { loginAttempt: true });

export const logout = () =>
  api.get('/api/method/logout');

/** Legacy probe — often 403 for operational users (Purchase User, Accountant, etc.). */
export const getCurrentUser = () =>
  api.get('/api/method/frappe.auth.get_logged_user', authProbeConfig());

/**
 * Resolve logged-in username for SPA bootstrap.
 * Prefers elmahdi.api.auth.get_session_identity (no frappe.auth permission needed).
 * Also primes the CSRF token cache from the same response — no extra round-trip.
 */
export async function probeLoggedInUser() {
  try {
    const res = await getSessionIdentity();
    const msg = res.data?.message || {};
    const name = msg.name;
    primeCsrfToken(msg.csrf_token);
    if (name && name !== 'Guest') return name;
    return null;
  } catch (e) {
    const status = e?.status;
    const code = e?.code;
    // No session, guest blocked, or network — treat as logged out (no second probe spam).
    if (status === 401 || status === 403) return null;
    if (code === 'AuthenticationError') return null;
  }

  try {
    const res = await getCurrentUser();
    const name = res.data?.message;
    if (name && name !== 'Guest') return name;
  } catch {
    /* legacy probe denied */
  }
  return null;
}

export const getUserRoles = (user) =>
  api.get('/api/resource/User/' + encodeURIComponent(user), {
    ...authProbeConfig(),
    params: {
      fields: JSON.stringify([
        'name',
        'full_name',
        'email',
        'user_image',
        'role_profile_name',
        'roles',
      ]),
    },
  });

/**
 * Server-side session identity (requires elmahdi app on ERPNext).
 * Uses frappe.get_roles() — works when User/Has Role REST is forbidden.
 */
export const getSessionIdentity = () =>
  api.get('/api/method/elmahdi.api.auth.get_session_identity', authProbeConfig());

/** Field-level User read (may work when full User doc read is denied). */
export const getUserFieldValues = (username, fieldnames) =>
  api.get('/api/method/frappe.client.get_value', {
    ...authProbeConfig(),
    params: {
      doctype: 'User',
      fieldname: JSON.stringify(fieldnames),
      filters: JSON.stringify(username),
    },
  });

/**
 * Has Role rows — usually forbidden for operational users; kept as optional fallback.
 */
export const getHasRolesForUser = async (username) => {
  const filters = [
    ['parent', '=', username],
    ['parenttype', '=', 'User'],
  ];
  const cfg = authProbeConfig();
  try {
    const res = await api.get('/api/method/frappe.client.get_list', {
      ...cfg,
      params: {
        doctype: 'Has Role',
        fields: JSON.stringify(['role']),
        filters: JSON.stringify(filters),
        limit_page_length: 50,
      },
    });
    return res.data?.message || [];
  } catch {
    const res = await api.get('/api/resource/Has Role', {
      ...cfg,
      params: {
        fields: JSON.stringify(['role']),
        filters: JSON.stringify(filters),
        limit_page_length: 50,
      },
    });
    return res.data?.data || [];
  }
};

export const getRoleProfile = (profileName) =>
  api.get(`/api/resource/Role Profile/${encodeURIComponent(profileName)}`, {
    ...authProbeConfig(),
    params: { fields: JSON.stringify(['name', 'roles']) },
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

export const getSalesInvoice = (name) =>
  api.get(`/api/resource/Sales Invoice/${encodeURIComponent(name)}`);

export const getPOSInvoice = (name) =>
  api.get(`/api/resource/POS Invoice/${encodeURIComponent(name)}`);

/** Authoritative checkout: ERPNext insert() + submit() + SLE verification. */
export const createAndSubmitPOSInvoiceOnServer = (payload) =>
  api.post('/api/method/elmahdi.api.pos_checkout.create_and_submit_pos_invoice', {
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

/** @deprecated Use erpSubmitApi.submitPosInvoiceOnServer or pos_checkout.submit_pos_invoice */
export { submitPosInvoiceOnServer as submitPOSInvoiceOnServer } from './erpSubmitApi';

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
        'customer_type',
        'customer_group',
        'territory',
        'mobile_no',
        'tax_id',
      ]),
      limit_page_length: params.limit || 50,
      limit_start: params.start || 0,
    },
  });

/* ══════════════════════════════════════
   COMPANY
══════════════════════════════════════ */
export const getCompanies = (params = {}) =>
  api.get('/api/resource/Company', {
    params: {
      fields: JSON.stringify(['name', 'company_name', 'default_currency', 'country']),
      limit_page_length: params.limit || 20,
      limit_start: params.start || 0,
    },
  });

export const getCompany = (name) =>
  api.get(`/api/resource/Company/${encodeURIComponent(name)}`, {
    params: {
      fields: JSON.stringify([
        'name',
        'company_name',
        'abbr',
        'country',
        'default_currency',
        'default_holiday_list',
        'tax_id',
        'phone_no',
        'email',
        'website',
      ]),
    },
  });

/* ══════════════════════════════════════
   USERS / ACCESS CONTROL
══════════════════════════════════════ */
export const getUsers = (params = {}) =>
  api.get('/api/resource/User', {
    params: {
      fields: JSON.stringify([
        'name',
        'full_name',
        'email',
        'enabled',
        'user_type',
        'last_login',
        'role_profile_name',
      ]),
      filters: JSON.stringify([['name', '!=', 'Guest']]),
      order_by: 'modified desc',
      limit_page_length: params.limit || 100,
      limit_start: params.start || 0,
    },
  });

export const createUser = ({
  email,
  first_name,
  enabled = 1,
  send_welcome_email = 0,
  role_profile_name,
  user_type,
}) =>
  api.post('/api/resource/User', {
    email,
    first_name,
    enabled,
    send_welcome_email,
    ...(user_type ? { user_type } : {}),
    ...(role_profile_name ? { role_profile_name } : {}),
  });

export const updateUser = (name, data) =>
  api.put(`/api/resource/User/${encodeURIComponent(name)}`, data);

export const setUserEnabled = (name, enabled) =>
  api.put(`/api/resource/User/${encodeURIComponent(name)}`, { enabled: enabled ? 1 : 0 });

/** @deprecated Do not use from SPA — disable users instead. */
export const deleteUser = (name) =>
  api.delete(`/api/resource/User/${encodeURIComponent(name)}`);

export const createUserPermission = ({
  user,
  allow,
  for_value,
  apply_to_all_doctypes = 1,
  is_default = 0,
}) =>
  api.post('/api/resource/User Permission', {
    user,
    allow,
    for_value,
    apply_to_all_doctypes,
    is_default,
  });

export const getPriceLists = (params = {}) =>
  api.get('/api/resource/Price List', {
    params: {
      fields: JSON.stringify(['name', 'enabled']),
      filters: JSON.stringify([['enabled', '=', 1]]),
      order_by: 'name asc',
      limit_page_length: params.limit || 100,
    },
  });

/* ══════════════════════════════════════
   DASHBOARD / REPORTS
══════════════════════════════════════ */
export const getDashboardStats = async () => {
  const monthStart = getMonthStart();
  const warnings = [];
  const silent = { silentApi: true };

  let kpi = null;
  try {
    const kpiRes = await api.get('/api/method/elmahdi.api.manager_dashboard.get_manager_kpis', {
      ...silent,
      params: { from_date: monthStart },
    });
    kpi = kpiRes?.data?.message || kpiRes?.data;
  } catch {
    warnings.push('Could not load ERP dashboard KPIs.');
  }

  const [posInvoices, items, customers] = await Promise.allSettled([
    api.get('/api/resource/POS Invoice', {
      ...silent,
      params: {
        fields: JSON.stringify(['name', 'grand_total', 'status', 'posting_date', 'customer']),
        filters: JSON.stringify([
          ['docstatus', '=', 1],
          ['posting_date', '>=', monthStart],
        ]),
        order_by: 'posting_date desc',
        limit_page_length: 500,
      },
    }),
    api.get('/api/resource/Item', {
      params: {
        fields: JSON.stringify(['name']),
        filters: JSON.stringify([['disabled', '=', 0]]),
        limit_page_length: 500,
      },
    }),
    api.get('/api/resource/Customer', {
      params: { fields: JSON.stringify(['name']), limit_page_length: 500 },
    }),
  ]);

  const invoiceData =
    posInvoices.status === 'fulfilled' ? posInvoices.value?.data?.data || [] : [];
  const itemCount = items.status === 'fulfilled' ? (items.value.data.data?.length || 0) : 0;
  const customerCount = customers.status === 'fulfilled' ? (customers.value.data.data?.length || 0) : 0;

  if (!invoiceData.length && posInvoices.status === 'rejected') {
    warnings.push('Could not load POS invoices for dashboard.');
  }

  const revenue = kpi?.revenue ?? invoiceData.reduce((s, i) => s + (Number(i.grand_total) || 0), 0);
  const salesCount = kpi?.sales_count ?? invoiceData.length;
  const salesToday = kpi?.sales_today ?? 0;
  const salesTodayCount = kpi?.sales_today_count ?? 0;
  const hasFinancialKpis = kpi != null && ('net_profit' in kpi || 'cogs' in kpi);
  const cogs = hasFinancialKpis ? (kpi?.cogs ?? 0) : null;
  const netProfit = hasFinancialKpis ? (kpi?.net_profit ?? 0) : null;
  const grossMarginPct = hasFinancialKpis
    ? (kpi?.gross_margin_pct ?? (revenue > 0 ? ((kpi?.net_profit ?? 0) / revenue) * 100 : 0))
    : null;
  const revenueTrend = kpi?.revenue_trend ?? 0;
  const lastMonthRevenue = kpi?.last_month_revenue ?? 0;
  const avgTicket = kpi?.avg_ticket ?? (salesCount ? revenue / salesCount : 0);

  let salesTrend = kpi?.sales_trend || [];
  if (!salesTrend.length) {
    const dailyMap = new Map();
    for (const inv of invoiceData) {
      const day = (inv.posting_date || '').slice(5, 10);
      if (!day) continue;
      dailyMap.set(day, (dailyMap.get(day) || 0) + (Number(inv.grand_total) || 0));
    }
    salesTrend = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([label, value]) => ({ label, value }));
  }

  const paid = invoiceData.filter((i) => i.status === 'Paid').length;
  const unpaid = invoiceData.filter((i) => i.status === 'Unpaid' || i.status === 'Overdue').length;

  return {
    revenue,
    salesCount,
    salesToday,
    salesTodayCount,
    cogs,
    netProfit,
    hasFinancialKpis,
    estimatedProfit: netProfit,
    grossMarginPct,
    lastMonthRevenue,
    revenueTrend,
    invoiceCount: salesCount,
    paidCount: paid,
    unpaidCount: unpaid,
    itemCount,
    customerCount,
    avgTicket,
    invoiceData,
    salesTrend,
    warnings,
    kpiSource: kpi ? 'erp' : 'fallback',
  };
};

function getLastMonthStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function withResolvedItemPrices(itemsResponse) {
  const items = itemsResponse?.data?.data || [];
  if (!items.length) return itemsResponse;

  try {
    const itemCodes = [...new Set(items.map((i) => i.item_code).filter(Boolean))];
    if (!itemCodes.length) return itemsResponse;

    const { fetchSellingItemPrices } = await import('./pricingApi');
    const bestPriceByItem = await fetchSellingItemPrices(itemCodes);

    const merged = items.map((item) => {
      const fallback = Number(item.standard_rate) || 0;
      const resolved = bestPriceByItem[item.item_code];
      return { ...item, standard_rate: resolved ?? fallback };
    });

    return { ...itemsResponse, data: { ...itemsResponse.data, data: merged } };
  } catch {
    return itemsResponse;
  }
}

export default api;

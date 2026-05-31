/**
 * ERPNext POS-specific API (profiles, shifts, payments, catalog).
 */
import api from './api';
import { getPOSProfileWarehouse, getSellableStockBulk } from './stockService';

const STORAGE_PROFILE_KEY = 'elmahdi_active_pos_profile';

/**
 * Cached POS profile name — sessionStorage rather than localStorage so an
 * XSS payload can't exfiltrate it across browser sessions, and so closing
 * the browser forces a fresh profile selection (a useful invariant: the
 * cashier reconfirms which register they're operating). UX cost: cashiers
 * who close + reopen mid-shift re-select once. The audit flagged this as
 * blocker #14.
 */
export function getStoredPOSProfile() {
  try {
    return sessionStorage.getItem(STORAGE_PROFILE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPOSProfile(name) {
  try {
    if (name) sessionStorage.setItem(STORAGE_PROFILE_KEY, name);
    else sessionStorage.removeItem(STORAGE_PROFILE_KEY);
    // Eagerly clear any value that previous builds may have left in
    // localStorage so the new policy actually takes effect on upgrade.
    try { localStorage.removeItem(STORAGE_PROFILE_KEY); } catch { /* ignore */ }
  } catch {
    /* ignore */
  }
}

export const listPOSProfiles = (params = {}) =>
  api.get('/api/resource/POS Profile', {
    params: {
      fields: JSON.stringify([
        'name',
        'company',
        'warehouse',
        'selling_price_list',
        'currency',
        'disabled',
      ]),
      filters: JSON.stringify([['disabled', '=', 0]]),
      limit_page_length: params.limit || 50,
    },
  });

export const getPOSProfile = (name) =>
  api.get(`/api/resource/POS Profile/${encodeURIComponent(name)}`, {
    params: {
      fields: JSON.stringify([
        'name',
        'company',
        'warehouse',
        'selling_price_list',
        'currency',
        'write_off_account',
        'write_off_cost_center',
        'customer',
        'payments',
      ]),
    },
  });

/** Pick stored profile or first enabled profile. */
export async function resolveActivePOSProfile(preferredName) {
  const stored = preferredName || getStoredPOSProfile();
  if (stored) {
    try {
      const res = await getPOSProfile(stored);
      const doc = res?.data?.data;
      if (doc && !doc.disabled) {
        setStoredPOSProfile(doc.name);
        return normalizePOSProfile(doc);
      }
    } catch {
      setStoredPOSProfile('');
      /* fall through — stale name (e.g. "Main") or permission denied */
    }
  }

  const listRes = await listPOSProfiles({ limit: 20 });
  const rows = listRes?.data?.data || [];
  if (!rows.length) {
    throw new Error('No POS Profile found. Create one in ERPNext and link a warehouse.');
  }
  const first = rows[0];
  setStoredPOSProfile(first.name);
  const detailRes = await getPOSProfile(first.name);
  return normalizePOSProfile(detailRes?.data?.data || first);
}

export function normalizePOSProfile(doc) {
  const payments = Array.isArray(doc.payments)
    ? doc.payments.map((p) => p.mode_of_payment).filter(Boolean)
    : [];
  return {
    name: doc.name,
    company: doc.company,
    warehouse: doc.warehouse,
    selling_price_list: doc.selling_price_list,
    currency: doc.currency || 'EGP',
    defaultCustomer: doc.customer || 'Walk-in Customer',
    paymentModes: payments.length ? payments : ['Cash'],
  };
}

export const listModeOfPayments = () =>
  api.get('/api/resource/Mode of Payment', {
    params: {
      fields: JSON.stringify(['name', 'type', 'enabled']),
      filters: JSON.stringify([['enabled', '=', 1]]),
      limit_page_length: 50,
    },
  });

/** Modes allowed on this profile (profile payments or all enabled MOPs). */
export async function getPOSPaymentModes(profile) {
  if (profile?.paymentModes?.length) {
    return profile.paymentModes.map((name) => ({ name, type: guessMopType(name) }));
  }
  try {
    const res = await listModeOfPayments();
    return (res?.data?.data || []).map((m) => ({ name: m.name, type: m.type }));
  } catch {
    return [{ name: 'Cash', type: 'Cash' }, { name: 'Card', type: 'Bank' }];
  }
}

function guessMopType(name) {
  const n = String(name).toLowerCase();
  if (n.includes('card') || n.includes('visa') || n.includes('bank')) return 'Bank';
  return 'Cash';
}

export { getOpenPOSOpeningEntry } from './shiftsApi';
export { openShift as startPOSShift } from './shiftsService';

/** @deprecated Use shift close reconciliation (/shifts/close) with counted cash. */
export async function endPOSShift({ openingEntry }) {
  if (!openingEntry) throw new Error('openingEntry required');
  return {
    redirectTo: `/shifts/close?opening=${encodeURIComponent(openingEntry)}`,
  };
}

export async function searchPOSItems({ query, warehouse, priceList, limit = 60 }) {
  const q = String(query || '').trim();
  let items = [];

  if (q) {
    const byBarcode = await searchItemByBarcode(q, warehouse, priceList);
    if (byBarcode) return [byBarcode];

    const [byCode, byName] = await Promise.all([
      api.get('/api/resource/Item', {
        params: {
          fields: JSON.stringify(itemFields()),
          filters: JSON.stringify([['disabled', '=', 0], ['item_code', 'like', `%${q}%`]]),
          limit_page_length: limit,
        },
      }),
      api.get('/api/resource/Item', {
        params: {
          fields: JSON.stringify(itemFields()),
          filters: JSON.stringify([['disabled', '=', 0], ['item_name', 'like', `%${q}%`]]),
          limit_page_length: limit,
        },
      }),
    ]);
    const merged = new Map();
    [...(byCode?.data?.data || []), ...(byName?.data?.data || [])].forEach((row) => {
      merged.set(row.item_code, row);
    });
    items = [...merged.values()];
  } else {
    const res = await api.get('/api/resource/Item', {
      params: {
        fields: JSON.stringify(itemFields()),
        filters: JSON.stringify([['disabled', '=', 0]]),
        limit_page_length: limit,
      },
    });
    items = res?.data?.data || [];
  }

  items = await attachPrices(items, priceList);
  if (warehouse) items = await attachStock(items, warehouse);
  return items;
}

function itemFields() {
  return ['name', 'item_name', 'item_code', 'item_group', 'standard_rate', 'stock_uom', 'image', 'disabled', 'is_stock_item'];
}

async function searchItemByBarcode(barcode, warehouse, priceList) {
  try {
    const bcRes = await api.get('/api/resource/Item Barcode', {
      params: {
        fields: JSON.stringify(['barcode', 'parent', 'barcode_type']),
        filters: JSON.stringify([['barcode', '=', barcode]]),
        limit_page_length: 1,
      },
    });
    const bc = bcRes?.data?.data?.[0];
    if (!bc?.parent) return null;
    const itemRes = await api.get(`/api/resource/Item/${encodeURIComponent(bc.parent)}`, {
      params: { fields: JSON.stringify(itemFields()) },
    });
    let item = itemRes?.data?.data;
    if (!item || item.disabled) return null;
    [item] = await attachPrices([item], priceList);
    if (warehouse) [item] = await attachStock([item], warehouse);
    return item;
  } catch {
    return null;
  }
}

async function attachPrices(items, priceList) {
  if (!items.length) return items;
  const codes = items.map((i) => i.item_code).filter(Boolean);
  try {
    const { fetchSellingItemPrices } = await import('./pricingApi');
    const priceMap = await fetchSellingItemPrices(codes, priceList || undefined);
    return items.map((item) => ({
      ...item,
      standard_rate: priceMap[item.item_code] ?? (Number(item.standard_rate) || 0),
    }));
  } catch {
    return items;
  }
}

async function attachStock(items, warehouse) {
  const codes = items.map((i) => i.item_code).filter(Boolean);
  if (!codes.length || !warehouse) return items;
  try {
    const stockMap = await getSellableStockBulk({ warehouse, itemCodes: codes });
    return items.map((item) => {
      const isStock = item.is_stock_item !== 0;
      const row = stockMap[item.item_code];
      const actual_qty = isStock ? Number(row?.actual_qty ?? 0) : null;
      const reserved_qty = isStock ? Number(row?.reserved_qty ?? 0) : null;
      // Backend returns actual_qty - reserved_qty which can be negative when reserved_qty
      // exceeds actual (e.g. oversold SO reservation). Clamp to 0 so UI never displays or
      // acts on a negative sellable quantity.
      const sellable_qty = isStock ? Math.max(0, Number(row?.sellable_qty ?? 0)) : null;
      return {
        ...item,
        sellable_qty,
        actual_qty: actual_qty ?? 0,
        reserved_qty: reserved_qty ?? 0,
        projected_qty: isStock ? Number(row?.projected_qty ?? 0) : null,
        displayed_qty: sellable_qty,
        is_stock_item: isStock,
        pos_warehouse: warehouse,
      };
    });
  } catch {
    // Fail-closed: if stock fetch fails, treat stock as unavailable.
    return items.map((item) => ({ ...item, sellable_qty: 0, pos_warehouse: warehouse }));
  }
}

export async function refreshItemStock(itemCode, warehouse) {
  const { getSellableStock } = await import('./stockService');
  const row = await getSellableStock({ itemCode, warehouse });
  return Math.max(0, Number(row?.sellable_qty ?? 0));
}

/** Bins with stock for cart items (all warehouses) — POS alternate-warehouse hints. */
export async function fetchItemBinsAcrossWarehouses(itemCodes = []) {
  const codes = [...new Set(itemCodes.filter(Boolean))];
  if (!codes.length) return new Map();

  try {
    const res = await api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
      params: {
        item_codes: JSON.stringify(codes),
        min_sellable_qty: 0.000001,
        limit_page_length: Math.max(200, codes.length * 10),
      },
    });
    const map = new Map();
    for (const bin of res?.data?.message || []) {
      const code = bin.item_code;
      if (!code) continue;
      const qty = Number(bin.sellable_qty) || 0;
      if (qty <= 0) continue;
      if (!map.has(code)) map.set(code, []);
      map.get(code).push({ warehouse: bin.warehouse, qty });
    }
    return map;
  } catch {
    return new Map();
  }
}

export const getShiftPOSInvoices = ({ posProfile, fromDate, owner, limit = 500 }) => {
  const filters = [
    ['docstatus', '=', 1],
    ['is_pos', '=', 1],
    ['pos_profile', '=', posProfile],
    ['posting_date', '>=', fromDate],
  ];
  if (owner) filters.push(['owner', '=', owner]);
  return api.get('/api/resource/POS Invoice', {
    params: {
      fields: JSON.stringify(['name', 'grand_total', 'posting_date', 'customer', 'owner']),
      filters: JSON.stringify(filters),
      limit_page_length: limit,
    },
  });
};

export async function getShiftMetrics({ posProfile, fromDate, owner }) {
  try {
    const res = await getShiftPOSInvoices({ posProfile, fromDate, owner });
    const rows = res?.data?.data || [];
    const sales = rows.reduce((s, r) => s + Number(r.grand_total || 0), 0);
    const count = rows.length;
    return {
      sales,
      invoiceCount: count,
      averageOrder: count ? sales / count : 0,
    };
  } catch {
    return { sales: 0, invoiceCount: 0, averageOrder: 0 };
  }
}

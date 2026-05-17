/**
 * ERPNext POS-specific API (profiles, shifts, payments, catalog).
 */
import api from './api';

const STORAGE_PROFILE_KEY = 'elmahdi_active_pos_profile';

export function getStoredPOSProfile() {
  try {
    return localStorage.getItem(STORAGE_PROFILE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPOSProfile(name) {
  try {
    if (name) localStorage.setItem(STORAGE_PROFILE_KEY, name);
    else localStorage.removeItem(STORAGE_PROFILE_KEY);
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
      /* fall through */
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

export const getBinsForWarehouse = (warehouse, itemCodes = []) => {
  const filters = [['warehouse', '=', warehouse]];
  if (itemCodes.length) filters.push(['item_code', 'in', itemCodes]);
  return api.get('/api/resource/Bin', {
    params: {
      fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'projected_qty']),
      filters: JSON.stringify(filters),
      limit_page_length: Math.max(500, itemCodes.length || 500),
    },
  });
};

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
    const filters = [['item_code', 'in', codes], ['selling', '=', 1]];
    if (priceList) filters.push(['price_list', '=', priceList]);
    const priceRes = await api.get('/api/resource/Item Price', {
      params: {
        fields: JSON.stringify(['item_code', 'price_list_rate', 'price_list']),
        filters: JSON.stringify(filters),
        order_by: 'modified desc',
        limit_page_length: codes.length * 3,
      },
    });
    const map = new Map();
    for (const row of priceRes?.data?.data || []) {
      if (!map.has(row.item_code)) map.set(row.item_code, Number(row.price_list_rate) || 0);
    }
    return items.map((item) => ({
      ...item,
      standard_rate: map.get(item.item_code) ?? (Number(item.standard_rate) || 0),
    }));
  } catch {
    return items;
  }
}

async function attachStock(items, warehouse) {
  const codes = items.map((i) => i.item_code).filter(Boolean);
  if (!codes.length) return items;
  try {
    const binRes = await getBinsForWarehouse(warehouse, codes);
    const byItem = new Map();
    for (const bin of binRes?.data?.data || []) {
      const avail = Math.max(0, Number(bin.actual_qty || 0) - Number(bin.reserved_qty || 0));
      byItem.set(bin.item_code, (byItem.get(bin.item_code) || 0) + avail);
    }
    return items.map((item) => {
      const isStock = item.is_stock_item !== 0;
      const available_qty = isStock ? (byItem.get(item.item_code) ?? 0) : null;
      return { ...item, available_qty, is_stock_item: isStock };
    });
  } catch {
    return items.map((item) => ({ ...item, available_qty: null }));
  }
}

export async function refreshItemStock(itemCode, warehouse) {
  const binRes = await getBinsForWarehouse(warehouse, [itemCode]);
  const bins = binRes?.data?.data || [];
  const available_qty = bins.reduce(
    (s, b) => s + Math.max(0, Number(b.actual_qty || 0) - Number(b.reserved_qty || 0)),
    0
  );
  return available_qty;
}

/** Bins with stock for cart items (all warehouses) — POS alternate-warehouse hints. */
export async function fetchItemBinsAcrossWarehouses(itemCodes = []) {
  const codes = [...new Set(itemCodes.filter(Boolean))];
  if (!codes.length) return new Map();

  try {
    const res = await api.get('/api/resource/Bin', {
      params: {
        fields: JSON.stringify(['item_code', 'warehouse', 'actual_qty', 'reserved_qty']),
        filters: JSON.stringify([
          ['item_code', 'in', codes],
          ['actual_qty', '>', 0],
        ]),
        limit_page_length: Math.max(200, codes.length * 10),
      },
    });
    const map = new Map();
    for (const bin of res?.data?.data || []) {
      const code = bin.item_code;
      if (!code) continue;
      const qty = Math.max(0, Number(bin.actual_qty || 0) - Number(bin.reserved_qty || 0));
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

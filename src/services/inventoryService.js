import { getItems } from './api';
import {
  listBatches,
  listItemsForInventory,
  listStockLedger,
  listWarehouses,
} from './inventoryApi';
import api from './api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
}

/** Parse Item.reorder_levels child table into map warehouse -> reorder_level */
export function parseReorderLevels(item) {
  const map = new Map();
  const rows = item?.reorder_levels || [];
  for (const row of rows) {
    if (row.warehouse) map.set(row.warehouse, toNum(row.warehouse_reorder_level ?? row.reorder_level));
  }
  return map;
}

export async function getWarehousesList() {
  const res = await listWarehouses({ limit: 200 });
  return (res?.data?.data || []).filter((w) => !w.is_group);
}

function rowFromBin(bin, itemByCode) {
  const code = bin.item_code;
  if (!code) return null;

  const item = itemByCode.get(code) || {};
  const qty = Math.max(0, Number(bin.sellable_qty ?? 0));
  const standardRate = toNum(item.standard_rate);
  const valuationRate = toNum(bin.valuation_rate);
  const price = standardRate > 0 ? standardRate : valuationRate;
  const value = qty * price;
  const wh = bin.warehouse || '';
  const reorderMap = parseReorderLevels(item);
  const reorderLevel = reorderMap.get(wh) ?? 0;

  return {
    row_key: `${code}|${wh}`,
    item_code: code,
    item_name: item.item_name || code,
    qty,
    price,
    value,
    warehouse: wh,
    warehouse_label: wh,
    reorder_level: reorderLevel,
    needs_reorder: reorderLevel > 0 && qty <= reorderLevel,
  };
}

/** One table row per ERP Bin (item + warehouse); no cross-warehouse aggregation.
 *
 * Items with NO Bin yet (newly created, never stocked) get a synthetic
 * qty=0 row so they remain visible in the inventory list — otherwise the
 * page looks empty after onboarding a fresh catalog. */
export function buildPerWarehouseRows(bins, items) {
  const itemByCode = new Map(items.map((i) => [i.item_code, i]));
  const seen = new Set();
  const itemsWithBin = new Set();
  const rows = [];

  for (const bin of bins) {
    const wh = bin.warehouse || '';
    const key = `${bin.item_code}|${wh}`;
    if (!bin.item_code || seen.has(key)) continue;
    seen.add(key);
    itemsWithBin.add(bin.item_code);
    const row = rowFromBin(bin, itemByCode);
    if (row) rows.push(row);
  }

  for (const item of items) {
    const code = item.item_code;
    if (!code || itemsWithBin.has(code)) continue;
    if (item.is_stock_item === 0 || item.disabled === 1) continue;
    rows.push({
      row_key: `${code}|`,
      item_code: code,
      item_name: item.item_name || code,
      qty: 0,
      price: toNum(item.standard_rate),
      value: 0,
      warehouse: '',
      warehouse_label: '',
      reorder_level: 0,
      needs_reorder: false,
    });
  }

  rows.sort((a, b) => b.value - a.value || a.item_code.localeCompare(b.item_code));
  return rows;
}

/** KPI totals — aggregated across bins (unique products, summed qty/value). */
export function computeInventoryMetrics(rows) {
  const qtyByItem = new Map();
  const valueByItem = new Map();

  for (const row of rows) {
    const code = row.item_code;
    qtyByItem.set(code, (qtyByItem.get(code) || 0) + row.qty);
    valueByItem.set(code, (valueByItem.get(code) || 0) + row.value);
  }

  let lowStock = 0;
  let outOfStock = 0;
  for (const qty of qtyByItem.values()) {
    if (qty <= 0) outOfStock += 1;
    else if (qty <= 5) lowStock += 1;
  }

  return {
    totalProducts: qtyByItem.size,
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    lowStock,
    outOfStock,
    reorderCount: rows.filter((r) => r.needs_reorder).length,
  };
}

export async function getInventorySnapshot({ itemLimit = 400, binLimit = 2000, warehouse } = {}) {
  const scopedWarehouse = warehouse && warehouse !== 'all' ? warehouse : null;
  const [itemsRes, binsRes] = await Promise.all([
    listItemsForInventory({ limit: itemLimit }).catch(() => getItems({ limit: itemLimit })),
    (async () => {
      // Centralized stock read (never compute client-side).
      const res = await api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
        params: {
          ...(scopedWarehouse ? { warehouse: scopedWarehouse } : {}),
          limit: scopedWarehouse ? binLimit : Math.min(binLimit, 2000),
        },
      });
      return { data: { data: res?.data?.message || [] } };
    })(),
  ]);

  const items = itemsRes?.data?.data || [];
  const bins = binsRes?.data?.data || [];
  const rows = buildPerWarehouseRows(bins, items);

  return {
    rows,
    metrics: computeInventoryMetrics(rows),
  };
}

export async function getReorderSuggestions({ warehouse, limit = 100 } = {}) {
  const snapshot = await getInventorySnapshot({ warehouse, itemLimit: 600 });
  return snapshot.rows
    .filter((r) => r.needs_reorder || (r.reorder_level > 0 && r.qty <= r.reorder_level))
    .map((r) => ({
      ...r,
      suggested_qty: Math.max(r.reorder_level * 2 - r.qty, r.reorder_level),
    }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, limit);
}

export async function getBatchAlerts({ daysAhead = 30, limit = 200 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await listBatches({
    filters: [['expiry_date', 'is', 'set']],
    limit: 500,
  });
  const batches = res?.data?.data || [];

  return batches
    .map((b) => {
      const days = daysUntil(b.expiry_date);
      return {
        batch_no: b.name,
        item_code: b.item,
        qty: toNum(b.batch_qty),
        expiry_date: b.expiry_date,
        days_until_expiry: days,
        status: days == null ? 'unknown' : days <= 0 ? 'expired' : days <= daysAhead ? 'near' : 'ok',
      };
    })
    .filter((b) => b.status === 'expired' || b.status === 'near')
    .sort((a, b) => (a.days_until_expiry ?? 999) - (b.days_until_expiry ?? 999))
    .slice(0, limit);
}

export async function getItemMovementTimeline(itemCode, { limit = 100 } = {}) {
  const res = await listStockLedger({
    limit,
    filters: [['item_code', '=', itemCode]],
  });
  const rows = res?.data?.data || [];

  return rows.map((row) => {
    const qty = toNum(row.actual_qty);
    let category = 'other';
    const vt = String(row.voucher_type || '').toLowerCase();
    if (vt.includes('purchase')) category = 'purchase';
    else if (vt.includes('sales') || vt.includes('pos') || vt.includes('delivery')) category = 'sale';
    else if (vt.includes('reconciliation')) category = 'adjustment';
    else if (vt.includes('stock entry')) category = qty >= 0 ? 'transfer_in' : 'transfer_out';

    return {
      ...row,
      category,
      direction: qty >= 0 ? 'in' : 'out',
    };
  });
}

export async function getInventoryAnalytics({ warehouse, days = 30 } = {}) {
  const snapshot = await getInventorySnapshot({ warehouse, itemLimit: 500 });
  const rows = snapshot.rows;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const ledgerFilters = [['posting_date', '>=', fromStr]];
  if (warehouse && warehouse !== 'all') ledgerFilters.push(['warehouse', '=', warehouse]);

  let ledger = [];
  try {
    const ledgerRes = await listStockLedger({ limit: 1500, filters: ledgerFilters });
    ledger = ledgerRes?.data?.data || [];
  } catch {
    ledger = [];
  }

  const movementByItem = new Map();
  for (const row of ledger) {
    const code = row.item_code;
    if (!code) continue;
    const qty = Math.abs(toNum(row.actual_qty));
    movementByItem.set(code, (movementByItem.get(code) || 0) + qty);
  }

  const topMovers = [...movementByItem.entries()]
    .map(([item_code, movement_qty]) => {
      const item = rows.find((r) => r.item_code === item_code);
      return {
        item_code,
        item_name: item?.item_name || item_code,
        movement_qty,
        stock_qty: item?.qty ?? 0,
        value: item?.value ?? 0,
      };
    })
    .sort((a, b) => b.movement_qty - a.movement_qty)
    .slice(0, 10);

  const deadStock = rows
    .filter((r) => r.qty > 0 && !movementByItem.has(r.item_code))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const valueTrend = buildValueTrend(ledger, days);

  return {
    metrics: snapshot.metrics,
    topMovers,
    deadStock,
    valueTrend,
    totalMovementLines: ledger.length,
  };
}

function buildValueTrend(ledger, days) {
  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of ledger) {
    const key = row.posting_date;
    if (!buckets.has(key)) continue;
    buckets.set(key, buckets.get(key) + Math.abs(toNum(row.stock_value_difference)));
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}

export async function getStockBalanceReport({ warehouse, itemSearch, limit = 1000 } = {}) {
  const scopedWarehouse = warehouse && warehouse !== 'all' ? warehouse : null;
  const res = await api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
    params: {
      ...(scopedWarehouse ? { warehouse: scopedWarehouse } : {}),
      limit,
    },
  });
  let rows = res?.data?.message || [];

  if (itemSearch?.trim()) {
    const q = itemSearch.trim().toLowerCase();
    rows = rows.filter((r) => r.item_code?.toLowerCase().includes(q));
  }

  const grouped = new Map();
  for (const row of rows) {
    const wh = row.warehouse || '—';
    if (!grouped.has(wh)) grouped.set(wh, []);
    grouped.get(wh).push({
      ...row,
      available_qty: Math.max(0, toNum(row.sellable_qty)),
      stock_value: toNum(row.actual_qty) * toNum(row.valuation_rate),
    });
  }

  return {
    rows,
    grouped: [...grouped.entries()].map(([warehouseName, items]) => ({
      warehouse: warehouseName,
      items,
      total_qty: items.reduce((s, i) => s + toNum(i.actual_qty), 0),
      total_value: items.reduce((s, i) => s + i.stock_value, 0),
    })),
  };
}

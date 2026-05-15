import { getItems } from './api';
import {
  listBatches,
  listBins,
  listItemsForInventory,
  listStockLedger,
  listWarehouses,
} from './inventoryApi';

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

export async function getInventorySnapshot({ itemLimit = 400, binLimit = 2000, warehouse } = {}) {
  const binFilters = warehouse && warehouse !== 'all' ? [['warehouse', '=', warehouse]] : [];
  const [itemsRes, binsRes] = await Promise.all([
    listItemsForInventory({ limit: itemLimit }).catch(() => getItems({ limit: itemLimit })),
    listBins({ limit: binLimit, filters: binFilters }),
  ]);

  const items = itemsRes?.data?.data || [];
  const bins = binsRes?.data?.data || [];

  const qtyByItem = new Map();
  const valuationByItem = new Map();
  const warehouseByItem = new Map();

  for (const row of bins) {
    const code = row.item_code;
    if (!code) continue;
    const rowQty = toNum(row.actual_qty);
    qtyByItem.set(code, (qtyByItem.get(code) || 0) + rowQty);
    if (!warehouseByItem.has(code)) warehouseByItem.set(code, row.warehouse);

    const valuationRate = toNum(row.valuation_rate);
    if (valuationRate > 0) {
      const prev = valuationByItem.get(code) || 0;
      if (valuationRate > prev) valuationByItem.set(code, valuationRate);
    }
  }

  const itemByCode = new Map(items.map((i) => [i.item_code, i]));

  const rows = items.map((item) => {
    const qty = qtyByItem.get(item.item_code) || 0;
    const standardRate = toNum(item.standard_rate);
    const valuationRate = valuationByItem.get(item.item_code) || 0;
    const price = standardRate > 0 ? standardRate : valuationRate;
    const value = qty * price;
    const reorderMap = parseReorderLevels(itemByCode.get(item.item_code) || item);
    const wh = warehouseByItem.get(item.item_code);
    const reorderLevel = warehouse && warehouse !== 'all'
      ? reorderMap.get(warehouse) ?? 0
      : Math.max(0, ...reorderMap.values());

    return {
      item_code: item.item_code,
      item_name: item.item_name,
      qty,
      price,
      value,
      warehouse: wh,
      warehouse_label: wh,
      reorder_level: reorderLevel,
      needs_reorder: reorderLevel > 0 && qty <= reorderLevel,
    };
  });

  rows.sort((a, b) => b.value - a.value);

  const totalProducts = rows.length;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowStock = rows.filter((r) => r.qty > 0 && r.qty <= 5).length;
  const outOfStock = rows.filter((r) => r.qty <= 0).length;
  const reorderCount = rows.filter((r) => r.needs_reorder).length;

  return {
    rows,
    metrics: { totalProducts, totalQty, totalValue, lowStock, outOfStock, reorderCount },
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
  const filters = [];
  if (warehouse && warehouse !== 'all') filters.push(['warehouse', '=', warehouse]);

  const binRes = await listBins({ limit, filters });
  let rows = binRes?.data?.data || [];

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
      available_qty: Math.max(0, toNum(row.actual_qty) - toNum(row.reserved_qty)),
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

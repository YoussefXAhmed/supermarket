/**
 * Authoritative ERP stock reads — Bin.actual_qty scoped by warehouse.
 */
import api from './api';

let stockVersion = 0;

export function bumpStockVersion() {
  stockVersion += 1;
  return stockVersion;
}

export function getStockVersion() {
  return stockVersion;
}

export async function fetchWarehouseStock(warehouse, itemCodes = []) {
  if (!warehouse) return {};
  const codes = [...new Set((itemCodes || []).filter(Boolean))];
  const res = await api.get('/api/method/elmahdi.api.stock.get_warehouse_stock', {
    params: {
      warehouse,
      item_codes: codes.length ? JSON.stringify(codes) : undefined,
      _v: getStockVersion(),
    },
  });
  return res?.data?.message || {};
}

export async function fetchPOSProfileStock(posProfile, itemCodes = []) {
  if (!posProfile) return { warehouse: '', items: {} };
  const codes = [...new Set((itemCodes || []).filter(Boolean))];
  const res = await api.get('/api/method/elmahdi.api.stock.get_pos_profile_stock', {
    params: {
      pos_profile: posProfile,
      item_codes: codes.length ? JSON.stringify(codes) : undefined,
      _v: getStockVersion(),
    },
  });
  const msg = res?.data?.message || {};
  return {
    warehouse: msg.warehouse || '',
    items: msg.items || {},
  };
}

export function availableFromStockRow(row) {
  if (!row) return 0;
  if (row.available_qty != null) return Math.max(0, Number(row.available_qty) || 0);
  const actual = Number(row.actual_qty) || 0;
  const reserved = Number(row.reserved_qty) || 0;
  return Math.max(0, actual - reserved);
}

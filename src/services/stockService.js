/**
 * Authoritative ERP stock reads — always from backend stock API.
 */
import api from './api';

export async function getSellableStock({ itemCode, warehouse }) {
  if (!itemCode || !warehouse) {
    return {
      item_code: String(itemCode || ''),
      warehouse: String(warehouse || ''),
      actual_qty: 0,
      reserved_qty: 0,
      projected_qty: 0,
      sellable_qty: 0,
      has_stock: false,
    };
  }
  const res = await api.get('/api/method/elmahdi.api.stock.get_sellable_stock', {
    params: { item_code: itemCode, warehouse },
  });
  return res?.data?.message || null;
}

export async function getSellableStockBulk({ warehouse, itemCodes = [] }) {
  if (!warehouse) return {};
  const codes = [...new Set((itemCodes || []).filter(Boolean))];
  if (!codes.length) return {};
  const res = await api.get('/api/method/elmahdi.api.stock.get_sellable_stock_bulk', {
    params: { warehouse, item_codes: JSON.stringify(codes) },
  });
  return res?.data?.message || {};
}

export async function getPOSProfileWarehouse(posProfile) {
  if (!posProfile) return '';
  const res = await api.get('/api/method/elmahdi.api.stock.get_pos_profile_warehouse', {
    params: { pos_profile: posProfile },
  });
  return res?.data?.message?.warehouse || '';
}

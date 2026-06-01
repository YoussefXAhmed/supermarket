import { api } from './api';

const BASE = '/api/method/elmahdi.api.inventory_thresholds';

const EMPTY_LIST = { rows: [], count: 0 };

export async function listLowStockItems(warehouse = '') {
  const res = await api.get(`${BASE}.list_low_stock_items`, {
    params: { warehouse: warehouse || undefined },
  });
  return res?.data?.message || EMPTY_LIST;
}

export async function listReorderItems(warehouse = '') {
  const res = await api.get(`${BASE}.list_reorder_items`, {
    params: { warehouse: warehouse || undefined },
  });
  return res?.data?.message || EMPTY_LIST;
}

export async function getItemThresholds(itemCode) {
  const res = await api.get(`${BASE}.get_item_thresholds`, {
    params: { item_code: itemCode },
  });
  return res?.data?.message || null;
}

export async function updateItemThresholds({ itemCode, alertLevel, reorderLevel, reorderQty }) {
  const params = { item_code: itemCode };
  if (alertLevel !== undefined) params.alert_level = alertLevel;
  if (reorderLevel !== undefined) params.reorder_level = reorderLevel;
  if (reorderQty !== undefined) params.reorder_qty = reorderQty;
  const res = await api.post(`${BASE}.update_item_thresholds`, params);
  return res?.data?.message || null;
}

/**
 * ERPNext Warehouse DocType — admin CRUD (no ignore_permissions).
 */
import api from './api';
import { listStockLedger } from './inventoryApi';

export const WAREHOUSE_LIST_FIELDS = [
  'name',
  'warehouse_name',
  'warehouse_type',
  'parent_warehouse',
  'company',
  'is_group',
  'disabled',
  'modified',
];

export const WAREHOUSE_DETAIL_FIELDS = [
  ...WAREHOUSE_LIST_FIELDS,
  'email_id',
  'phone_no',
  'mobile_no',
  'address_line_1',
  'city',
];

export function listWarehousesAdmin({ limit = 500, includeGroups = true } = {}) {
  const filters = includeGroups ? [] : [['is_group', '=', 0]];
  return api.get('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(WAREHOUSE_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'warehouse_name asc',
      limit_page_length: limit,
    },
  });
}

export function getWarehouseDoc(name) {
  return api.get(`/api/resource/Warehouse/${encodeURIComponent(name)}`, {
    params: { fields: JSON.stringify(WAREHOUSE_DETAIL_FIELDS) },
  });
}

export function createWarehouseDoc(payload) {
  return api.post('/api/resource/Warehouse', payload);
}

export function updateWarehouseDoc(name, payload) {
  return api.put(`/api/resource/Warehouse/${encodeURIComponent(name)}`, payload);
}

export function deleteWarehouseDoc(name) {
  return api.delete(`/api/resource/Warehouse/${encodeURIComponent(name)}`);
}

export function listChildWarehouses(parentName) {
  return api.get('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(['name', 'warehouse_name']),
      filters: JSON.stringify([['parent_warehouse', '=', parentName]]),
      limit_page_length: 50,
    },
  });
}

export function listBinsForWarehouse(warehouseName, { limit = 500 } = {}) {
  return api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
    params: { warehouse: warehouseName, limit },
  });
}

export function listLedgerForWarehouse(warehouseName, { limit = 1 } = {}) {
  return listStockLedger({
    limit,
    filters: [['warehouse', '=', warehouseName]],
  });
}

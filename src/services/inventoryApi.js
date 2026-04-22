import api, { getCompanies } from './api';

export const listWarehouses = (params = {}) =>
  api.get('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(['name', 'warehouse_name', 'warehouse_type', 'parent_warehouse', 'company', 'is_group']),
      order_by: 'modified desc',
      limit_page_length: params.limit || 200,
      ...params,
    },
  });

export const createWarehouse = async ({ warehouse_name, company, warehouse_type, parent_warehouse }) => {
  const resolvedCompany = company || (await getCompanies({ limit: 1 }))?.data?.data?.[0]?.name;
  return api.post('/api/resource/Warehouse', {
    warehouse_name,
    company: resolvedCompany,
    ...(warehouse_type ? { warehouse_type } : {}),
    ...(parent_warehouse ? { parent_warehouse } : {}),
  });
};

export const createStockEntry = ({ stock_entry_type, item_code, qty, source_warehouse, target_warehouse, company }) =>
  api.post('/api/resource/Stock Entry', {
    stock_entry_type,
    ...(company ? { company } : {}),
    items: [
      {
        item_code,
        qty: Number(qty),
        ...(source_warehouse ? { s_warehouse: source_warehouse } : {}),
        ...(target_warehouse ? { t_warehouse: target_warehouse } : {}),
      },
    ],
  });

export const listStockLedger = (params = {}) =>
  api.get('/api/resource/Stock Ledger Entry', {
    params: {
      fields: JSON.stringify([
        'name',
        'posting_date',
        'posting_time',
        'item_code',
        'warehouse',
        'actual_qty',
        'qty_after_transaction',
        'voucher_type',
        'voucher_no',
        'stock_value_difference',
        'company',
      ]),
      order_by: 'posting_date desc, posting_time desc',
      limit_page_length: params.limit || 200,
      ...(params.filters ? { filters: JSON.stringify(params.filters) } : {}),
    },
  });

export const listBins = (params = {}) =>
  api.get('/api/resource/Bin', {
    params: {
      fields: JSON.stringify([
        'item_code',
        'warehouse',
        'actual_qty',
        'reserved_qty',
        'ordered_qty',
        'valuation_rate',
      ]),
      limit_page_length: params.limit || 500,
      ...(params.filters ? { filters: JSON.stringify(params.filters) } : {}),
    },
  });

export const getItemDetails = (itemCode) =>
  api.get(`/api/resource/Item/${encodeURIComponent(itemCode)}`, {
    params: {
      fields: JSON.stringify([
        'name',
        'item_name',
        'item_code',
        'item_group',
        'stock_uom',
        'disabled',
        'standard_rate',
        'valuation_rate',
        'description',
      ]),
    },
  });

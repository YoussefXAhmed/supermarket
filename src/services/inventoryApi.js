import { validateStockEntry } from '../utils/inventoryValidation';
import { ActivityType, logActivity } from './activityLogService';
import api, { getCompanies } from './api';
import {
  messageFromResponse,
  submitStockEntryOnServer,
  submitStockReconciliationOnServer,
} from './erpSubmitApi';

const SUBMIT_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const listWarehouses = (params = {}) =>
  api.get('/api/resource/Warehouse', {
    params: {
      fields: JSON.stringify(['name', 'warehouse_name', 'warehouse_type', 'parent_warehouse', 'company', 'is_group']),
      filters: JSON.stringify([['is_group', '=', 0]]),
      order_by: 'modified desc',
      limit_page_length: params.limit || 200,
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
        'batch_no',
      ]),
      order_by: params.order_by || 'posting_date desc, posting_time desc',
      limit_page_length: params.limit || 200,
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
        'image',
        'has_batch_no',
        'has_expiry_date',
        'reorder_levels',
      ]),
    },
  });

export const listItemsForInventory = (params = {}) =>
  api.get('/api/resource/Item', {
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
        'has_batch_no',
        'is_stock_item',
        'reorder_levels',
        'image',
      ]),
      filters: JSON.stringify([
        ['disabled', '=', 0],
        ['is_stock_item', '=', 1],
        ...(params.extraFilters || []),
      ]),
      limit_page_length: params.limit || 500,
    },
  });

export const listBatches = (params = {}) =>
  api.get('/api/resource/Batch', {
    params: {
      fields: JSON.stringify([
        'name',
        'item',
        'batch_qty',
        'expiry_date',
        'manufacturing_date',
        'supplier',
      ]),
      filters: JSON.stringify(params.filters || []),
      order_by: params.order_by || 'expiry_date asc',
      limit_page_length: params.limit || 500,
    },
  });

export const listBatchStock = async (itemCode, warehouse) => {
  try {
    const res = await api.get('/api/resource/Stock Ledger Entry', {
      params: {
        fields: JSON.stringify(['item_code', 'warehouse', 'batch_no', 'qty_after_transaction', 'posting_date']),
        filters: JSON.stringify([
          ['item_code', '=', itemCode],
          ['warehouse', '=', warehouse],
          ['batch_no', '!=', ''],
          ['is_cancelled', '!=', 1],
        ]),
        order_by: 'posting_date desc, posting_time desc',
        limit_page_length: 200,
      },
    });
    const rows = res?.data?.data || [];
    const byBatch = new Map();
    for (const row of rows) {
      if (!row.batch_no) continue;
      if (!byBatch.has(row.batch_no)) {
        byBatch.set(row.batch_no, { batch_no: row.batch_no, qty: Number(row.qty_after_transaction) || 0 });
      }
    }
    return [...byBatch.values()];
  } catch {
    return [];
  }
};

export const createStockEntry = (payload) =>
  api.post('/api/resource/Stock Entry', payload);

export const getStockEntry = (name) =>
  api.get(`/api/resource/Stock Entry/${encodeURIComponent(name)}`);

export async function createAndSubmitStockEntry({
  stock_entry_type,
  item_code,
  qty,
  source_warehouse,
  target_warehouse,
  company,
  sourceQty,
}) {
  const validation = validateStockEntry({
    stock_entry_type,
    item_code,
    qty,
    source_warehouse,
    target_warehouse,
    sourceQty,
  });
  if (!validation.valid) {
    const err = new Error(validation.errors.join(' '));
    err.validationErrors = validation.errors;
    throw err;
  }

  const items = [
    {
      item_code: item_code.trim(),
      qty: Number(qty),
      ...(source_warehouse ? { s_warehouse: source_warehouse } : {}),
      ...(target_warehouse ? { t_warehouse: target_warehouse } : {}),
    },
  ];

  const res = await createStockEntry({
    stock_entry_type,
    company,
    items,
  });

  const name = res?.data?.data?.name;
  if (!name) throw new Error('Stock Entry was not created');

  let lastErr;
  for (let i = 0; i <= SUBMIT_RETRIES; i += 1) {
    try {
      const submitRes = await submitStockEntryOnServer(name);
      const serverDoc = messageFromResponse(submitRes);
      const doc = await getStockEntry(name);
      logActivity({
        type: stock_entry_type === 'Stock Reconciliation' ? ActivityType.ADJUSTMENT : ActivityType.STOCK,
        action: `Stock entry: ${stock_entry_type}`,
        detail: {
          name,
          item_code,
          qty,
          type: stock_entry_type,
          stock_ledger_entries: serverDoc?.stock_ledger_entries,
        },
      });
      return { name, doc: doc?.data?.data, submitted: true, server: serverDoc };
    } catch (e) {
      lastErr = e;
      if (i < SUBMIT_RETRIES) await sleep(400);
    }
  }

  const err = lastErr || new Error('Stock Entry created but submit failed');
  err.draftName = name;
  throw err;
}

export const createStockReconciliation = (payload) =>
  api.post('/api/resource/Stock Reconciliation', payload);

export async function createAndSubmitStockReconciliation({
  company,
  purpose,
  warehouse,
  items,
  posting_date,
}) {
  const postingDate = posting_date || new Date().toISOString().slice(0, 10);
  const res = await createStockReconciliation({
    company,
    purpose: purpose || 'Stock Reconciliation',
    posting_date: postingDate,
    set_warehouse: warehouse,
    items: items.map((row) => ({
      item_code: row.item_code,
      warehouse: row.warehouse || warehouse,
      qty: Number(row.qty),
      valuation_rate: row.valuation_rate != null ? Number(row.valuation_rate) : undefined,
    })),
  });

  const name = res?.data?.data?.name;
  if (!name) throw new Error('Stock Reconciliation was not created');

  await submitStockReconciliationOnServer(name);
  return name;
}

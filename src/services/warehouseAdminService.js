/**
 * Warehouse admin orchestration — ERP remains source of truth.
 */
import { getCompanies } from './api';
import {
  createWarehouseDoc,
  deleteWarehouseDoc,
  getWarehouseDoc,
  listBinsForWarehouse,
  listChildWarehouses,
  listLedgerForWarehouse,
  listWarehousesAdmin,
  updateWarehouseDoc,
} from './warehouseAdminApi';
import api from './api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeWarehouse(row) {
  if (!row) return null;
  return {
    name: row.name,
    warehouse_name: row.warehouse_name || row.name,
    warehouse_type: row.warehouse_type || '',
    parent_warehouse: row.parent_warehouse || '',
    company: row.company || '',
    is_group: Boolean(row.is_group),
    disabled: Boolean(row.disabled),
    modified: row.modified,
    stock_qty: row.stock_qty ?? null,
  };
}

async function buildStockQtyMap() {
  const map = new Map();
  try {
    const res = await api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
      params: { limit: 5000 },
    });
    for (const bin of res?.data?.message || []) {
      const wh = bin.warehouse;
      if (!wh) continue;
      map.set(wh, (map.get(wh) || 0) + toNum(bin.actual_qty));
    }
  } catch {
    /* optional summary */
  }
  return map;
}

export async function listWarehousesForAdmin({ includeStockSummary = true } = {}) {
  const res = await listWarehousesAdmin({ limit: 500, includeGroups: true });
  const raw = res?.data?.data || [];
  let stockMap = new Map();
  if (includeStockSummary) {
    stockMap = await buildStockQtyMap();
  }
  return raw.map((row) =>
    normalizeWarehouse({
      ...row,
      stock_qty: includeStockSummary ? stockMap.get(row.name) || 0 : null,
    }),
  );
}

export async function getWarehouseFormOptions() {
  const [whRes, coRes] = await Promise.all([
    listWarehousesAdmin({ limit: 500, includeGroups: true }),
    getCompanies({ limit: 50 }),
  ]);
  const warehouses = (whRes?.data?.data || []).map(normalizeWarehouse);
  const companies = coRes?.data?.data || [];
  const defaultCompany = companies[0]?.name || '';
  return {
    warehouses,
    parentOptions: warehouses.filter((w) => w.is_group || !w.parent_warehouse),
    companies,
    defaultCompany,
    warehouseTypes: ['Stores', 'Transit', 'Manufacturing', 'Finished Goods', 'Work in Progress'],
  };
}

export async function createWarehouse(input) {
  const warehouse_name = String(input.warehouse_name || '').trim();
  if (!warehouse_name) throw new Error('Warehouse name is required.');
  if (!input.company) throw new Error('Company is required.');

  const payload = {
    warehouse_name,
    company: input.company,
    is_group: input.is_group ? 1 : 0,
    disabled: input.disabled ? 1 : 0,
  };
  if (input.warehouse_type) payload.warehouse_type = input.warehouse_type;
  if (input.parent_warehouse) payload.parent_warehouse = input.parent_warehouse;

  const res = await createWarehouseDoc(payload);
  return normalizeWarehouse(res?.data?.data);
}

export async function updateWarehouse(name, input) {
  const id = String(name || '').trim();
  if (!id) throw new Error('Warehouse ID is required.');

  const payload = {};
  if (input.warehouse_name != null) payload.warehouse_name = String(input.warehouse_name).trim();
  if (input.warehouse_type != null) payload.warehouse_type = input.warehouse_type || '';
  if (input.parent_warehouse != null) payload.parent_warehouse = input.parent_warehouse || '';
  if (input.disabled != null) payload.disabled = input.disabled ? 1 : 0;
  if (input.is_group != null) payload.is_group = input.is_group ? 1 : 0;

  const res = await updateWarehouseDoc(id, payload);
  return normalizeWarehouse(res?.data?.data);
}

export async function setWarehouseDisabled(name, disabled) {
  return updateWarehouse(name, { disabled });
}

/**
 * @returns {{ deletable: boolean, reasons: string[], stockQty: number }}
 */
export async function assessWarehouseDeletion(name) {
  const id = String(name || '').trim();
  const reasons = [];
  let stockQty = 0;

  const [childrenRes, binsRes, ledgerRes] = await Promise.all([
    listChildWarehouses(id).catch(() => ({ data: { data: [] } })),
    listBinsForWarehouse(id, { limit: 500 }).catch(() => ({ data: { data: [] } })),
    listLedgerForWarehouse(id, { limit: 1 }).catch(() => ({ data: { data: [] } })),
  ]);

  const children = childrenRes?.data?.data || [];
  if (children.length) {
    reasons.push(`Has ${children.length} child warehouse(s). Remove or reassign them first.`);
  }

  const bins = binsRes?.data?.data || [];
  stockQty = bins.reduce((s, b) => s + toNum(b.actual_qty), 0);
  if (stockQty > 0) {
    reasons.push(`Has stock on hand (${stockQty.toFixed(2)} units).`);
  }

  const ledger = ledgerRes?.data?.data || [];
  if (ledger.length) {
    reasons.push('Has stock ledger history. Disable instead of deleting.');
  }

  return {
    deletable: reasons.length === 0,
    reasons,
    stockQty,
  };
}

export async function deleteWarehouseSafe(name) {
  const assessment = await assessWarehouseDeletion(name);
  if (!assessment.deletable) {
    const err = new Error(
      `Cannot delete warehouse: ${assessment.reasons.join(' ')} Use Disable to archive instead.`,
    );
    err.code = 'warehouse-not-deletable';
    err.assessment = assessment;
    throw err;
  }
  await deleteWarehouseDoc(name);
  return { name, assessment };
}

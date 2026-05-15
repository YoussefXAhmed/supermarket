/**
 * Warehouse scope — prepare for ERPNext User Permissions on Warehouse.
 *
 * When `allowedWarehouses` is null, the SPA does not filter lists; ERPNext must
 * restrict `listWarehouses` / Bin queries per user. When populated (future boot
 * or permission API), UI pickers filter to assigned warehouses only.
 */

/**
 * @typedef {object} WarehouseScopeState
 * @property {string[] | null} allowedWarehouses null = rely on ERP list permissions
 * @property {boolean} loaded
 * @property {'erp' | 'user-permission' | 'default'} source
 */

export const DEFAULT_WAREHOUSE_SCOPE = {
  allowedWarehouses: null,
  loaded: false,
  source: 'erp',
};

/**
 * @param {Array<{ name?: string }>} warehouses
 * @param {WarehouseScopeState | null | undefined} scope
 */
export function filterWarehousesByScope(warehouses = [], scope) {
  const allowed = scope?.allowedWarehouses;
  if (!allowed?.length) return warehouses;
  const set = new Set(allowed);
  return warehouses.filter((w) => w?.name && set.has(w.name));
}

/**
 * @param {string} warehouseName
 * @param {WarehouseScopeState | null | undefined} scope
 */
export function isWarehouseAllowed(warehouseName, scope) {
  const allowed = scope?.allowedWarehouses;
  if (!allowed?.length) return true;
  return allowed.includes(warehouseName);
}

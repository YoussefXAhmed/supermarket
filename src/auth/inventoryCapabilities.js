/**
 * Inventory capability layer — aligned with ERPNext roles.
 * ERP DocType permissions remain authoritative for submit/write.
 */

import {
  INVENTORY_ANY_ROLES,
  INVENTORY_CLERK_ROLES,
  INVENTORY_MANAGER_ROLES,
  INVENTORY_VALUATION_ROLES,
  normalizeRole,
} from './capabilities';

export const EMPTY_INVENTORY_CAPABILITIES = {
  canAccessInventory: false,
  canInventoryOperate: false,
  canInventoryReceipt: false,
  canInventoryTransfer: false,
  canInventoryIssueTransfer: false,
  canInventoryReconcile: false,
  canInventoryValuation: false,
  canInventoryViewValuation: false,
  canInventoryManage: false,
  canInventoryAnalytics: false,
  warehouseScope: {
    allowedWarehouses: null,
    loaded: false,
    source: 'erp',
  },
};

/**
 * @param {{ canManageSystem?: boolean, canAccessInventory?: boolean }} baseCaps
 * @param {string[]} roleList ERP role names from User.roles
 */
export function deriveInventoryCapabilities(baseCaps = {}, roleList = []) {
  const normalized = roleList.map(normalizeRole).filter(Boolean);
  const canAccessInventory = Boolean(baseCaps.canAccessInventory);

  const hasClerkRole = normalized.some((r) => INVENTORY_CLERK_ROLES.has(r));
  const hasManagerInventoryRole = normalized.some((r) => INVENTORY_MANAGER_ROLES.has(r));
  const hasValuationRole = normalized.some((r) => INVENTORY_VALUATION_ROLES.has(r));
  const hasAnyInventoryRole = normalized.some((r) => INVENTORY_ANY_ROLES.has(r));

  const canInventoryOperate =
    canAccessInventory &&
    (hasAnyInventoryRole || hasClerkRole || hasManagerInventoryRole);

  const canInventoryReceipt = canInventoryOperate;

  const canInventoryTransfer = hasManagerInventoryRole;

  const canInventoryReconcile = hasManagerInventoryRole;

  const canInventoryValuation = hasValuationRole;

  const canInventoryManage =
    hasManagerInventoryRole || normalized.includes('item manager');

  const canInventoryAnalytics = canInventoryManage;

  return {
    canAccessInventory,
    canInventoryOperate,
    canInventoryReceipt,
    canInventoryTransfer,
    canInventoryIssueTransfer: canInventoryTransfer,
    canInventoryReconcile,
    canInventoryValuation,
    canInventoryViewValuation: canInventoryValuation,
    canInventoryManage,
    canInventoryAnalytics,
    warehouseScope: {
      allowedWarehouses: null,
      loaded: false,
      source: 'erp',
    },
  };
}

/** @deprecated Fail-closed — do not infer inventory caps from URL */
export function inventoryCapabilitiesFromInferredInventory() {
  return { ...EMPTY_INVENTORY_CAPABILITIES };
}

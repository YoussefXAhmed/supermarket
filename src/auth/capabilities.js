/**
 * ERP roles / Role Profile → SPA capabilities (single source of truth).
 * ERPNext remains authoritative for DocType submit/write.
 */

import { CAPS_BY_ROLE_PROFILE, WAREHOUSE_SCOPE_EMPTY } from './capabilityProfiles';
import {
  inferProfileFromRoles,
  normalizeRole,
  resolveRoleProfileKey,
} from './roleProfileResolution';
import {
  deriveInventoryCapabilities,
  EMPTY_INVENTORY_CAPABILITIES,
  inventoryCapabilitiesFromInferredInventory,
} from './inventoryCapabilities';

export { normalizeRole } from './roleProfileResolution';

export const ADMIN_ROLES = new Set(['System Manager', 'Administrator']);

/** Roles that may run POS checkout and open shifts (ERPNext POS / Elmahdi Cashier) */
export const POS_OPERATE_ROLES = new Set(['cashier', 'pos user', 'sales user']);

/** Roles that may open POS in read/monitor mode only (no profile) */
export const POS_VIEW_ROLES = new Set(['pos manager']);

export const INVENTORY_CLERK_ROLES = new Set(['stock user', 'warehouse user']);

export const INVENTORY_MANAGER_ROLES = new Set(['stock manager', 'warehouse manager']);

export const INVENTORY_VALUATION_ROLES = new Set([
  'stock manager',
  'warehouse manager',
  'item manager',
]);

export const INVENTORY_ANY_ROLES = new Set([
  'stock user',
  'stock manager',
  'item manager',
  'warehouse user',
  'warehouse manager',
]);

export const PURCHASING_ROLES = new Set(['purchase user', 'purchase manager']);

export const PURCHASING_APPROVE_ROLES = new Set(['purchase manager']);

const CAPABILITY_DEFAULTS = {
  canViewPOS: false,
  canOperatePOS: false,
  canManageShift: false,
  canOpenShift: false,
  canCloseShift: false,
  canApproveShift: false,
  canViewShiftReports: false,
  canViewInvoices: false,
  canAccessPurchasing: false,
  canApprovePurchasing: false,
  canViewSuppliers: false,
  canAccessAdminWorkspace: false,
  canViewReports: false,
  canApproveReturns: false,
  canApproveReconciliation: false,
  canViewAnalytics: false,
  canMonitorCashiers: false,
  canViewReturns: false,
  canCreateReturns: false,
  canManageUsers: false,
  canManageSettings: false,
  canManageSystem: false,
  operationalPersona: '',
  roleLabel: '',
  roleProfileName: '',
  isAdmin: false,
  isPOS: false,
  isInventory: false,
  isPurchasing: false,
  isManager: false,
  isStoreManager: false,
  ...EMPTY_INVENTORY_CAPABILITIES,
};

function mergeCaps(...layers) {
  const merged = { ...CAPABILITY_DEFAULTS };
  for (const layer of layers) {
    if (!layer) continue;
    Object.assign(merged, layer);
  }
  return finalizeCapabilities(merged);
}

function finalizeCapabilities(caps) {
  const c = { ...caps };
  c.roleProfileName = c.roleProfileName || '';
  c.warehouseScope = c.warehouseScope || { ...WAREHOUSE_SCOPE_EMPTY };

  c.canInventoryIssueTransfer = Boolean(c.canInventoryTransfer);
  c.canInventoryViewValuation = Boolean(c.canInventoryValuation);

  c.canManageShift = Boolean(c.canOpenShift && c.canCloseShift);

  c.isAdmin = Boolean(c.canManageSystem);
  c.isPOS = Boolean(c.canOperatePOS);
  c.isInventory = Boolean(c.canAccessInventory);
  c.isPurchasing = Boolean(c.canAccessPurchasing);
  c.isManager = Boolean(c.isStoreManager);
  c.isStoreManager = Boolean(
    c.operationalPersona === 'store_manager' ||
      (c.canAccessAdminWorkspace && !c.canManageSystem && c.canMonitorCashiers),
  );

  if (!c.canAccessPurchasing && (c.canManageSystem || c.isPurchasing)) {
    c.canAccessPurchasing = Boolean(c.canManageSystem || c.isPurchasing);
  }

  return c;
}

/**
 * @param {Partial<Capabilities>} overrides
 * @returns {Capabilities}
 */
export function buildCapabilities(overrides = {}) {
  return finalizeCapabilities({
    ...CAPABILITY_DEFAULTS,
    ...overrides,
    warehouseScope: overrides.warehouseScope || { ...WAREHOUSE_SCOPE_EMPTY },
  });
}

export const EMPTY_CAPABILITIES = buildCapabilities({});

function administratorCapabilities(roleList = [], roleProfileName = '') {
  return mergeCaps(
    {
      roleLabel: roleList.find((r) => ADMIN_ROLES.has(r)) || 'Administrator',
      roleProfileName,
      operationalPersona: 'administrator',
      canViewPOS: true,
      canOperatePOS: true,
      canManageShift: true,
      canOpenShift: true,
      canCloseShift: true,
      canApproveShift: true,
      canViewShiftReports: true,
      canViewInvoices: true,
      canAccessAdminWorkspace: true,
      canViewReports: true,
      canViewAnalytics: true,
      canMonitorCashiers: true,
      canApproveReturns: true,
      canApproveReconciliation: true,
      canApprovePurchasing: true,
      canAccessPurchasing: true,
      canViewSuppliers: true,
      canAccessInventory: true,
      canViewReturns: true,
      canCreateReturns: true,
      canApproveReturns: true,
      canManageUsers: true,
      canManageSettings: true,
      canManageSystem: true,
    },
    deriveInventoryCapabilities(
      { canManageSystem: true, canAccessInventory: true },
      roleList,
    ),
  );
}

function capabilitiesFromRoleProfile(roleProfileName, roleList = []) {
  const profileCaps = CAPS_BY_ROLE_PROFILE[roleProfileName];
  if (!profileCaps) return null;

  const inventoryLayer =
    profileCaps.canAccessInventory || profileCaps.canInventoryReceipt
      ? {}
      : deriveInventoryCapabilities(
          {
            canManageSystem: false,
            canAccessInventory: Boolean(profileCaps.canAccessInventory),
          },
          roleList,
        );

  return mergeCaps(
    { roleProfileName, ...profileCaps },
    inventoryLayer,
  );
}

function capabilitiesFromErpRoles(roleList = [], roleProfileName = '') {
  const normalized = roleList.map(normalizeRole).filter(Boolean);

  const canManageSystem = roleList.some((r) => ADMIN_ROLES.has(r));
  if (canManageSystem) {
    return administratorCapabilities(roleList, roleProfileName);
  }

  const canOperatePOS = normalized.some((r) => POS_OPERATE_ROLES.has(r));
  const canViewPOS =
    canOperatePOS || normalized.some((r) => POS_VIEW_ROLES.has(r));
  const hasInventoryRole = normalized.some((r) => INVENTORY_ANY_ROLES.has(r));
  const canAccessPurchasing = normalized.some((r) => PURCHASING_ROLES.has(r));
  const canApprovePurchasing = normalized.some((r) => PURCHASING_APPROVE_ROLES.has(r));
  const hasManagerInventoryRole = normalized.some((r) => INVENTORY_MANAGER_ROLES.has(r));

  const roleLabel =
    roleList.find((r) => ADMIN_ROLES.has(r)) ||
    roleList.find((r) => POS_OPERATE_ROLES.has(normalizeRole(r))) ||
    roleList.find((r) => INVENTORY_ANY_ROLES.has(normalizeRole(r))) ||
    roleList.find((r) => PURCHASING_ROLES.has(normalizeRole(r))) ||
    roleProfileName ||
    roleList[0] ||
    '';

  let operationalPersona = 'desk';
  if (canOperatePOS) operationalPersona = 'cashier';
  else if (hasInventoryRole && !canAccessPurchasing) operationalPersona = 'inventory';
  else if (canAccessPurchasing && !hasInventoryRole) operationalPersona = 'purchasing';
  else if (hasManagerInventoryRole || canApprovePurchasing) operationalPersona = 'desk_manager';

  const base = {
    roleLabel,
    roleProfileName,
    operationalPersona,
    canViewPOS,
    canOperatePOS,
    canOpenShift: canOperatePOS,
    canCloseShift: canOperatePOS,
    canApproveShift: false,
    canViewShiftReports: normalized.some((r) => POS_VIEW_ROLES.has(r)),
    canViewInvoices: canViewPOS,
    canAccessPurchasing,
    canApprovePurchasing,
    canViewSuppliers: canAccessPurchasing,
    canAccessInventory: hasInventoryRole,
    canAccessAdminWorkspace: false,
    canViewReports: hasManagerInventoryRole || canApprovePurchasing,
    canViewAnalytics: hasManagerInventoryRole,
    canMonitorCashiers: normalized.some((r) => POS_VIEW_ROLES.has(r)),
    canApproveReturns: hasManagerInventoryRole,
    canApproveReconciliation: hasManagerInventoryRole,
    canViewReturns: hasManagerInventoryRole || canApprovePurchasing,
    canCreateReturns: false,
    canManageUsers: false,
    canManageSettings: false,
    canManageSystem: false,
  };

  return mergeCaps(
    base,
    deriveInventoryCapabilities(
      { canManageSystem: false, canAccessInventory: base.canAccessInventory },
      roleList,
    ),
  );
}

/**
 * @param {string[]} roleList ERP role names
 * @param {string} [roleProfileName]
 * @returns {Capabilities}
 */
export function deriveCapabilities(roleList = [], roleProfileName = '') {
  const profile =
    resolveRoleProfileKey(roleProfileName) || inferProfileFromRoles(roleList);

  // System Manager / Administrator ERP roles override operational role profiles.
  if (roleList.some((r) => ADMIN_ROLES.has(r))) {
    return administratorCapabilities(roleList, profile);
  }

  if (profile && CAPS_BY_ROLE_PROFILE[profile]) {
    return capabilitiesFromRoleProfile(profile, roleList);
  }

  return capabilitiesFromErpRoles(roleList, profile);
}

export function canAccessPurchasing(caps) {
  return Boolean(caps?.canAccessPurchasing);
}

export function homePathFromCapabilities(caps) {
  if (caps.canManageSystem) return '/admin';
  if (caps.canAccessAdminWorkspace) return '/admin';
  if (caps.canOperatePOS) return '/pos';
  if (caps.canAccessPurchasing) return '/admin/purchasing';
  if (caps.canAccessInventory) return '/inventory';
  return '/login';
}

/** @deprecated Fail-closed — do not infer access from usernames or identifiers */
export function homePathFromIdentifier() {
  return '/login';
}

/** @deprecated Fail-closed — path inference disabled */
export function capabilitiesFromInferredPath() {
  return buildCapabilities({ ...EMPTY_INVENTORY_CAPABILITIES });
}

export function hasCapability(caps, capName) {
  return Boolean(caps?.[capName]);
}

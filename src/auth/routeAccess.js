/**
 * Workspace route access — synchronous guards + post-login routing.
 */
import { hasCapability } from './capabilities';
import { buildReportPathRules } from './reportAccess';

/** @typedef {import('./capabilities').Capabilities} Capabilities */

const PUBLIC = ['/login'];

/** Protected workspace roots — unknown paths under these fail closed. */
export const PROTECTED_ROOTS = [
  '/pos',
  '/shifts',
  '/inventory',
  '/hr',
  '/manager',
  '/finance',
  '/purchasing',
  '/admin',
];

/**
 * First matching prefix wins. `anyOf` = user needs at least one capability.
 * Admin subtree requires canManageSystem only (shell-aligned).
 */
export const ROUTE_ACCESS = [
  { prefix: '/pos/returns', anyOf: ['canCreateReturns'] },
  { prefix: '/pos', anyOf: ['canOperatePOS', 'canViewPOS'] },
  { prefix: '/shifts/open', anyOf: ['canOpenShift'] },
  { prefix: '/shifts/close', anyOf: ['canCloseShift'] },
  { prefix: '/shifts/history', anyOf: ['canViewShiftReports', 'canViewOwnShiftHistory'] },
  { prefix: '/shifts', anyOf: ['canOpenShift', 'canCloseShift', 'canViewShiftReports', 'canViewOwnShiftHistory'] },
  { prefix: '/inventory/items/', anyOf: ['canAccessInventory', 'canManageSystem'] },
  { prefix: '/inventory/items', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/reports', anyOf: ['canInventoryManage'] },
  { prefix: '/inventory/batches', anyOf: ['canInventoryManage'] },
  { prefix: '/inventory/analytics', anyOf: ['canInventoryAnalytics'] },
  { prefix: '/inventory/transfer', anyOf: ['canInventoryTransfer', 'canInventoryIssueTransfer'] },
  { prefix: '/inventory/reconciliation', anyOf: ['canInventoryReconcile'] },
  { prefix: '/inventory/warehouses', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/alerts', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/reorder', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/ledger', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory', anyOf: ['canAccessInventory'] },
  { prefix: '/hr/users', anyOf: ['canManageOperationalUsers'] },
  { prefix: '/hr/employees', anyOf: ['canViewEmployees'] },
  { prefix: '/hr/departments', anyOf: ['canAccessHRWorkspace'] },
  { prefix: '/hr/positions', anyOf: ['canAccessHRWorkspace'] },
  { prefix: '/hr', anyOf: ['canAccessHRWorkspace'] },
  { prefix: '/manager/shifts/history', anyOf: ['canViewShiftReports'] },
  { prefix: '/manager/shifts', anyOf: ['canViewShiftReports'] },
  { prefix: '/manager/approvals/history', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/manager/approvals', anyOf: ['canViewApprovalsDashboard'] },
  { prefix: '/manager/pos-profiles', anyOf: ['canManagePOSProfiles', 'canManageSystem'] },
  { prefix: '/manager/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/manager/reports', anyOf: ['canViewReports'] },
  { prefix: '/manager', anyOf: ['canAccessManagerWorkspace'] },
  { prefix: '/finance/ledger', anyOf: ['canViewStockLedgerReadOnly'] },
  { prefix: '/finance/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/finance/shifts/history', anyOf: ['canViewShiftReports'] },
  { prefix: '/finance/shifts', anyOf: ['canViewShiftReports'] },
  { prefix: '/finance/matching', anyOf: ['canAccessInvoiceMatching'] },
  { prefix: '/finance/payments', anyOf: ['canViewSupplierPayments'] },
  { prefix: '/finance/approvals', anyOf: ['canViewApprovalsDashboard'] },
  { prefix: '/finance/invoices', anyOf: ['canViewInvoices'] },
  { prefix: '/finance/reports', anyOf: ['canViewReports'] },
  { prefix: '/finance', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/invoices', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/matching', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/reports', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/purchasing/history', anyOf: ['canViewPurchasingHistory', 'canManageSystem'] },
  { prefix: '/purchasing/receive', anyOf: ['canAccessPurchasing'] },
  { prefix: '/purchasing/suppliers', anyOf: ['canAccessPurchasing'] },
  { prefix: '/purchasing', anyOf: ['canAccessPurchasing'] },
  { prefix: '/admin/purchasing/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/matching', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/reports', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/approvals', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/receive', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting/matching', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting/payments', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting', anyOf: ['canManageSystem'] },
  { prefix: '/admin/approvals/history', anyOf: ['canManageSystem'] },
  { prefix: '/admin/approvals', anyOf: ['canManageSystem'] },
  { prefix: '/admin/pos-profiles', anyOf: ['canManagePOSProfiles', 'canManageSystem'] },
  { prefix: '/admin/products', anyOf: ['canManageSystem'] },
  { prefix: '/admin/users', anyOf: ['canManageSystem'] },
  { prefix: '/admin/settings', anyOf: ['canManageSettings', 'canManageSystem'] },
  { prefix: '/admin/warehouses', anyOf: ['canManageSystem'] },
  { prefix: '/admin/inventory', anyOf: ['canAccessInventory'] },
  { prefix: '/admin/invoices', anyOf: ['canViewInvoices'] },
  { prefix: '/admin/returns', anyOf: ['canViewReturns'] },
  { prefix: '/admin/shifts', anyOf: ['canViewShiftReports', 'canViewOwnShiftHistory'] },
  { prefix: '/admin/reports', anyOf: ['canManageSystem'] },
  { prefix: '/admin/customers', anyOf: ['canManageSystem'] },
  { prefix: '/admin/activity', anyOf: ['canManageSystem'] },
  { prefix: '/admin', anyOf: ['canManageSystem'] },
];

/**
 * Per-report rules from reportAccess.js are merged in lazily so the
 * module-init order doesn't matter: routeAccess and reportAccess are part
 * of a circular import chain (capabilities.js re-exports resolveHomePath
 * from here), and computing the merged list at top-level would trigger a
 * TDZ on REPORT_WORKSPACE_BASES. The first call to `resolveRouteRule()`
 * happens at navigation time — both modules are fully initialized by then.
 */
let _mergedRoutes = null;
function getMergedRouteAccess() {
  if (_mergedRoutes) return _mergedRoutes;
  // Per-report rules first — more specific than `/<workspace>/reports`.
  _mergedRoutes = [...buildReportPathRules(), ...ROUTE_ACCESS];
  return _mergedRoutes;
}

export function isProtectedPath(pathname) {
  if (!pathname) return false;
  return PROTECTED_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function resolveRouteRule(pathname) {
  if (!pathname) return null;
  return getMergedRouteAccess().find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  ) || null;
}

export function canAccessPath(pathname, caps) {
  if (!pathname || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  const rule = resolveRouteRule(pathname);
  if (!rule) {
    return !isProtectedPath(pathname);
  }

  return rule.anyOf.some((cap) => hasCapability(caps, cap));
}

export function resolveHomePath(caps) {
  if (hasCapability(caps, 'canManageSystem')) return '/admin';
  if (caps.operationalPersona === 'hr' && hasCapability(caps, 'canAccessHRWorkspace')) return '/hr';
  if (caps.operationalPersona === 'store_manager' && hasCapability(caps, 'canAccessManagerWorkspace')) {
    return '/manager';
  }
  if (caps.operationalPersona === 'accountant' && hasCapability(caps, 'canAccessAccountantWorkspace')) {
    return '/finance';
  }
  if (hasCapability(caps, 'canOperatePOS')) return '/pos';
  if (caps.operationalPersona === 'purchasing' && hasCapability(caps, 'canAccessPurchasing')) {
    return '/purchasing';
  }
  if (hasCapability(caps, 'canAccessPurchasing')) return '/purchasing';
  if (hasCapability(caps, 'canAccessInventory')) return '/inventory';
  return '/login';
}

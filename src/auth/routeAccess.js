/**
 * Workspace route access — synchronous guards + post-login routing.
 */
import { hasCapability } from './capabilities';

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
  { prefix: '/inventory/items', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/reports', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/batches', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/analytics', anyOf: ['canInventoryAnalytics', 'canManageSystem'] },
  { prefix: '/inventory/transfer', anyOf: ['canInventoryTransfer', 'canInventoryIssueTransfer'] },
  { prefix: '/inventory/reconciliation', anyOf: ['canInventoryReconcile', 'canManageSystem'] },
  { prefix: '/inventory/stock-entry', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/warehouses', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/alerts', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/reorder', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory/ledger', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory', anyOf: ['canAccessInventory'] },
  { prefix: '/hr/users', anyOf: ['canManageOperationalUsers'] },
  { prefix: '/hr', anyOf: ['canAccessHRWorkspace'] },
  { prefix: '/manager/shifts/history', anyOf: ['canViewShiftReports'] },
  { prefix: '/manager/shifts', anyOf: ['canViewShiftReports'] },
  { prefix: '/manager/approvals', anyOf: ['canViewApprovalsDashboard'] },
  { prefix: '/manager/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/manager/reports', anyOf: ['canViewReports'] },
  { prefix: '/manager', anyOf: ['canAccessManagerWorkspace'] },
  { prefix: '/finance/ledger', anyOf: ['canViewStockLedgerReadOnly', 'canManageSystem'] },
  { prefix: '/finance/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/finance/shifts/history', anyOf: ['canViewShiftReports'] },
  { prefix: '/finance/shifts', anyOf: ['canViewShiftReports'] },
  { prefix: '/finance/matching', anyOf: ['canAccessInvoiceMatching'] },
  { prefix: '/finance/payments', anyOf: ['canViewSupplierPayments'] },
  { prefix: '/finance/approvals', anyOf: ['canViewApprovalsDashboard'] },
  { prefix: '/finance/invoices', anyOf: ['canViewInvoices'] },
  { prefix: '/finance/reports', anyOf: ['canViewReports'] },
  { prefix: '/finance', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/matching', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/reports', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/approvals', anyOf: ['canViewPurchaseApprovals', 'canManageSystem'] },
  { prefix: '/purchasing/receive', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/purchasing/suppliers', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/purchasing', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/admin/purchasing/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/matching', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/reports', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/approvals', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing/receive', anyOf: ['canManageSystem'] },
  { prefix: '/admin/purchasing', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting/matching', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting/payments', anyOf: ['canManageSystem'] },
  { prefix: '/admin/accounting', anyOf: ['canManageSystem'] },
  { prefix: '/admin/approvals', anyOf: ['canManageSystem'] },
  { prefix: '/admin/products', anyOf: ['canManageSystem'] },
  { prefix: '/admin/users', anyOf: ['canManageSystem'] },
  { prefix: '/admin/settings', anyOf: ['canManageSettings', 'canManageSystem'] },
  { prefix: '/admin/warehouses', anyOf: ['canManageSystem'] },
  { prefix: '/admin/returns', anyOf: ['canManageSystem'] },
  { prefix: '/admin/shifts', anyOf: ['canManageSystem'] },
  { prefix: '/admin/inventory', anyOf: ['canManageSystem'] },
  { prefix: '/admin/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/admin/reports', anyOf: ['canManageSystem'] },
  { prefix: '/admin/customers', anyOf: ['canManageSystem'] },
  { prefix: '/admin/activity', anyOf: ['canManageSystem'] },
  { prefix: '/admin', anyOf: ['canManageSystem'] },
];

export function isProtectedPath(pathname) {
  if (!pathname) return false;
  return PROTECTED_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function resolveRouteRule(pathname) {
  if (!pathname) return null;
  return ROUTE_ACCESS.find(
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

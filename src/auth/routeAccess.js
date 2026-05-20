/**
 * Workspace route access — used for post-login routing and stale-session guards.
 */
import { hasCapability } from './capabilities';

/** @typedef {import('./capabilities').Capabilities} Capabilities */

const PUBLIC = ['/login'];

/**
 * First matching prefix wins. `anyOf` = user needs at least one capability.
 */
export const ROUTE_ACCESS = [
  { prefix: '/pos', anyOf: ['canOperatePOS'] },
  { prefix: '/shifts/open', anyOf: ['canOpenShift'] },
  { prefix: '/shifts/close', anyOf: ['canCloseShift'] },
  { prefix: '/shifts', anyOf: ['canOpenShift', 'canCloseShift', 'canViewShiftReports'] },
  { prefix: '/inventory/transfer', anyOf: ['canInventoryTransfer', 'canInventoryIssueTransfer'] },
  { prefix: '/inventory/reconciliation', anyOf: ['canInventoryReconcile'] },
  { prefix: '/inventory', anyOf: ['canAccessInventory'] },
  { prefix: '/admin/purchasing/approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/admin/purchasing/receive', anyOf: ['canAccessPurchasing'] },
  { prefix: '/admin/purchasing', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/admin/approvals', anyOf: ['canViewApprovalsDashboard'] },
  { prefix: '/admin/accounting/matching', anyOf: ['canAccessInvoiceMatching', 'canManageSystem'] },
  { prefix: '/admin/accounting/payments', anyOf: ['canViewSupplierPayments', 'canManageSystem'] },
  { prefix: '/admin/accounting', anyOf: ['canAccessAccountantWorkspace', 'canManageSystem'] },
  { prefix: '/admin/products', anyOf: ['canManageSystem'] },
  { prefix: '/admin/users', anyOf: ['canManageUsers'] },
  { prefix: '/admin/settings', anyOf: ['canManageSettings', 'canManageSystem'] },
  { prefix: '/admin/warehouses', anyOf: ['canManageSystem'] },
  { prefix: '/admin/shifts', anyOf: ['canViewShiftReports'] },
  { prefix: '/admin', anyOf: ['canAccessAdminWorkspace', 'canManageSystem'] },
];

export function canAccessPath(pathname, caps) {
  if (!pathname || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  const rule = ROUTE_ACCESS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return true;
  return rule.anyOf.some((cap) => hasCapability(caps, cap));
}

export function resolveHomePath(caps) {
  if (hasCapability(caps, 'canManageSystem')) return '/admin';
  if (caps.operationalPersona === 'accountant' && hasCapability(caps, 'canAccessAccountantWorkspace')) {
    return '/admin/accounting';
  }
  if (caps.operationalPersona === 'store_manager' && hasCapability(caps, 'canAccessAdminWorkspace')) {
    return '/admin';
  }
  if (hasCapability(caps, 'canOperatePOS')) return '/pos';
  if (caps.operationalPersona === 'purchasing' && hasCapability(caps, 'canAccessPurchasing')) {
    return '/admin/purchasing';
  }
  if (hasCapability(caps, 'canAccessPurchasing') && !hasCapability(caps, 'canAccessAdminWorkspace')) {
    return '/admin/purchasing';
  }
  if (hasCapability(caps, 'canAccessInventory')) return '/inventory';
  if (hasCapability(caps, 'canAccessAdminWorkspace')) return '/admin';
  return '/login';
}

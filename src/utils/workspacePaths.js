import { hasCapability } from '../auth/capabilities';
import { resolveNavPersona } from '../auth/navigationConfig';

/** Canonical finance workspace base. */
export function financePath(segment = '') {
  const base = '/finance';
  if (!segment) return base;
  return `${base}/${segment.replace(/^\//, '')}`;
}

/** Canonical purchasing workspace base. */
export function purchasingPath(segment = '') {
  const base = '/purchasing';
  if (!segment) return base;
  return `${base}/${segment.replace(/^\//, '')}`;
}

/**
 * Workspace-aware supplier path — picks `/manager/suppliers/...` when the
 * caller is currently inside the Store Manager workspace, otherwise falls
 * back to `/purchasing/suppliers/...`. Pass the current location pathname
 * (typically `useLocation().pathname` from React Router).
 */
export function suppliersPath(pathname = '', segment = '') {
  const base = pathname && pathname.startsWith('/manager')
    ? '/manager/suppliers'
    : '/purchasing/suppliers';
  if (!segment) return base;
  return `${base}/${segment.replace(/^\//, '')}`;
}

/** Invoice matching — finance workspace. */
export function invoiceMatchingPath(caps) {
  if (hasCapability(caps, 'canAccessInvoiceMatching')) {
    return financePath('matching');
  }
  return financePath('matching');
}

/** Supplier payments — finance workspace. */
export function supplierPaymentsPath(caps) {
  if (hasCapability(caps, 'canViewSupplierPayments')) {
    return financePath('payments');
  }
  return financePath('payments');
}

/** Shift history — persona-specific monitor route. */
export function shiftHistoryPath(caps) {
  const persona = resolveNavPersona(caps);
  if (persona === 'store_manager') return '/manager/shifts/history';
  if (persona === 'accountant') return financePath('shifts/history');
  if (persona === 'administrator') return '/admin/approvals';
  return '/shifts/history';
}

/** Purchase rate approvals — manager vs finance vs admin. */
export function purchaseApprovalsPath(caps) {
  const persona = resolveNavPersona(caps);
  if (persona === 'store_manager') return '/manager/purchase-approvals';
  if (persona === 'accountant') return financePath('approvals');
  if (persona === 'administrator') return '/admin/approvals';
  if (hasCapability(caps, 'canViewPurchaseApprovals')) return '/manager/purchase-approvals';
  return financePath('approvals');
}

/** Approvals hub — manager vs finance vs admin. */
export function approvalsHubPath(caps) {
  const persona = resolveNavPersona(caps);
  if (persona === 'store_manager') return '/manager/approvals';
  if (persona === 'accountant') return financePath('approvals');
  return '/admin/approvals';
}

import { hasCapability } from '../auth/capabilities';

/** Invoice matching — finance workspace (accountant / manager / admin). */
export function invoiceMatchingPath(caps) {
  if (hasCapability(caps, 'canAccessInvoiceMatching')) {
    return '/admin/accounting/matching';
  }
  if (hasCapability(caps, 'canAccessAccountantWorkspace')) {
    return '/admin/accounting/matching';
  }
  return '/admin/accounting/matching';
}

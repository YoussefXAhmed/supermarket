import { hasCapability } from '../auth/capabilities';

/** Invoice matching — purchasing or finance workspace. */
export function invoiceMatchingPath(caps) {
  if (hasCapability(caps, 'canAccessPurchasing')) {
    return '/admin/purchasing/matching';
  }
  if (hasCapability(caps, 'canAccessAccountantWorkspace')) {
    return '/admin/accounting/matching';
  }
  return '/admin/purchasing/matching';
}

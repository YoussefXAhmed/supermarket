/**
 * Billing status display engine — maps server-computed statuses only.
 * ERPNext (per_billed + PI links) is source of truth; do not derive amounts here.
 */

export const BILLING_STATUS = {
  UNBILLED: 'unbilled',
  PARTIALLY_BILLED: 'partially_billed',
  FULLY_BILLED: 'fully_billed',
  OVERBILLED: 'overbilled',
  VARIANCE_DETECTED: 'variance_detected',
};

const LABELS = {
  [BILLING_STATUS.UNBILLED]: 'Unbilled',
  [BILLING_STATUS.PARTIALLY_BILLED]: 'Partially billed',
  [BILLING_STATUS.FULLY_BILLED]: 'Fully billed',
  [BILLING_STATUS.OVERBILLED]: 'Overbilled',
  [BILLING_STATUS.VARIANCE_DETECTED]: 'Variance detected',
};

const TONES = {
  [BILLING_STATUS.UNBILLED]: 'billing-pill--unbilled',
  [BILLING_STATUS.PARTIALLY_BILLED]: 'billing-pill--partial',
  [BILLING_STATUS.FULLY_BILLED]: 'billing-pill--billed',
  [BILLING_STATUS.OVERBILLED]: 'billing-pill--over',
  [BILLING_STATUS.VARIANCE_DETECTED]: 'billing-pill--variance',
};

/** Normalize legacy ERP / SPA labels to canonical status keys. */
export function normalizeBillingStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (Object.values(BILLING_STATUS).includes(s)) return s;
  if (s === 'billed' || s === 'fully_billed') return BILLING_STATUS.FULLY_BILLED;
  if (s === 'partly_billed' || s === 'partial') return BILLING_STATUS.PARTIALLY_BILLED;
  if (s === 'not_billed' || s === 'to_bill') return BILLING_STATUS.UNBILLED;
  return BILLING_STATUS.UNBILLED;
}

export function billingStatusLabel(status) {
  const key = normalizeBillingStatus(status);
  return LABELS[key] || LABELS[BILLING_STATUS.UNBILLED];
}

export function billingStatusTone(status) {
  const key = normalizeBillingStatus(status);
  return TONES[key] || TONES[BILLING_STATUS.UNBILLED];
}

export function canLinkReceipt(row) {
  if (!row) return false;
  if (row.can_link === false) return false;
  const status = normalizeBillingStatus(row.billing_status);
  if (status === BILLING_STATUS.FULLY_BILLED || status === BILLING_STATUS.OVERBILLED) {
    return false;
  }
  return Boolean(row.can_link ?? true);
}

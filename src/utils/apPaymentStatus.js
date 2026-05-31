/**
 * AP payment status display — maps ERP-computed keys only (no balance math).
 */

export const PAY_STATUS = {
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  DRAFT: 'draft',
};

const LABELS = {
  [PAY_STATUS.UNPAID]: 'Unpaid',
  [PAY_STATUS.PARTIALLY_PAID]: 'Partially paid',
  [PAY_STATUS.PAID]: 'Paid',
  [PAY_STATUS.OVERDUE]: 'Overdue',
  [PAY_STATUS.CANCELLED]: 'Cancelled',
  [PAY_STATUS.DRAFT]: 'Draft',
};

/** Generic Pill tones — keys consumed by the shared <Pill> primitive. */
const TONES = {
  [PAY_STATUS.UNPAID]: 'warning',
  [PAY_STATUS.PARTIALLY_PAID]: 'info',
  [PAY_STATUS.PAID]: 'success',
  [PAY_STATUS.OVERDUE]: 'danger',
  [PAY_STATUS.CANCELLED]: 'default',
  [PAY_STATUS.DRAFT]: 'draft',
};

export function normalizePayStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (Object.values(PAY_STATUS).includes(s)) return s;
  if (s === 'partly_paid') return PAY_STATUS.PARTIALLY_PAID;
  return PAY_STATUS.UNPAID;
}

export function payStatusLabel(status) {
  return LABELS[normalizePayStatus(status)] || LABELS[PAY_STATUS.UNPAID];
}

export function payStatusTone(status) {
  return TONES[normalizePayStatus(status)] || TONES[PAY_STATUS.UNPAID];
}

export const AP_STAGE_LABELS = {
  invoice_pending: 'Payable pending',
  payment_pending: 'Payment pending',
  partially_paid: 'Partially paid',
  settled: 'Settled',
};

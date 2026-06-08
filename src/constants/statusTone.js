/**
 * Centralised status → tone map.
 *
 * Phase 1 audit found this map redefined in 4+ HR/Payroll/Leave/Payslip
 * files with subtle divergences. This module is the single source of
 * truth. Every consumer should import from here and pass the result to
 * <Pill tone={...}> (or, for legacy code, <Badge color={...}>).
 *
 * Tones map to the Pill component's class set:
 *   default | draft | pending | warning | approved | success | rejected
 *   | danger | submitted | info
 *
 * If a new status type is added, add it here ONCE and every consumer
 * picks it up automatically.
 */

// Generic domain-agnostic statuses (Draft / Submitted / Cancelled / Paid)
const GENERIC = {
  Draft:      'draft',
  Pending:    'pending',
  Submitted:  'submitted',
  Approved:   'approved',
  Paid:       'approved',
  Confirmed:  'approved',
  Rejected:   'rejected',
  Cancelled:  'danger',
  Failed:     'danger',
  Closed:     'default',
  Open:       'warning',
  Overdue:    'danger',
};

// Attendance — Present / Absent / Late / Half-Day / On Leave
const ATTENDANCE = {
  Present:    'approved',
  Absent:     'rejected',
  Late:       'warning',
  'Half Day': 'info',
  'On Leave': 'pending',
};

// Leave Application — Open / Approved / Rejected (plus carry-over)
const LEAVE = {
  Open:       'warning',
  Approved:   'approved',
  Rejected:   'rejected',
  Cancelled:  'danger',
};

// Salary Slip — Draft / Submitted / Paid / Cancelled
const PAYROLL = {
  Draft:      'draft',
  Submitted:  'pending',
  Paid:       'approved',
  Cancelled:  'danger',
};

// Payment status (Purchase Invoice, AP)
const PAYMENT = {
  Unpaid:     'warning',
  Partial:    'info',
  Paid:       'approved',
  Overdue:    'danger',
};

// AP lifecycle stages (Receipt Matching) — Phase 3.5.a folded the former
// ap-lifecycle-pill into the canonical Pill system per decision D6.
const AP_LIFECYCLE = {
  invoice_pending: 'warning',
  payment_pending: 'warning',
  partially_paid:  'partially_paid',
  settled:         'approved',
};

/**
 * The unified status → tone map. Merged left-to-right (more specific
 * later) so domain-specific overrides win.
 */
export const STATUS_TONE = {
  ...GENERIC,
  ...ATTENDANCE,
  ...LEAVE,
  ...PAYROLL,
  ...PAYMENT,
  ...AP_LIFECYCLE,
};

/**
 * Look up a tone for a status string. Falls back to `default`.
 * @param {string} status
 * @returns {'default'|'draft'|'pending'|'warning'|'approved'|'success'|'rejected'|'danger'|'submitted'|'info'}
 */
export function statusToTone(status) {
  if (!status) return 'default';
  return STATUS_TONE[status] || 'default';
}

/**
 * Legacy Badge color mapping. Some pages still use the older
 * <Badge color="..."> API. This translates a Pill tone to the closest
 * Badge color so the migration to <Pill> can happen incrementally.
 */
const TONE_TO_BADGE_COLOR = {
  default:   'default',
  draft:     'default',
  pending:   'amber',
  warning:   'amber',
  approved:  'green',
  success:   'green',
  rejected:  'red',
  danger:    'red',
  submitted: 'blue',
  info:      'blue',
};

/**
 * Look up a Badge color (legacy API) for a status string.
 * @param {string} status
 * @returns {'default'|'green'|'red'|'blue'|'amber'}
 */
export function statusToBadgeColor(status) {
  return TONE_TO_BADGE_COLOR[statusToTone(status)] || 'default';
}

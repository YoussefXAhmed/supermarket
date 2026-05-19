/**
 * Shift workflow validation — fail before ERP mutations.
 */
import { calculateVariance } from './shiftCalculations';

export class ShiftValidationError extends Error {
  constructor(message, code = 'validation') {
    super(message);
    this.name = 'ShiftValidationError';
    this.code = code;
  }
}

export function validateOpenShift({
  openingAmount,
  posProfile,
  company,
  activeOpening,
  canOpen,
}) {
  if (!canOpen) {
    throw new ShiftValidationError('You do not have permission to open a shift.', 'forbidden');
  }
  if (!posProfile || !company) {
    throw new ShiftValidationError('POS profile and company are required.', 'profile');
  }
  const amount = Number(openingAmount);
  if (Number.isNaN(amount) || amount < 0) {
    throw new ShiftValidationError('Opening cash cannot be negative.', 'opening_amount');
  }
  if (activeOpening?.name) {
    throw new ShiftValidationError(
      `An active shift is already open (${activeOpening.name}). Close it before opening a new one.`,
      'active_shift',
    );
  }
}

export function validateCloseShift({
  openingEntry,
  actualCash,
  canClose,
  summary,
}) {
  if (!canClose) {
    throw new ShiftValidationError('You do not have permission to close this shift.', 'forbidden');
  }
  if (!openingEntry?.name) {
    throw new ShiftValidationError('No open shift to close.', 'no_shift');
  }
  if (openingEntry.status && openingEntry.status !== 'Open') {
    throw new ShiftValidationError('This shift is not open.', 'not_open');
  }
  if (actualCash === '' || actualCash == null || Number.isNaN(Number(actualCash))) {
    throw new ShiftValidationError('Enter the counted cash amount before closing.', 'actual_cash');
  }
  const counted = Number(actualCash);
  if (counted < 0) {
    throw new ShiftValidationError('Counted cash cannot be negative.', 'actual_cash');
  }
  if (!summary) {
    throw new ShiftValidationError('Shift summary could not be loaded.', 'summary');
  }
}

/**
 * Manager may submit any draft POS Closing Entry (variance review or cashier draft).
 */
export function validateManagerShiftSubmit({
  closingEntry,
  approver,
  opener,
  canApprove,
}) {
  if (!canApprove) {
    throw new ShiftValidationError('You do not have permission to approve shift closings.', 'forbidden');
  }
  if (!closingEntry?.name) {
    throw new ShiftValidationError('Closing entry not found.', 'not_found');
  }
  if (closingEntry.docstatus === 1) {
    throw new ShiftValidationError('This closing is already submitted.', 'already_submitted');
  }
  if (closingEntry.docstatus === 2) {
    throw new ShiftValidationError('This closing was cancelled.', 'cancelled');
  }
  if (approver && opener && String(approver) === String(opener)) {
    throw new ShiftValidationError('You cannot approve your own shift closing.', 'self_approval');
  }
}

/** @deprecated Use validateManagerShiftSubmit — kept for variance-only callers */
export function validateShiftApproval({
  closingEntry,
  approver,
  opener,
  canApprove,
  varianceSeverity,
}) {
  validateManagerShiftSubmit({ closingEntry, approver, opener, canApprove });
  if (varianceSeverity !== 'approval_required') {
    throw new ShiftValidationError('Manager approval is not required for this variance.', 'no_approval_needed');
  }
}

export function validateRefundAgainstShift({ invoice, openingEntry, summary }) {
  if (!openingEntry?.name) return;
  if (!invoice?.posting_date || !openingEntry.period_start_date) return;

  const invDate = String(invoice.posting_date).slice(0, 10);
  const openDate = String(openingEntry.period_start_date).slice(0, 10);
  if (invDate < openDate) {
    throw new ShiftValidationError(
      'This invoice is from before the current shift period.',
      'orphan_refund',
    );
  }
  if (invoice.pos_profile && openingEntry.pos_profile && invoice.pos_profile !== openingEntry.pos_profile) {
    throw new ShiftValidationError('Invoice POS profile does not match the active shift.', 'profile_mismatch');
  }
  if (summary?.closingEntryName) {
    throw new ShiftValidationError('Cannot process refunds after shift close has been initiated.', 'shift_closing');
  }
}

export function classifyCloseResult({ expectedCash, actualCash }) {
  return calculateVariance(expectedCash, actualCash);
}

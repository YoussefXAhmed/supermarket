/**
 * ERP Label Mapper — centralized doctype/status i18n translation helper.
 *
 * USAGE: Always call erpLabel(doctypeOrStatus, t) for user-facing ERP doc names.
 *
 * Rules:
 * - Returns translated display label for known doctypes and statuses.
 * - Returns the raw value unchanged for unknown or ID-like strings.
 * - Never modifies backend values — display only.
 */

/**
 * Map of ERP doctype names (canonical English) → i18n key.
 * Keys are in the erp.* namespace in translation.json.
 */
export const ERP_DOCTYPE_KEY_MAP = {
  'Purchase Receipt': 'erp.purchaseReceipt',
  'Purchase Invoice': 'erp.purchaseInvoice',
  'Payment Entry': 'erp.paymentEntry',
  'Sales Invoice': 'erp.salesInvoice',
  'POS Invoice': 'erp.posInvoice',
  'Stock Entry': 'erp.stockEntry',
  'Stock Ledger Entry': 'erp.stockLedgerEntry',
  'POS Opening Entry': 'erp.posOpeningEntry',
  'POS Closing Entry': 'erp.posClosingEntry',
  'Stock Reconciliation': 'erp.stockReconciliation',
  'Purchase Order': 'erp.purchaseOrder',
  'Supplier': 'erp.supplier',
  'Customer': 'erp.customer',
  'Warehouse': 'erp.warehouse',
  'Item': 'erp.item',
  'Price List': 'erp.priceList',
  'POS Profile': 'erp.posProfile',
  'Company': 'erp.company',
  'Journal Entry': 'erp.journalEntry',
  'Payment Term': 'erp.paymentTerm',
  'Batch': 'erp.batch',
};

/**
 * Map of ERP status strings → i18n key.
 * Covers docstatus + named status fields from ERPNext.
 */
export const ERP_STATUS_KEY_MAP = {
  'submitted': 'erp.status.submitted',
  'draft': 'erp.status.draft',
  'cancelled': 'erp.status.cancelled',
  'approved': 'erp.status.approved',
  'rejected': 'erp.status.rejected',
  'pending': 'erp.status.pending',
  'paid': 'erp.status.paid',
  'unpaid': 'erp.status.unpaid',
  'overdue': 'erp.status.overdue',
  'partial': 'erp.status.partial',
  'partially_paid': 'erp.status.partiallyPaid',
  'open': 'erp.status.open',
  'closed': 'erp.status.closed',
  'billed': 'erp.status.billed',
  'unbilled': 'erp.status.unbilled',
  'fully_billed': 'erp.status.fullyBilled',
  'partially_billed': 'erp.status.partiallyBilled',
  'overbilled': 'erp.status.overbilled',
  'variance_detected': 'erp.status.varianceDetected',
  'enabled': 'erp.status.enabled',
  'disabled': 'erp.status.disabled',
  'active': 'erp.status.active',
  'pending_manager': 'erp.status.pendingManager',
  'pending_accountant': 'erp.status.pendingAccountant',
  'pending_approval': 'erp.status.pendingApproval',
  'invoice_pending': 'erp.status.invoicePending',
  'payment_pending': 'erp.status.paymentPending',
  'settled': 'erp.status.settled',
};

/**
 * Translate an ERP doctype name to a display string.
 * Falls back to the original name if no mapping exists.
 *
 * @param {string} doctype - Canonical ERP doctype name
 * @param {Function} t - i18next t function
 * @returns {string}
 */
export function erpDocLabel(doctype, t) {
  const key = ERP_DOCTYPE_KEY_MAP[doctype];
  if (key && t) return t(key);
  return doctype || '';
}

/**
 * Translate an ERP status string to a display string.
 * Normalizes case/underscores before lookup.
 * Falls back to the original if no mapping exists.
 *
 * @param {string} status - Raw ERP status string
 * @param {Function} t - i18next t function
 * @returns {string}
 */
export function erpStatusLabel(status, t) {
  if (!status) return '';
  const normalized = String(status).trim().toLowerCase().replace(/\s+/g, '_');
  const key = ERP_STATUS_KEY_MAP[normalized];
  if (key && t) return t(key);
  return status;
}

/**
 * Translate an AP lifecycle stage label.
 * @param {string} stage - e.g. 'invoice_pending', 'payment_pending'
 * @param {Function} t - i18next t function
 * @returns {string}
 */
export function erpApStageLabel(stage, t) {
  const key = ERP_STATUS_KEY_MAP[stage];
  if (key && t) return t(key);
  return stage || '';
}

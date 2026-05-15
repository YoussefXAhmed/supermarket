import { extractERPError } from '../utils/errorHandling';

/** Header fields permitted on Purchase Receipt list queries (ERPNext REST). */
export const PURCHASE_RECEIPT_LIST_FIELDS = [
  'name',
  'supplier',
  'posting_date',
  'grand_total',
  'status',
  'docstatus',
  'set_warehouse',
  'per_billed',
];

/** Child-table fields linking Purchase Invoice → Purchase Receipt. */
export const PURCHASE_INVOICE_ITEM_LINK_FIELDS = ['parent', 'purchase_receipt'];

export function isFieldPermitError(error) {
  const msg = extractERPError(error).message || '';
  return /not permitted in query/i.test(msg) || /Field not permitted/i.test(msg);
}

/**
 * Run a list API call; on failure return empty data + warning (never throw).
 */
export async function safeResourceList(fetchFn, label, warnings = []) {
  try {
    const res = await fetchFn();
    return { data: res?.data?.data || [], error: null };
  } catch (e) {
    const message = extractERPError(e).message;
    warnings.push(`${label}: ${message}`);
    return { data: [], error: message };
  }
}

export function buildReceiptToInvoicesMap(piItemRows) {
  const map = new Map();
  for (const row of piItemRows || []) {
    const receipt = row.purchase_receipt;
    const invoice = row.parent;
    if (!receipt || !invoice) continue;
    if (!map.has(receipt)) map.set(receipt, new Set());
    map.get(receipt).add(invoice);
  }
  return map;
}

export function isReceiptFullyBilled(perBilled) {
  const n = Number(perBilled);
  return Number.isFinite(n) && n >= 99.99;
}

export function billingStatusLabel(perBilled) {
  const n = Number(perBilled) || 0;
  if (n >= 99.99) return 'Billed';
  if (n > 0) return 'Partly billed';
  return 'To bill';
}

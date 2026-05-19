import api from './api';
import { logActivity, ActivityType } from './activityLogService';

const BASE = '/api/method/elmahdi.api.invoice_matching';

async function callGet(method, params = {}) {
  const res = await api.get(`${BASE}.${method}`, { params });
  return res?.data?.message;
}

async function callPost(method, body = {}) {
  const res = await api.post(`${BASE}.${method}`, body);
  return res?.data?.message;
}

/** Full line-level workspace rows from ERP. */
export async function fetchInvoiceMatchingWorkspace(limit = 150) {
  return callGet('get_invoice_matching_workspace', { limit });
}

/** Summary rows (legacy shape, server-computed). */
export async function fetchInvoiceMatchingSummary(limit = 150) {
  return callGet('get_invoice_matching_rows', { limit });
}

export async function fetchReceiptMatchingDetail(receiptName) {
  return callGet('get_receipt_matching_detail', { receipt_name: receiptName });
}

/** Draft invoices: same supplier + company as receipt. */
export async function searchMatchableDraftInvoices(receiptName, { search = '', limit = 25 } = {}) {
  return callGet('list_matchable_draft_invoices', {
    receipt_name: receiptName,
    search: search || undefined,
    limit,
  });
}

export async function fetchSuggestedInvoices(receiptName, limit = 5) {
  return callGet('suggest_invoice_matches', { receipt_name: receiptName, limit });
}

/**
 * Link receipt lines to draft invoice (server validates everything).
 * @param {string} receiptName
 * @param {string} invoiceName
 * @param {{ pr_detail: string, qty: number }[]|null} lines — null = bill all remaining
 */
export async function linkReceiptToInvoice(receiptName, invoiceName, lines = null) {
  const payload = {
    receipt_name: receiptName,
    invoice_name: invoiceName,
  };
  if (lines && lines.length) {
    payload.lines = JSON.stringify(lines);
  }
  const result = await callPost('link_receipt_to_invoice', payload);
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Invoice matching link',
    detail: {
      receipt: receiptName,
      invoice: invoiceName,
      lines: result?.linked_lines?.length ?? 0,
    },
  });
  return result;
}

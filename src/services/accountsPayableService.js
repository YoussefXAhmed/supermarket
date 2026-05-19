import api from './api';
import { logActivity, ActivityType } from './activityLogService';

const BASE = '/api/method/elmahdi.api.accounts_payable';

async function callGet(method, params = {}) {
  const res = await api.get(`${BASE}.${method}`, { params });
  return res?.data?.message;
}

async function callPost(method, body = {}) {
  const res = await api.post(`${BASE}.${method}`, body);
  return res?.data?.message;
}

export function fetchApDashboard(params = {}) {
  return callGet('get_ap_dashboard', params);
}

export function listApInvoices(params = {}) {
  return callGet('list_ap_invoices', params);
}

export function fetchApInvoiceDetail(invoiceName) {
  return callGet('get_ap_invoice_detail', { invoice_name: invoiceName });
}

export function fetchSupplierApSummary(supplier, company) {
  return callGet('get_supplier_ap_summary', { supplier, company: company || undefined });
}

export function listPaymentAccounts(company, accountType) {
  return callGet('list_payment_accounts', {
    company: company || undefined,
    account_type: accountType || undefined,
  });
}

export function listSupplierPaymentHistory(params = {}) {
  return callGet('list_supplier_payment_history', params);
}

/**
 * Create and submit ERPNext Payment Entry.
 * @param {{ supplier, company?, paid_from, posting_date?, reference_no?, remarks?, allocations: {invoice, amount}[] }} payload
 */
export async function createSupplierPayment(payload) {
  const result = await callPost('create_supplier_payment', {
    supplier: payload.supplier,
    company: payload.company || undefined,
    paid_from: payload.paid_from,
    posting_date: payload.posting_date || new Date().toISOString().slice(0, 10),
    reference_no: payload.reference_no || undefined,
    remarks: payload.remarks || undefined,
    allocations: JSON.stringify(payload.allocations || []),
    submit: 1,
  });
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Supplier payment submitted',
    detail: {
      payment_entry: result?.name,
      supplier: payload.supplier,
      amount: result?.paid_amount,
    },
  });
  return result;
}

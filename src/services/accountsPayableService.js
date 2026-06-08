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

export function fetchGeneralLedger(params = {}) {
  return callGet('get_general_ledger', {
    from_date: params.fromDate || undefined,
    to_date: params.toDate || undefined,
    account: params.account || undefined,
    branch: params.branch || undefined,
    company: params.company || undefined,
    limit: params.limit || 500,
  });
}

export function fetchApAgingBySupplier(params = {}) {
  return callGet('get_ap_aging_by_supplier', {
    company: params.company || undefined,
    supplier: params.supplier || undefined,
  });
}

export function fetchTopSuppliersReport(params = {}) {
  return callGet('get_top_suppliers_report', {
    company: params.company || undefined,
    from_date: params.fromDate || undefined,
    to_date: params.toDate || undefined,
    limit: params.limit || 50,
  });
}

export function fetchPaymentVoucher(paymentEntryName) {
  return callGet('get_payment_voucher_detail', { payment_entry_name: paymentEntryName });
}

export function listModesOfPayment() {
  return callGet('list_modes_of_payment');
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
 * @param {{ supplier, company?, paid_from, posting_date?, reference_no?, reference_date?, remarks?, allocations: {invoice, amount}[] }} payload
 */
export async function createSupplierPayment(payload) {
  const result = await callPost('create_supplier_payment', {
    supplier: payload.supplier,
    company: payload.company || undefined,
    paid_from: payload.paid_from,
    posting_date: payload.posting_date || new Date().toISOString().slice(0, 10),
    reference_no: payload.reference_no || undefined,
    reference_date: payload.reference_date || undefined,
    remarks: payload.remarks || undefined,
    allocations: JSON.stringify(payload.allocations || []),
    mode_of_payment: payload.mode_of_payment || undefined,
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

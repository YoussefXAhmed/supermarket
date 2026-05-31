import { api } from './api';

const BASE = '/api/method/elmahdi.api.purchasing_history';

const EMPTY_LIST = { rows: [], count: 0 };

const EMPTY_KPIS = {
  pr_pending: { count: 0, value: 0 },
  pr_approved: { count: 0, value: 0 },
  pr_rejected: { count: 0, value: 0 },
  pr_draft: { count: 0, value: 0 },
  pi_outstanding: { count: 0, value: 0 },
  pi_partial: { count: 0, value: 0 },
  pi_paid: { count: 0, value: 0 },
};

function buildParams({
  status = 'all',
  supplier = '',
  fromDate = '',
  toDate = '',
  name = '',
  limit = 200,
} = {}) {
  return {
    status: status || 'all',
    supplier: supplier || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    name: name || undefined,
    limit,
  };
}

export async function listPurchaseReceiptHistory(filters) {
  const res = await api.get(`${BASE}.list_purchase_receipt_history`, {
    params: buildParams(filters),
  });
  return res?.data?.message || EMPTY_LIST;
}

export async function listPurchaseInvoiceHistory(filters) {
  const res = await api.get(`${BASE}.list_purchase_invoice_history`, {
    params: buildParams(filters),
  });
  return res?.data?.message || EMPTY_LIST;
}

export async function getPurchaseReceiptDetail(name) {
  const res = await api.get(`${BASE}.get_purchase_receipt_detail`, { params: { name } });
  return res?.data?.message || null;
}

export async function getPurchaseInvoiceDetail(name) {
  const res = await api.get(`${BASE}.get_purchase_invoice_detail`, { params: { name } });
  return res?.data?.message || null;
}

export async function getPurchasingDashboardKpis() {
  const res = await api.get(`${BASE}.get_purchasing_dashboard_kpis`);
  return res?.data?.message || EMPTY_KPIS;
}

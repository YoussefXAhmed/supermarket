/**
 * ERPNext returns API — POS Invoice sales returns only.
 * No client-side stock math; ERP submit reverses stock.
 */
import api from './api';
import { submitPosInvoiceReturnOnServer } from './erpSubmitApi';

const POS_INVOICE = 'POS Invoice';

const SOURCE_LIST_FIELDS = [
  'name',
  'customer',
  'posting_date',
  'grand_total',
  'docstatus',
  'status',
  'is_return',
  'return_against',
  'owner',
  'pos_profile',
  'set_warehouse',
  'company',
];

const RETURN_LIST_FIELDS = [
  'name',
  'customer',
  'posting_date',
  'grand_total',
  'docstatus',
  'status',
  'is_return',
  'return_against',
  'owner',
  'modified',
];

/** Full document for return building (single request). */
export function fetchPOSInvoiceFull(name) {
  return api.get(`/api/resource/${POS_INVOICE}/${encodeURIComponent(name)}`);
}

export function listPOSInvoicesForReturnLookup({ query, limit = 25, owner } = {}) {
  const filters = [
    ['docstatus', '=', 1],
    ['is_return', '=', 0],
  ];
  if (owner?.trim()) {
    filters.push(['owner', '=', owner.trim()]);
  }
  if (query?.trim()) {
    filters.push(['name', 'like', `%${query.trim()}%`]);
  }
  return api.get(`/api/resource/${POS_INVOICE}`, {
    params: {
      fields: JSON.stringify(SOURCE_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'posting_date desc',
      limit_page_length: limit,
    },
  });
}

/** All return documents against a source invoice (draft + submitted). */
export function listReturnsAgainstSource(sourceName) {
  return api.get(`/api/resource/${POS_INVOICE}`, {
    params: {
      fields: JSON.stringify(RETURN_LIST_FIELDS),
      filters: JSON.stringify([
        ['is_return', '=', 1],
        ['return_against', '=', sourceName],
        ['docstatus', '!=', 2],
      ]),
      order_by: 'modified desc',
      limit_page_length: 50,
    },
  });
}

/** Pending return drafts awaiting manager approval. */
export function listPendingReturnDrafts({ limit = 40 } = {}) {
  return api.get(`/api/resource/${POS_INVOICE}`, {
    params: {
      fields: JSON.stringify(RETURN_LIST_FIELDS),
      filters: JSON.stringify([
        ['is_return', '=', 1],
        ['docstatus', '=', 0],
      ]),
      order_by: 'modified desc',
      limit_page_length: limit,
    },
  });
}

/**
 * ERPNext native return mapper (preferred).
 * @returns {Promise<object>} draft return doc from ERP
 */
export async function makePOSInvoiceReturn(sourceName) {
  const res = await api.post(
    '/api/method/erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return',
    { source_name: sourceName },
  );
  const doc = res?.data?.message;
  if (!doc) throw new Error('ERP did not return a return document');
  return doc;
}

export function createPOSInvoiceReturn(payload) {
  return api.post(`/api/resource/${POS_INVOICE}`, payload);
}

export function updatePOSInvoiceReturn(name, payload) {
  return api.put(`/api/resource/${POS_INVOICE}/${encodeURIComponent(name)}`, payload);
}

/** Native ERPNext submit — reverses stock via SLE hooks. */
export function submitPOSInvoiceReturn(name) {
  return submitPosInvoiceReturnOnServer(name);
}

export function getPOSInvoiceReturn(name) {
  return fetchPOSInvoiceFull(name);
}

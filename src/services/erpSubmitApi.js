/**
 * Authoritative ERPNext submit — native doc.submit() via elmahdi.api.erp_submit.
 * Never use REST PUT { docstatus: 1 } for stock/accounting documents.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.erp_submit';

function messageFromResponse(res) {
  return res?.data?.message ?? res?.data;
}

export function submitErpDocumentOnServer(doctype, name) {
  return api.post(`${BASE}.submit_document`, { doctype, name });
}

export function submitStockEntryOnServer(name) {
  return api.post(`${BASE}.submit_stock_entry`, { name });
}

export function submitStockReconciliationOnServer(name) {
  return api.post(`${BASE}.submit_stock_reconciliation`, { name });
}

export function submitPurchaseReceiptOnServer(name) {
  return api.post(`${BASE}.submit_purchase_receipt`, { name });
}

export function submitPurchaseInvoiceOnServer(name) {
  return api.post(`${BASE}.submit_purchase_invoice`, { name });
}

export function submitSalesInvoiceOnServer(name) {
  return api.post(`${BASE}.submit_sales_invoice`, { name });
}

export function submitPosInvoiceReturnOnServer(name) {
  return api.post(`${BASE}.submit_pos_invoice_return`, { name });
}

export function submitDeliveryNoteOnServer(name) {
  return api.post(`${BASE}.submit_delivery_note`, { name });
}

export function submitPurchaseReturnOnServer(name) {
  return api.post(`${BASE}.submit_purchase_return`, { name });
}

export function submitPaymentEntryOnServer(name) {
  return api.post(`${BASE}.submit_payment_entry`, { name });
}

export function submitPosOpeningEntryOnServer(name) {
  return api.post(`${BASE}.submit_pos_opening_entry`, { name });
}

/** @deprecated Prefer submitPosInvoiceReturnOnServer — alias for returns */
export const submitPosInvoiceOnServer = (name) =>
  api.post('/api/method/elmahdi.api.pos_checkout.submit_pos_invoice', { name });

export async function submitAndFetch(doctype, name, fetchDoc) {
  const res = await submitErpDocumentOnServer(doctype, name);
  const submitted = messageFromResponse(res);
  if (fetchDoc) {
    const doc = await fetchDoc(name);
    return { name, doc, submitted: true, server: submitted };
  }
  return { name, doc: submitted, submitted: true, server: submitted };
}

export { messageFromResponse };

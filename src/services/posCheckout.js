import { createAndSubmitPOSInvoiceOnServer, getPOSInvoice } from './api';
import { submitPosInvoiceOnServer } from './erpSubmitApi';
import { logActivity, ActivityType } from './activityLogService';
import {
  extractERPError,
  isStockValidationError,
  isPosStockMovementError,
  isGlMovementError,
  normalizeERPError,
} from '../utils/errorHandling';

/** Invoices that failed stock submit — block repeat submit for this session. */
const stockFailedInvoices = new Set();

function classifySubmitError(error, posWarehouse) {
  const info = extractERPError(error);
  const normalized = normalizeERPError(error);
  if (isStockValidationError(info) || isPosStockMovementError(info) || isGlMovementError(info)) {
    normalized.isStockError = true;
    normalized.recoverable = false;
    normalized.posWarehouse = posWarehouse;
    delete normalized.invoiceName;
    return normalized;
  }
  return normalized;
}

export function isStockBlockedInvoice(name) {
  return Boolean(name && stockFailedInvoices.has(name));
}

export function markStockBlockedInvoice(name) {
  if (name) stockFailedInvoices.add(name);
}

export function clearStockBlockedInvoice(name) {
  if (name) stockFailedInvoices.delete(name);
}

function invoiceFromServerMessage(message) {
  const doc = message?.data?.message ?? message?.message ?? message;
  if (doc && typeof doc === 'object' && doc.name) return doc;
  return null;
}

function logCheckout(payload, doc) {
  logActivity({
    type: ActivityType.SALE,
    action: 'POS checkout',
    user: payload?.owner || payload?.cashier || 'pos',
    detail: { name: doc.name, amount: doc.grand_total, customer: payload?.customer },
  });
}

/**
 * Create and submit POS Invoice via server-side ERPNext submit() (authoritative stock posting).
 */
export async function checkoutPOSInvoice(payload) {
  const posWarehouse = payload?.set_warehouse || '';

  if (isStockBlockedInvoice(payload?.retryInvoiceName)) {
    throw classifySubmitError(
      { response: { status: 417, data: { message: 'Insufficient stock' } } },
      posWarehouse,
    );
  }

  try {
    const res = await createAndSubmitPOSInvoiceOnServer(payload);
    const doc = invoiceFromServerMessage(res) || res?.data?.data;
    if (!doc?.name) throw new Error('Invoice was not created');
    if (doc.docstatus !== 1) {
      throw new Error(`POS Invoice ${doc.name} was not submitted`);
    }
    clearStockBlockedInvoice(doc.name);
    logCheckout(payload, doc);
    return doc;
  } catch (e) {
    const classified = classifySubmitError(e, posWarehouse);
    if (classified.isStockError) {
      markStockBlockedInvoice(classified.invoiceName);
    }
    throw classified;
  }
}

/** Retry submit for a draft POS Invoice (legacy drafts only). */
export async function retrySubmitPOSInvoice(name, { posWarehouse = '' } = {}) {
  if (!name) throw new Error('Invoice name required');
  if (isStockBlockedInvoice(name)) {
    throw classifySubmitError(
      { response: { status: 417, data: { message: 'Insufficient stock' } } },
      posWarehouse,
    );
  }

  try {
    const res = await submitPosInvoiceOnServer(name);
    const doc = invoiceFromServerMessage(res);
    if (!doc?.name) {
      const invoiceRes = await getPOSInvoice(name);
      return invoiceRes?.data?.data;
    }
    clearStockBlockedInvoice(name);
    return doc;
  } catch (e) {
    const classified = classifySubmitError(e, posWarehouse);
    if (classified.isStockError) {
      markStockBlockedInvoice(name);
    }
    throw classified;
  }
}

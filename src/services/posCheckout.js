import { createPOSInvoice, submitPOSInvoice, getPOSInvoice } from './api';
import { logActivity, ActivityType } from './activityLogService';
import {
  extractERPError,
  isStockValidationError,
  normalizeERPError,
} from '../utils/errorHandling';

const SUBMIT_RETRIES = 3;
const SUBMIT_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifySubmitError(error, posWarehouse) {
  const info = extractERPError(error);
  const normalized = normalizeERPError(error);
  if (isStockValidationError(info)) {
    normalized.isStockError = true;
    normalized.recoverable = false;
    normalized.posWarehouse = posWarehouse;
    delete normalized.invoiceName;
    return normalized;
  }
  return normalized;
}

/**
 * Create and submit POS Invoice with submit recovery (non-stock failures only).
 */
export async function checkoutPOSInvoice(payload) {
  const posWarehouse = payload?.set_warehouse || '';
  const res = await createPOSInvoice(payload);
  const name = res?.data?.data?.name;
  if (!name) throw new Error('Invoice was not created');

  let lastErr;
  for (let attempt = 0; attempt < SUBMIT_RETRIES; attempt += 1) {
    try {
      await submitPOSInvoice(name);
      const invoiceRes = await getPOSInvoice(name);
      const doc = invoiceRes?.data?.data || { name, ...payload };
      logActivity({
        type: ActivityType.SALE,
        action: 'POS checkout',
        user: payload?.owner || payload?.cashier || 'pos',
        detail: { name: doc.name, amount: doc.grand_total, customer: payload?.customer },
      });
      return doc;
    } catch (e) {
      const classified = classifySubmitError(e, posWarehouse);
      lastErr = classified;

      if (classified.isStockError) {
        break;
      }

      try {
        const check = await getPOSInvoice(name);
        const doc = check?.data?.data;
        if (doc?.docstatus === 1) {
          logActivity({
            type: ActivityType.SALE,
            action: 'POS checkout',
            user: payload?.owner || payload?.cashier || 'pos',
            detail: { name: doc.name, amount: doc.grand_total, customer: payload?.customer },
          });
          return doc;
        }
      } catch {
        /* retry submit */
      }
      if (attempt < SUBMIT_RETRIES - 1) await sleep(SUBMIT_DELAY_MS * (attempt + 1));
    }
  }

  if (lastErr?.isStockError) {
    throw lastErr;
  }

  const err = lastErr || normalizeERPError(new Error('Failed to submit invoice'));
  if (!err.isStockError) {
    err.invoiceName = name;
    err.recoverable = true;
  }
  throw err;
}

export async function retrySubmitPOSInvoice(name, { posWarehouse = '' } = {}) {
  try {
    await submitPOSInvoice(name);
    const invoiceRes = await getPOSInvoice(name);
    return invoiceRes?.data?.data;
  } catch (e) {
    throw classifySubmitError(e, posWarehouse);
  }
}

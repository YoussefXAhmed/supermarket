import { createPOSInvoice, submitPOSInvoice, getPOSInvoice } from './api';
import { logActivity, ActivityType } from './activityLogService';

const SUBMIT_RETRIES = 3;
const SUBMIT_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create and submit POS Invoice with submit recovery.
 */
export async function checkoutPOSInvoice(payload) {
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
      lastErr = e;
      try {
        const check = await getPOSInvoice(name);
        const doc = check?.data?.data;
        if (doc?.docstatus === 1) return doc;
      } catch {
        /* retry submit */
      }
      if (attempt < SUBMIT_RETRIES - 1) await sleep(SUBMIT_DELAY_MS * (attempt + 1));
    }
  }

  const err = lastErr || new Error('Failed to submit invoice');
  err.invoiceName = name;
  err.recoverable = true;
  throw err;
}

export async function retrySubmitPOSInvoice(name) {
  await submitPOSInvoice(name);
  const invoiceRes = await getPOSInvoice(name);
  return invoiceRes?.data?.data;
}

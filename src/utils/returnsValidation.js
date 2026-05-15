/**
 * Returns validation — runs before draft create and before submit.
 * ERP totals remain authoritative after document save.
 */

const REFUND_METHODS = new Set(['Cash', 'Card', 'Original Payment', 'Store Credit']);

export function isValidRefundMethod(method) {
  return REFUND_METHODS.has(String(method || '').trim());
}

export function getRefundMethods() {
  return [...REFUND_METHODS];
}

/**
 * @param {import('../services/returnsService').NormalizedSourceInvoice} source
 */
export function validateSourceInvoiceEligible(source) {
  const errors = [];
  if (!source?.name) errors.push('Source invoice is required.');
  if (source?.docstatus !== 1) errors.push('Only submitted invoices can be returned.');
  if (source?.is_return) errors.push('Cannot return against a return invoice.');
  if (!source?.items?.length) errors.push('Source invoice has no line items.');
  if (!source?.set_warehouse) errors.push('Source invoice has no warehouse.');
  return { valid: errors.length === 0, errors };
}

/**
 * Aggregate qty already returned per item_code from existing return docs.
 * @param {import('../services/returnsService').NormalizedReturnInvoice[]} existingReturns
 */
export function aggregateReturnedQty(existingReturns = []) {
  const map = new Map();
  for (const doc of existingReturns) {
    for (const line of doc.items || []) {
      const code = line.item_code;
      if (!code) continue;
      const qty = Math.abs(Number(line.qty) || 0);
      map.set(code, (map.get(code) || 0) + qty);
    }
  }
  return map;
}

/**
 * @param {import('../services/returnsService').NormalizedSourceInvoice} source
 * @param {Map<string, number>} returnedQtyMap
 * @param {{ item_code: string, return_qty: number }[]} lines
 */
export function validateReturnLines(source, returnedQtyMap, lines) {
  const errors = [];
  if (!lines?.length) {
    errors.push('Select at least one item to return.');
    return { valid: false, errors };
  }

  const soldByItem = new Map();
  for (const row of source.items) {
    soldByItem.set(row.item_code, (soldByItem.get(row.item_code) || 0) + row.qty);
  }

  const seen = new Set();
  for (const line of lines) {
    const code = String(line.item_code || '').trim();
    const returnQty = Number(line.return_qty);
    const rowLabel = code || 'line';

    if (!code) {
      errors.push('Each return line must have an item code.');
      continue;
    }
    if (seen.has(code)) {
      errors.push(`Duplicate return line for ${code}.`);
      continue;
    }
    seen.add(code);

    if (!Number.isFinite(returnQty) || returnQty <= 0) {
      errors.push(`${rowLabel}: return quantity must be greater than zero.`);
      continue;
    }

    const sold = soldByItem.get(code);
    if (sold == null) {
      errors.push(`${rowLabel}: item was not on the original invoice.`);
      continue;
    }

    const already = returnedQtyMap.get(code) || 0;
    const remaining = sold - already;
    if (returnQty > remaining + 1e-9) {
      errors.push(
        `${rowLabel}: return qty ${returnQty} exceeds remaining returnable qty ${Math.max(0, remaining)} (sold ${sold}, already returned ${already}).`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {{ sourceName?: string, reason?: string, refundMethod?: string, lines?: object[], warehouse?: string }} form
 * @param {import('../services/returnsService').NormalizedSourceInvoice|null} source
 * @param {Map<string, number>} returnedQtyMap
 */
export function validateReturnForm(form, source, returnedQtyMap) {
  const errors = [];
  const sourceName = String(form?.sourceName || '').trim();
  if (!sourceName) errors.push('Enter the original POS invoice number.');

  const reason = String(form?.reason || '').trim();
  if (reason.length < 3) errors.push('Return reason is required (min 3 characters).');

  const refundMethod = String(form?.refundMethod || '').trim();
  if (!isValidRefundMethod(refundMethod)) {
    errors.push('Select a valid refund method.');
  }

  if (!source) {
    return { valid: false, errors: [...errors, 'Load a valid source invoice before continuing.'] };
  }

  if (source.name !== sourceName) {
    errors.push('Source invoice name does not match loaded document.');
  }

  const wh = String(form?.warehouse || source.set_warehouse || '').trim();
  if (wh && source.set_warehouse && wh !== source.set_warehouse) {
    errors.push('Return warehouse must match the original invoice warehouse.');
  }

  const sourceCheck = validateSourceInvoiceEligible(source);
  const lineCheck = validateReturnLines(
    source,
    returnedQtyMap,
    (form?.lines || []).filter((l) => Number(l.return_qty) > 0),
  );

  return {
    valid: errors.length === 0 && sourceCheck.valid && lineCheck.valid,
    errors: [...errors, ...sourceCheck.errors, ...lineCheck.errors],
  };
}

/**
 * @param {import('../services/returnsService').NormalizedReturnInvoice} doc
 */
export function validateReturnDocForSubmit(doc) {
  const errors = [];
  if (!doc?.name) errors.push('Return document not found.');
  if (!doc?.is_return) errors.push('Document is not marked as a return.');
  if (!doc?.return_against) errors.push('Return is not linked to a source invoice.');
  if (doc?.docstatus !== 0) errors.push('Only draft returns can be approved and submitted.');
  if (!doc?.items?.length) errors.push('Return has no items.');
  return { valid: errors.length === 0, errors };
}

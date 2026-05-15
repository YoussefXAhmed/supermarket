/**
 * Returns & refund orchestration — ERPNext POS Invoice sales returns.
 */
import {
  fetchPOSInvoiceFull,
  listReturnsAgainstSource,
  listPendingReturnDrafts,
  listPOSInvoicesForReturnLookup,
  makePOSInvoiceReturn,
  createPOSInvoiceReturn,
  updatePOSInvoiceReturn,
  submitPOSInvoiceReturn,
  getPOSInvoiceReturn,
} from './returnsApi';
import {
  aggregateReturnedQty,
  validateReturnDocForSubmit,
  validateReturnForm,
  validateSourceInvoiceEligible,
} from '../utils/returnsValidation';
import { logActivity, ActivityType } from './activityLogService';

const AUDIT_PREFIX = 'Elmahdi-Return-Audit';

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((row) => ({
    name: row.name,
    item_code: row.item_code,
    item_name: row.item_name,
    qty: Math.abs(Number(row.qty) || 0),
    rate: Number(row.rate) || 0,
    amount: Number(row.amount) || 0,
    warehouse: row.warehouse,
    stock_uom: row.stock_uom || row.uom || 'Nos',
  }));
}

function parsePayments(rawPayments) {
  if (!Array.isArray(rawPayments)) return [];
  return rawPayments.map((p) => ({
    mode_of_payment: p.mode_of_payment,
    amount: Number(p.amount) || 0,
  }));
}

export function normalizeSourceInvoice(doc) {
  if (!doc) return null;
  const items = parseItems(doc.items);
  return {
    name: doc.name,
    customer: doc.customer,
    company: doc.company,
    posting_date: doc.posting_date,
    grand_total: Number(doc.grand_total) || 0,
    docstatus: doc.docstatus,
    status: doc.status,
    is_return: Boolean(doc.is_return),
    return_against: doc.return_against,
    owner: doc.owner,
    pos_profile: doc.pos_profile,
    set_warehouse: doc.set_warehouse,
    selling_price_list: doc.selling_price_list,
    currency: doc.currency || 'EGP',
    items,
    payments: parsePayments(doc.payments),
  };
}

export function normalizeReturnInvoice(doc) {
  if (!doc) return null;
  const base = normalizeSourceInvoice(doc);
  return {
    ...base,
    is_return: true,
    return_against: doc.return_against,
    remarks: doc.remarks || '',
    audit: parseAuditFromRemarks(doc.remarks),
  };
}

export function buildAuditRemarks({ reason, refundMethod, operator, status = 'pending_approval', approvedBy = '' }) {
  const parts = [
    `${AUDIT_PREFIX}`,
    `reason=${encodeURIComponent(String(reason || '').trim())}`,
    `refund_method=${encodeURIComponent(String(refundMethod || '').trim())}`,
    `operator=${encodeURIComponent(String(operator || '').trim())}`,
    `status=${status}`,
  ];
  if (approvedBy) parts.push(`approved_by=${encodeURIComponent(approvedBy)}`);
  return parts.join('; ');
}

export function parseAuditFromRemarks(remarks = '') {
  const text = String(remarks || '');
  if (!text.includes(AUDIT_PREFIX)) return null;
  const out = {};
  const chunks = text.split(';').map((s) => s.trim());
  for (const chunk of chunks) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    const key = chunk.slice(0, eq).trim();
    let val = chunk.slice(eq + 1).trim();
    if (['reason', 'refund_method', 'operator', 'approved_by'].includes(key)) {
      try {
        val = decodeURIComponent(val);
      } catch {
        /* keep raw */
      }
    }
    out[key] = val;
  }
  return out;
}

function buildReturnItemsForErp(source, lines) {
  const lineMap = new Map(
    lines
      .filter((l) => Number(l.return_qty) > 0)
      .map((l) => [l.item_code, Number(l.return_qty)]),
  );

  return source.items
    .filter((row) => lineMap.has(row.item_code))
    .map((row) => {
      const returnQty = lineMap.get(row.item_code);
      return {
        item_code: row.item_code,
        item_name: row.item_name,
        qty: -Math.abs(returnQty),
        rate: row.rate,
        warehouse: row.warehouse || source.set_warehouse,
        stock_uom: row.stock_uom,
      };
    });
}

function buildRefundPayments(source, erpGrandTotal, refundMethod) {
  const total = Math.abs(Number(erpGrandTotal) || 0);
  if (total <= 0) return [];

  const preferred =
    refundMethod === 'Original Payment' && source.payments?.length
      ? source.payments[0].mode_of_payment
      : refundMethod === 'Card'
        ? 'Card'
        : 'Cash';

  return [{ mode_of_payment: preferred, amount: total }];
}

function applyPartialLinesToReturnDoc(erpDoc, source, lines) {
  const items = buildReturnItemsForErp(source, lines);
  return {
    ...erpDoc,
    items,
  };
}

/**
 * Load source invoice + existing returns for validation context.
 */
export async function loadReturnContext(sourceName) {
  const name = String(sourceName || '').trim();
  if (!name) {
    return { source: null, existingReturns: [], returnedQtyMap: new Map(), errors: ['Invoice name is required.'] };
  }

  const res = await fetchPOSInvoiceFull(name);
  const source = normalizeSourceInvoice(res?.data?.data);
  const eligibility = validateSourceInvoiceEligible(source);
  if (!eligibility.valid) {
    return { source, existingReturns: [], returnedQtyMap: new Map(), errors: eligibility.errors };
  }

  const retRes = await listReturnsAgainstSource(name);
  const existingReturns = (retRes?.data?.data || []).map((d) => normalizeReturnInvoice(d));
  const returnedQtyMap = aggregateReturnedQty(existingReturns);

  return { source, existingReturns, returnedQtyMap, errors: [] };
}

export async function searchReturnableInvoices(query) {
  const res = await listPOSInvoicesForReturnLookup({ query, limit: 30 });
  return (res?.data?.data || []).map((row) => ({
    name: row.name,
    customer: row.customer,
    posting_date: row.posting_date,
    grand_total: Number(row.grand_total) || 0,
    set_warehouse: row.set_warehouse,
  }));
}

export async function listPendingReturns() {
  const res = await listPendingReturnDrafts();
  return (res?.data?.data || []).map((d) => normalizeReturnInvoice(d));
}

/**
 * Create draft return (docstatus 0). Requires canCreateReturns at UI/guard level.
 */
export async function createReturnDraft({
  sourceName,
  lines,
  reason,
  refundMethod,
  operator,
  canCreate = false,
}) {
  if (!canCreate) {
    throw new Error('You are not permitted to create returns.');
  }
  const ctx = await loadReturnContext(sourceName);
  if (ctx.errors?.length) throw new Error(ctx.errors.join(' '));

  const formCheck = validateReturnForm(
    { sourceName, lines, reason, refundMethod, warehouse: ctx.source.set_warehouse },
    ctx.source,
    ctx.returnedQtyMap,
  );
  if (!formCheck.valid) throw new Error(formCheck.errors.join(' '));

  let erpDoc;
  try {
    erpDoc = await makePOSInvoiceReturn(ctx.source.name);
  } catch {
    erpDoc = null;
  }

  const activeLines = lines.filter((l) => Number(l.return_qty) > 0);
  const items = buildReturnItemsForErp(ctx.source, activeLines);

  if (!erpDoc) {
    const payload = {
      is_return: 1,
      return_against: ctx.source.name,
      customer: ctx.source.customer,
      company: ctx.source.company,
      pos_profile: ctx.source.pos_profile,
      set_warehouse: ctx.source.set_warehouse,
      selling_price_list: ctx.source.selling_price_list,
      currency: ctx.source.currency,
      is_pos: 1,
      items,
      payments: [],
      remarks: buildAuditRemarks({ reason, refundMethod, operator, status: 'pending_approval' }),
    };
    const created = await createPOSInvoiceReturn(payload);
    erpDoc = created?.data?.data;
  } else {
    const patched = applyPartialLinesToReturnDoc(erpDoc, ctx.source, activeLines);
    const remarks = buildAuditRemarks({ reason, refundMethod, operator, status: 'pending_approval' });
    const updated = await updatePOSInvoiceReturn(patched.name, { items: patched.items, remarks });
    erpDoc = updated?.data?.data || { ...patched, remarks };
  }

  const savedRes = await getPOSInvoiceReturn(erpDoc.name);
  let saved = normalizeReturnInvoice(savedRes?.data?.data);

  const erpTotal = Math.abs(Number(saved.grand_total) || 0);
  const payments = buildRefundPayments(ctx.source, erpTotal, refundMethod);
  if (payments.length) {
    const payUpdate = await updatePOSInvoiceReturn(saved.name, {
      payments,
      remarks: saved.remarks,
    });
    saved = normalizeReturnInvoice(payUpdate?.data?.data) || saved;
  }

  logActivity({
    type: ActivityType.RETURN,
    action: 'Return draft created',
    user: operator,
    detail: {
      return_name: saved.name,
      source: ctx.source.name,
      erp_grand_total: saved.grand_total,
      refund_method: refundMethod,
    },
  });

  return {
    returnDoc: saved,
    source: ctx.source,
    erpGrandTotal: Math.abs(Number(saved.grand_total) || 0),
  };
}

/**
 * Submit draft return — requires canApproveReturns. ERP submit reverses stock.
 */
export async function approveAndSubmitReturn({
  returnName,
  approver,
  reason,
  refundMethod,
  canApprove = false,
}) {
  if (!canApprove) {
    throw new Error('You are not permitted to approve and submit returns.');
  }
  const name = String(returnName || '').trim();
  if (!name) throw new Error('Return document name is required.');

  const res = await getPOSInvoiceReturn(name);
  let doc = normalizeReturnInvoice(res?.data?.data);
  const submitCheck = validateReturnDocForSubmit(doc);
  if (!submitCheck.valid) throw new Error(submitCheck.errors.join(' '));

  const ctx = await loadReturnContext(doc.return_against);
  if (ctx.errors?.length) throw new Error(ctx.errors.join(' '));

  const audit = parseAuditFromRemarks(doc.remarks) || {};
  const finalReason = reason || audit.reason || '';
  const finalRefund = refundMethod || audit.refund_method || '';
  if (!finalReason || !finalRefund) {
    throw new Error('Return reason and refund method are required before approval.');
  }

  const remarks = buildAuditRemarks({
    reason: finalReason,
    refundMethod: finalRefund,
    operator: audit.operator || doc.owner,
    status: 'submitted',
    approvedBy: approver,
  });

  const erpTotal = Math.abs(Number(doc.grand_total) || 0);
  const payments = buildRefundPayments(ctx.source, erpTotal, finalRefund);

  await updatePOSInvoiceReturn(name, { remarks, payments });

  await submitPOSInvoiceReturn(name);

  const submittedRes = await getPOSInvoiceReturn(name);
  const submitted = normalizeReturnInvoice(submittedRes?.data?.data);

  if (submitted.docstatus !== 1) {
    throw new Error('ERP did not submit the return invoice. Check permissions and stock settings.');
  }

  logActivity({
    type: ActivityType.RETURN,
    action: 'Return submitted',
    user: approver,
    detail: {
      return_name: submitted.name,
      source: submitted.return_against,
      erp_grand_total: submitted.grand_total,
      approved_by: approver,
    },
  });

  return {
    returnDoc: submitted,
    source: ctx.source,
    erpGrandTotal: Math.abs(Number(submitted.grand_total) || 0),
  };
}

/** Read-only summary for display — refund total always from ERP. */
export function summarizeReturnableLines(source, returnedQtyMap) {
  return source.items.map((row) => {
    const returned = returnedQtyMap.get(row.item_code) || 0;
    const remaining = Math.max(0, row.qty - returned);
    return {
      item_code: row.item_code,
      item_name: row.item_name,
      sold_qty: row.qty,
      returned_qty: returned,
      returnable_qty: remaining,
      rate: row.rate,
    };
  });
}

export function formatErpMoney(amount, currency = 'EGP') {
  return `${currency} ${roundMoney(Math.abs(Number(amount) || 0)).toFixed(2)}`;
}

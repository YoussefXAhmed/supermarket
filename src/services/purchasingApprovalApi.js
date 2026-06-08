import api, { getCompanies } from './api';
import { validateReceiveForm } from '../utils/purchasingValidation';
import { logActivity, ActivityType } from './activityLogService';
import {
  dispatchOperationalRefresh,
  OperationalRefreshReason,
} from './operationalRefresh';
import { invalidateStockCache } from '../utils/stockCache';

async function resolveCompany(explicit) {
  if (explicit) return explicit;
  const res = await getCompanies({ limit: 1 });
  return res?.data?.data?.[0]?.name;
}

export async function getBuyingRateSuggestions(itemCodes) {
  const codes = [...new Set((itemCodes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!codes.length) return {};
  const res = await api.get('/api/method/elmahdi.api.purchasing.get_buying_rate_suggestions', {
    params: { item_codes: JSON.stringify(codes) },
  });
  return res?.data?.message || {};
}

export async function createPurchaseReceiptWorkflow({
  supplier,
  company,
  warehouse,
  lines,
  posting_date,
}) {
  const resolvedCompany = await resolveCompany(company);
  const check = validateReceiveForm({
    supplier,
    company: resolvedCompany,
    warehouse,
    lines,
  });
  if (!check.valid) {
    const err = new Error(check.errors.join(' '));
    err.validationErrors = check.errors;
    throw err;
  }

  const payloadLines = lines.map((line) => ({
    item_code: line.item_code.trim(),
    qty: Number(line.qty),
    rate: Number(line.rate),
    expected_rate: Number(line.expected_rate) || undefined,
    previous_rate:
      line.previous_rate != null && line.previous_rate !== ''
        ? Number(line.previous_rate)
        : undefined,
  }));

  const res = await api.post('/api/method/elmahdi.api.purchasing.create_purchase_receipt_workflow', {
    supplier,
    company: resolvedCompany,
    warehouse,
    lines: JSON.stringify(payloadLines),
    posting_date: posting_date || new Date().toISOString().slice(0, 10),
  });

  const result = res?.data?.message;
  if (!result?.name) throw new Error('Purchase Receipt was not created');

  logActivity({
    type: ActivityType.PURCHASE,
    action: result.submitted ? 'Purchase receipt submitted' : 'Purchase receipt pending approval',
    detail: {
      name: result.name,
      supplier,
      warehouse,
      approval_level: result.approval_level,
      pending: result.pending_purchase_approval,
    },
  });

  if (result.submitted) {
    invalidateStockCache({ source: 'purchase_receipt', name: result.name, warehouse });
  } else {
    dispatchOperationalRefresh(OperationalRefreshReason.PURCHASE_RECEIPT, {
      name: result.name,
      pending: true,
    });
  }

  return result;
}

/** @deprecated Use invoiceMatchingService.fetchInvoiceMatchingWorkspace */
export async function getInvoiceMatchingFromServer(limit = 150) {
  const res = await api.get('/api/method/elmahdi.api.invoice_matching.get_invoice_matching_workspace', {
    params: { limit },
  });
  return res?.data?.message || [];
}

export async function getPurchasingWorkspaceHistory({ limit = 300, supplier, from_date } = {}) {
  const res = await api.get('/api/method/elmahdi.api.purchasing.get_purchasing_workspace_history', {
    params: {
      limit,
      supplier: supplier || undefined,
      from_date: from_date || undefined,
    },
  });
  return res?.data?.message || [];
}

export async function listPendingPurchaseApprovals(limit = 50) {
  const res = await api.get('/api/method/elmahdi.api.purchasing.list_pending_purchase_approvals', {
    params: { limit },
  });
  return res?.data?.message || [];
}

export async function listPurchaseApprovalHistory({
  status = 'all',
  supplier = '',
  fromDate = '',
  toDate = '',
  name = '',
  limit = 200,
} = {}) {
  const res = await api.get(
    '/api/method/elmahdi.api.purchase_approval_history.list_purchase_approval_history',
    {
      params: {
        status: status || 'all',
        supplier: supplier || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        name: name || undefined,
        limit,
      },
    },
  );
  return (
    res?.data?.message || {
      rows: [],
      totals: { approved_count: 0, rejected_count: 0, approved_value: 0, rejected_value: 0 },
      month_totals: { approved_count: 0, rejected_count: 0, approved_value: 0, rejected_value: 0 },
    }
  );
}

export async function getPurchaseApprovalDetail(name) {
  const res = await api.get(
    '/api/method/elmahdi.api.purchase_approval_history.get_purchase_approval_detail',
    { params: { name } },
  );
  return res?.data?.message || null;
}

export async function approvePurchaseReceipt(name, { notes = '' } = {}) {
  const res = await api.post('/api/method/elmahdi.api.purchasing.approve_purchase_receipt', {
    name,
    action: 'approve',
    notes,
  });
  const result = res?.data?.message;
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase receipt approved',
    detail: { name, status: result?.status },
  });
  invalidateStockCache({ source: 'purchase_approval', name });
  dispatchOperationalRefresh(OperationalRefreshReason.PURCHASE_RECEIPT, {
    name,
    action: 'approve',
    purchase_invoice: result?.purchase_invoice,
  });
  dispatchOperationalRefresh(OperationalRefreshReason.PURCHASE_INVOICE, {
    receipt: name,
    invoice: result?.purchase_invoice,
    action: 'auto_after_approval',
  });
  return result;
}

export async function rejectPurchaseReceipt(name, { notes = '' } = {}) {
  const res = await api.post('/api/method/elmahdi.api.purchasing.approve_purchase_receipt', {
    name,
    action: 'reject',
    notes,
  });
  const result = res?.data?.message;
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase receipt rejected',
    detail: { name, status: result?.status },
  });
  return result;
}

// ── Phase 4.b — batch endpoints (Purchase Approvals) ─────────────────────
//
// Both functions hit the new run_row_batch backend and surface the
// standard envelope: { audit_id, total, succeeded, failed, results }.
// The activity log records the COUNT, not per-receipt entries; the
// per-row audit lives in Elmahdi Batch Audit + each receipt's
// purchase_rate_audit JSON field (unchanged from the single-doc path).

export async function batchApprovePurchaseReceipts(items, { notes = '' } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return { audit_id: null, total: 0, succeeded: 0, failed: 0, results: [] };
  }
  const res = await api.post('/api/method/elmahdi.api.purchasing.batch_approve_purchase_receipts', {
    items: list,
    notes: notes || '',
  });
  const result = res?.data?.message || { results: [], total: 0, succeeded: 0, failed: 0 };
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase receipts batch approved',
    detail: {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      audit_id: result.audit_id,
    },
  });
  // One stock-cache invalidation + one operational-refresh dispatch is
  // enough — subscribers (approval queues, dashboards) re-fetch in full
  // and don't need per-row signals.
  invalidateStockCache({ source: 'purchase_approval_batch', count: result.succeeded });
  dispatchOperationalRefresh(OperationalRefreshReason.PURCHASE_RECEIPT, {
    action: 'batch_approve',
    succeeded: result.succeeded,
    failed: result.failed,
  });
  dispatchOperationalRefresh(OperationalRefreshReason.PURCHASE_INVOICE, {
    action: 'auto_after_batch_approval',
    succeeded: result.succeeded,
  });
  return result;
}

export async function batchRejectPurchaseReceipts(items, { notes = '' } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return { audit_id: null, total: 0, succeeded: 0, failed: 0, results: [] };
  }
  const res = await api.post('/api/method/elmahdi.api.purchasing.batch_reject_purchase_receipts', {
    items: list,
    notes: notes || '',
  });
  const result = res?.data?.message || { results: [], total: 0, succeeded: 0, failed: 0 };
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase receipts batch rejected',
    detail: {
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      audit_id: result.audit_id,
    },
  });
  return result;
}

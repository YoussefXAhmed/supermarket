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

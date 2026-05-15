/**
 * Shift open/close/reconcile — ERPNext POS Opening/Closing Entry orchestration.
 */
import api from './api';
import {
  createPOSOpeningEntry,
  createPOSClosingEntry,
  submitPOSOpeningEntry,
  getPOSOpeningEntryOperational,
  getPOSOpeningEntryAudit,
  getActiveShiftForUser,
  getOpenPOSOpeningEntry,
  listPOSOpeningEntries,
  listPOSClosingEntries,
  getPOSClosingEntryOperational,
  getPOSClosingEntryAudit,
  submitPOSClosingEntry,
  fetchShiftSummaryFromERP,
  prepareClosingEntryFromERP,
  listShiftPOSInvoices,
  listVoidedShiftPOSInvoices,
} from './shiftsApi';
import { resolveActivePOSProfile } from './posApi';
import {
  summarizeShiftInvoices,
  calculateVariance,
  buildPaymentReconciliationRows,
  roundMoney,
} from '../utils/shiftCalculations';
import {
  validateOpenShift,
  validateCloseShift,
  validateShiftApproval,
  ShiftValidationError,
} from '../utils/shiftValidation';
import { logActivity, ActivityType } from './activityLogService';

const AUDIT_PREFIX = 'Elmahdi-Shift-Audit';

export { ShiftValidationError };

export function parseOpeningByMode(openingDoc) {
  const rows = openingDoc?.balance_details || [];
  const map = {};
  for (const row of rows) {
    const mode = row.mode_of_payment || 'Cash';
    map[mode] = roundMoney((map[mode] || 0) + (Number(row.opening_amount) || 0));
  }
  return map;
}

export function normalizeOpeningEntry(doc, { includeAudit = false } = {}) {
  if (!doc) return null;
  const openingByMode = parseOpeningByMode(doc);
  const entry = {
    name: doc.name,
    pos_profile: doc.pos_profile,
    company: doc.company,
    period_start_date: doc.period_start_date,
    posting_date: doc.posting_date,
    status: doc.status || 'Open',
    docstatus: doc.docstatus,
    user: doc.user || doc.owner,
    owner: doc.owner,
    creation: doc.creation,
    modified: doc.modified,
    openingByMode,
    openingCash: roundMoney(openingByMode.Cash || 0),
  };
  if (includeAudit && doc.remarks != null) {
    entry.remarks = doc.remarks || '';
    entry.audit = parseAuditFromRemarks(doc.remarks);
  }
  return entry;
}

export function normalizeClosingEntry(doc, { includeAudit = false } = {}) {
  if (!doc) return null;
  const recon = Array.isArray(doc.payment_reconciliation) ? doc.payment_reconciliation : [];
  const cashRow = recon.find((r) => /^cash$/i.test(r.mode_of_payment || ''));
  const entry = {
    name: doc.name,
    pos_profile: doc.pos_profile,
    company: doc.company,
    pos_opening_entry: doc.pos_opening_entry,
    period_start_date: doc.period_start_date,
    period_end_date: doc.period_end_date,
    posting_date: doc.posting_date,
    status: doc.status,
    docstatus: doc.docstatus,
    user: doc.user || doc.owner,
    owner: doc.owner,
    creation: doc.creation,
    payment_reconciliation: recon,
    expectedCash: roundMoney(cashRow?.expected_amount ?? 0),
    actualCash: roundMoney(cashRow?.closing_amount ?? 0),
    variance: roundMoney(cashRow?.difference ?? 0),
  };
  if (includeAudit && doc.remarks != null) {
    entry.remarks = doc.remarks || '';
    entry.audit = parseAuditFromRemarks(doc.remarks);
  }
  return entry;
}

export function buildAuditRemarks({
  operator,
  expectedCash,
  actualCash,
  variance,
  severity,
  approvalStatus = 'none',
  approvedBy = '',
  notes = '',
  summary = {},
}) {
  const parts = [
    AUDIT_PREFIX,
    `operator=${encodeURIComponent(operator || '')}`,
    `expected_cash=${roundMoney(expectedCash)}`,
    `actual_cash=${roundMoney(actualCash)}`,
    `variance=${roundMoney(variance)}`,
    `severity=${severity}`,
    `approval_status=${approvalStatus}`,
    `sales_count=${summary.salesCount ?? 0}`,
    `returns_count=${summary.returnsCount ?? 0}`,
    `void_count=${summary.voidCount ?? 0}`,
  ];
  if (approvedBy) parts.push(`approved_by=${encodeURIComponent(approvedBy)}`);
  if (notes) parts.push(`notes=${encodeURIComponent(notes)}`);
  return parts.join('; ');
}

export function parseAuditFromRemarks(remarks = '') {
  const text = String(remarks || '');
  if (!text.includes(AUDIT_PREFIX)) return null;
  const out = {};
  for (const chunk of text.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    const key = chunk.slice(0, eq).trim();
    let val = chunk.slice(eq + 1).trim();
    if (['operator', 'approved_by', 'notes'].includes(key)) {
      try {
        val = decodeURIComponent(val);
      } catch {
        /* keep */
      }
    }
    out[key] = val;
  }
  return out;
}

async function loadShiftSummaryClient(opening) {
  const fromDate = opening.period_start_date || opening.posting_date;
  const [invRes, voidRes] = await Promise.all([
    listShiftPOSInvoices({
      posProfile: opening.pos_profile,
      fromDate,
      owner: opening.user || opening.owner,
    }),
    listVoidedShiftPOSInvoices({
      posProfile: opening.pos_profile,
      fromDate,
      owner: opening.user || opening.owner,
    }),
  ]);
  const invoices = (invRes?.data?.data || []).map((row) => ({
    ...row,
    payments: [],
    default_mode_of_payment: 'Cash',
  }));
  const voidCount = (voidRes?.data?.data || []).length;
  const openingByMode = parseOpeningByMode(opening);
  const summary = summarizeShiftInvoices({ invoices, openingByMode });
  return { ...summary, voidCount, source: 'client' };
}

export async function loadShiftSummary(openingEntryName) {
  const docRes = await getPOSOpeningEntryOperational(openingEntryName);
  const opening = normalizeOpeningEntry(docRes?.data?.data);
  if (!opening) throw new Error('Opening entry not found');

  try {
    const res = await fetchShiftSummaryFromERP(openingEntryName);
    const data = res?.data?.message || res?.data;
    if (data) {
      return {
        opening,
        salesTotal: roundMoney(data.sales_total),
        salesCount: data.sales_count || 0,
        returnsTotal: roundMoney(data.returns_total),
        returnsCount: data.returns_count || 0,
        voidCount: data.void_count || 0,
        invoiceCount: data.invoice_count || 0,
        paymentTotals: data.payment_totals || {},
        openingByMode: data.opening_by_mode || opening.openingByMode,
        openingCash: roundMoney(data.opening_cash ?? opening.openingCash),
        netCashFromSales: roundMoney(data.net_cash_from_sales),
        expectedCash: roundMoney(data.expected_cash),
        cardTotal: roundMoney(
          Object.entries(data.payment_totals || {})
            .filter(([m]) => !/^cash$/i.test(m))
            .reduce((s, [, v]) => s + Number(v), 0),
        ),
        source: 'erp',
      };
    }
  } catch {
    /* fallback */
  }

  const client = await loadShiftSummaryClient(docRes?.data?.data);
  return { opening, ...client };
}

export async function openShift({
  posProfile,
  company,
  openingAmount = 0,
  modeOfPayment = 'Cash',
  user,
  canOpen = true,
}) {
  const active = await getOpenPOSOpeningEntry(posProfile, user);
  validateOpenShift({
    openingAmount,
    posProfile,
    company,
    activeOpening: active,
    canOpen,
  });

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    pos_profile: posProfile,
    company,
    period_start_date: today,
    posting_date: today,
    user: user || undefined,
    balance_details: [
      { mode_of_payment: modeOfPayment, opening_amount: roundMoney(openingAmount) },
    ],
    remarks: buildAuditRemarks({
      operator: user,
      expectedCash: roundMoney(openingAmount),
      actualCash: roundMoney(openingAmount),
      variance: 0,
      severity: 'ok',
      approvalStatus: 'opened',
      notes: 'Shift opened',
    }),
  };

  const res = await createPOSOpeningEntry(payload);
  const name = res?.data?.data?.name;
  if (!name) throw new Error('Failed to create POS Opening Entry');
  await submitPOSOpeningEntry(name);
  const docRes = await getPOSOpeningEntryOperational(name);
  const entry = normalizeOpeningEntry(docRes?.data?.data);

  logActivity({
    type: ActivityType.SHIFT,
    action: 'shift_opened',
    user: user || 'unknown',
    detail: { opening: name, posProfile, openingAmount },
  });

  return entry;
}

export async function closeShift({
  openingEntryName,
  actualCash,
  notes = '',
  operator,
  canClose = true,
  canSubmitClosing = false,
  paymentCounts,
}) {
  const docRes = await getPOSOpeningEntryOperational(openingEntryName);
  const opening = normalizeOpeningEntry(docRes?.data?.data);
  const summary = await loadShiftSummary(openingEntryName);

  validateCloseShift({
    openingEntry: opening,
    actualCash,
    canClose,
    summary,
  });

  const varianceResult = calculateVariance(summary.expectedCash, actualCash);
  const auditRemarks = buildAuditRemarks({
    operator,
    expectedCash: varianceResult.expected,
    actualCash: varianceResult.actual,
    variance: varianceResult.variance,
    severity: varianceResult.severity,
    approvalStatus: varianceResult.severity === 'approval_required' ? 'pending' : 'auto',
    notes,
    summary,
  });

  let closingName;
  let submitted = false;

  try {
    const prep = await prepareClosingEntryFromERP({
      posOpeningEntry: openingEntryName,
      actualCash: varianceResult.actual,
      notes: auditRemarks,
      paymentCounts,
    });
    closingName = prep?.data?.message?.name || prep?.data?.name;
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    const reconRows = buildPaymentReconciliationRows({
      openingByMode: summary.openingByMode || opening.openingByMode,
      paymentTotals: summary.paymentTotals,
      actualByMode: { Cash: varianceResult.actual, ...paymentCounts },
    });
    const payload = {
      pos_profile: opening.pos_profile,
      company: opening.company,
      pos_opening_entry: opening.name,
      period_start_date: opening.period_start_date,
      period_end_date: today,
      posting_date: today,
      user: opening.user,
      payment_reconciliation: reconRows,
      remarks: auditRemarks,
    };
    const res = await createPOSClosingEntry(payload);
    closingName = res?.data?.data?.name;
  }

  if (!closingName) throw new Error('Failed to create POS Closing Entry');

  const needsVarianceApproval = varianceResult.severity === 'approval_required';
  const needsManagerSubmit = !canSubmitClosing;

  if (canSubmitClosing && !needsVarianceApproval) {
    try {
      await submitPOSClosingEntry(closingName);
      submitted = true;
    } catch (e) {
      return {
        closing: await loadClosing(closingName),
        variance: varianceResult,
        submitted: false,
        needsVarianceApproval,
        needsManagerSubmit: true,
        message: e.message,
      };
    }
  }

  logActivity({
    type: ActivityType.SHIFT,
    action: submitted ? 'shift_closed' : 'shift_close_draft',
    user: operator || 'unknown',
    detail: {
      opening: openingEntryName,
      closing: closingName,
      variance: varianceResult.variance,
      severity: varianceResult.severity,
    },
  });

  return {
    closing: await loadClosing(closingName),
    variance: varianceResult,
    submitted,
    needsVarianceApproval,
    needsManagerSubmit,
    /** @deprecated use needsVarianceApproval */
    needsApproval: needsVarianceApproval || needsManagerSubmit,
  };
}

async function loadClosing(name, { includeAudit = false } = {}) {
  const fetch = includeAudit ? getPOSClosingEntryAudit : getPOSClosingEntryOperational;
  const res = await fetch(name);
  return normalizeClosingEntry(res?.data?.data, { includeAudit });
}

export async function approveShiftClosing({
  closingEntryName,
  approver,
  opener,
  canApprove = true,
  notes = '',
}) {
  const closing = await loadClosing(closingEntryName, { includeAudit: true });
  if (!closing) throw new Error('Closing entry not found');

  const varianceResult = calculateVariance(closing.expectedCash, closing.actualCash);
  validateShiftApproval({
    closingEntry: closing,
    approver,
    opener: opener || closing.audit?.operator || closing.owner,
    canApprove,
    varianceSeverity: varianceResult.severity,
  });

  const remarks = buildAuditRemarks({
    operator: closing.audit?.operator || closing.owner,
    expectedCash: closing.expectedCash,
    actualCash: closing.actualCash,
    variance: closing.variance,
    severity: varianceResult.severity,
    approvalStatus: 'approved',
    approvedBy: approver,
    notes: notes || closing.audit?.notes,
    summary: {
      salesCount: closing.audit?.sales_count,
      returnsCount: closing.audit?.returns_count,
      voidCount: closing.audit?.void_count,
    },
  });

  await api.put(`/api/resource/POS Closing Entry/${encodeURIComponent(closingEntryName)}`, {
    remarks,
  });

  await submitPOSClosingEntry(closingEntryName);

  logActivity({
    type: ActivityType.SHIFT,
    action: 'shift_close_approved',
    user: approver,
    detail: { closing: closingEntryName, variance: closing.variance },
  });

  return loadClosing(closingEntryName, { includeAudit: true });
}

export async function getShiftAuditDetail({ openingName, closingName } = {}) {
  if (closingName) {
    const res = await getPOSClosingEntryAudit(closingName);
    return { type: 'closing', doc: normalizeClosingEntry(res?.data?.data, { includeAudit: true }) };
  }
  if (openingName) {
    const res = await getPOSOpeningEntryAudit(openingName);
    return { type: 'opening', doc: normalizeOpeningEntry(res?.data?.data, { includeAudit: true }) };
  }
  return null;
}

export async function listShiftHistory({ posProfile, user, limit = 50, includeAudit = false } = {}) {
  const filters = [];
  if (posProfile) filters.push(['pos_profile', '=', posProfile]);
  if (user) filters.push(['user', '=', user]);

  const [openRes, closeRes] = await Promise.all([
    listPOSOpeningEntries(filters, limit),
    listPOSClosingEntries(filters, limit),
  ]);

  const openings = (openRes?.data?.data || []).map((r) => ({
    type: 'opening',
    ...normalizeOpeningEntry(r),
  }));

  const closings = await Promise.all(
    (closeRes?.data?.data || []).map(async (r) => {
      if (includeAudit && r.name) {
        try {
          const res = await getPOSClosingEntryOperational(r.name);
          const doc = res?.data?.data;
          return {
            type: 'closing',
            ...normalizeClosingEntry(doc || r),
          };
        } catch {
          return { type: 'closing', ...normalizeClosingEntry(r) };
        }
      }
      return { type: 'closing', ...normalizeClosingEntry(r) };
    }),
  );

  return [...openings, ...closings].sort(
    (a, b) => new Date(b.creation || 0) - new Date(a.creation || 0),
  );
}

export async function resolveShiftContext({ preferredProfile, user } = {}) {
  const profile = await resolveActivePOSProfile(preferredProfile);
  const active = await getActiveShiftForUser({ posProfile: profile.name, user });
  return {
    profile,
    activeShift: active ? normalizeOpeningEntry(active) : null,
  };
}

export async function getPendingShiftClosings({ limit = 30 } = {}) {
  const res = await listPOSClosingEntries([['docstatus', '=', 0]], limit);
  const rows = res?.data?.data || [];
  const full = await Promise.all(
    rows.map(async (r) => {
      try {
        const resOp = await getPOSClosingEntryOperational(r.name);
        const operational = normalizeClosingEntry(resOp?.data?.data);
        try {
          const resAudit = await getPOSClosingEntryAudit(r.name);
          return normalizeClosingEntry(resAudit?.data?.data, { includeAudit: true }) || operational;
        } catch {
          return operational;
        }
      } catch {
        return normalizeClosingEntry(r);
      }
    }),
  );
  return full.filter((c) => c?.docstatus === 0);
}

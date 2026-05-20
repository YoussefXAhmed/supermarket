/**
 * Shift open/close/reconcile — ERPNext POS Opening/Closing Entry orchestration.
 */
import api from './api';
import {
  createPOSOpeningEntry,
  openPOSShiftOnServer,
  repairDraftOpeningEntriesOnServer,
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
  approvePOSClosingEntryOnServer,
  rejectPOSClosingEntryOnServer,
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
import { buildShiftSessions, needsManagerReview } from '../utils/shiftSessions';
import {
  createInvalidShiftSessionError,
  isInvalidShiftSessionError,
  INVALID_SHIFT_SESSION_MESSAGE,
} from '../utils/errorHandling';
import {
  validateOpenShift,
  validateCloseShift,
  validateManagerShiftSubmit,
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
    grand_total: roundMoney(doc.grand_total ?? 0),
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
  rejectedBy = '',
  requestedAt = '',
  approvedAt = '',
  rejectedAt = '',
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
  if (requestedAt) parts.push(`requested_at=${encodeURIComponent(requestedAt)}`);
  if (approvedBy) parts.push(`approved_by=${encodeURIComponent(approvedBy)}`);
  if (approvedAt) parts.push(`approved_at=${encodeURIComponent(approvedAt)}`);
  if (rejectedBy) parts.push(`rejected_by=${encodeURIComponent(rejectedBy)}`);
  if (rejectedAt) parts.push(`rejected_at=${encodeURIComponent(rejectedAt)}`);
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

  if (opening.docstatus !== 1) {
    throw createInvalidShiftSessionError();
  }

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
  } catch (e) {
    if (isInvalidShiftSessionError(e)) {
      throw createInvalidShiftSessionError(e);
    }
    /* fallback to client aggregation */
  }

  const client = await loadShiftSummaryClient(docRes?.data?.data);
  return { opening, ...client };
}

export { repairDraftOpeningEntriesOnServer };

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

  const remarks = payload.remarks;
  let name;
  let entry;

  try {
    const serverRes = await openPOSShiftOnServer({
      pos_profile: posProfile,
      company,
      user,
      opening_amount: openingAmount,
      mode_of_payment: modeOfPayment,
      remarks,
    });
    const data = serverRes?.data?.message || serverRes?.data;
    name = data?.name;
    if (!name || data?.docstatus !== 1) {
      throw new Error('POS Opening Entry was not submitted');
    }
    const docRes = await getPOSOpeningEntryOperational(name);
    entry = normalizeOpeningEntry(docRes?.data?.data);
  } catch (serverErr) {
    const res = await createPOSOpeningEntry(payload);
    name = res?.data?.data?.name;
    if (!name) throw new Error('Failed to create POS Opening Entry');
    await submitPOSOpeningEntry(name);
    const docRes = await getPOSOpeningEntryOperational(name);
    entry = normalizeOpeningEntry(docRes?.data?.data);
    if (entry?.docstatus !== 1) {
      throw serverErr?.isNormalized ? serverErr : new Error('POS Opening Entry was not submitted');
    }
  }

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
    approvalStatus: varianceResult.severity === 'approval_required' ? 'pending' : 'pending',
    requestedAt: new Date().toISOString(),
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

  const openerId = opener || closing.audit?.operator || closing.owner;
  validateManagerShiftSubmit({
    closingEntry: closing,
    approver,
    opener: openerId,
    canApprove,
  });

  // Use server-side approval method; REST docstatus submit often fails with 403
  // due to DocPerm/field-level restrictions on POS Closing Entry.
  await approvePOSClosingEntryOnServer({
    name: closingEntryName,
    notes: notes || closing.audit?.notes || '',
  });

  logActivity({
    type: ActivityType.SHIFT,
    action: 'shift_close_approved',
    user: approver,
    detail: { closing: closingEntryName, variance: closing.variance },
  });

  return loadClosing(closingEntryName, { includeAudit: true });
}

/**
 * Reject a draft closing — updates ERP remarks only (does not submit).
 */
export async function rejectShiftClosing({
  closingEntryName,
  approver,
  opener,
  canApprove = true,
  reason = '',
}) {
  const closing = await loadClosing(closingEntryName, { includeAudit: true });
  if (!closing) throw new Error('Closing entry not found');

  const openerId = opener || closing.audit?.operator || closing.owner;
  validateManagerShiftSubmit({
    closingEntry: closing,
    approver,
    opener: openerId,
    canApprove,
  });

  await rejectPOSClosingEntryOnServer({
    name: closingEntryName,
    reason: reason || closing.audit?.notes || '',
  });

  logActivity({
    type: ActivityType.SHIFT,
    action: 'shift_close_rejected',
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

/**
 * Shift sessions — opening + closing paired for history UI.
 */
export async function listShiftSessions({
  posProfile,
  user,
  limit = 80,
  enrichOpenSummaries = true,
} = {}) {
  const filters = [];
  if (posProfile) filters.push(['pos_profile', '=', posProfile]);
  if (user) filters.push(['user', '=', user]);

  const [openRes, closeRes] = await Promise.all([
    listPOSOpeningEntries(filters, limit),
    listPOSClosingEntries(filters, Math.max(limit, 80)),
  ]);

  const openings = (openRes?.data?.data || []).map((r) => normalizeOpeningEntry(r));

  const closings = await Promise.all(
    (closeRes?.data?.data || []).map(async (r) => {
      try {
        const resOp = await getPOSClosingEntryOperational(r.name);
        const doc = resOp?.data?.data || r;
        try {
          const resAudit = await getPOSClosingEntryAudit(r.name);
          return normalizeClosingEntry(resAudit?.data?.data || doc, { includeAudit: true });
        } catch {
          return normalizeClosingEntry(doc);
        }
      } catch {
        return normalizeClosingEntry(r);
      }
    }),
  );

  const sessions = buildShiftSessions(openings, closings);

  if (enrichOpenSummaries) {
    const enrichTargets = sessions.filter(
      (s) => s.openingName && (s.sessionStatus === 'open' || s.openingDocstatus === 0),
    );
    await Promise.all(
      enrichTargets.map(async (session) => {
        if (session.openingDocstatus === 0) {
          session.sessionInvalid = true;
          session.sessionInvalidMessage = INVALID_SHIFT_SESSION_MESSAGE;
          return;
        }
        try {
          const summary = await loadShiftSummary(session.openingName);
          session.invoicesCount = summary.invoiceCount ?? summary.salesCount ?? 0;
          session.salesTotal = roundMoney(summary.salesTotal ?? 0);
          session.expectedCash = roundMoney(summary.expectedCash ?? session.expectedCash);
        } catch (e) {
          if (isInvalidShiftSessionError(e)) {
            session.sessionInvalid = true;
            session.sessionInvalidMessage = INVALID_SHIFT_SESSION_MESSAGE;
          }
        }
      }),
    );
  }

  return sessions;
}

export function getPendingShiftSessions(sessions = []) {
  return sessions.filter((s) => needsManagerReview(s));
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

/** @deprecated Prefer getPendingShiftSessions(listShiftSessions()) */
export async function getPendingShiftClosings({ limit = 30 } = {}) {
  const sessions = await listShiftSessions({ limit });
  return getPendingShiftSessions(sessions).map((s) => s.closing).filter(Boolean);
}

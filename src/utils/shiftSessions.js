/**
 * Shift session model — pairs POS Opening + Closing Entry into one workflow row.
 */
import { calculateVariance, roundMoney } from './shiftCalculations';

export function parseSessionTimestamp(doc) {
  if (!doc) return null;
  const raw = doc.creation || doc.modified || doc.period_end_date || doc.period_start_date || doc.posting_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function deriveApprovalStatus({ closing, audit, varianceSeverity }) {
  if (!closing) return 'open';
  const status = audit?.approval_status || 'none';
  if (status === 'rejected') return 'rejected';
  if (closing.docstatus === 1) {
    if (status === 'approved' || status === 'auto' || status === 'none') return 'submitted';
    return 'submitted';
  }
  if (closing.docstatus === 0) {
    if (status === 'rejected') return 'rejected';
    return 'pending';
  }
  if (status === 'pending' || varianceSeverity === 'approval_required') return 'pending';
  if (status === 'approved') return 'approved';
  return 'pending';
}

export function deriveSessionStatus(session) {
  if (!session.closing) return 'open';
  if (session.approvalStatus === 'rejected') return 'rejected';
  if (session.closing.docstatus === 0) return 'pending_approval';
  if (session.approvalStatus === 'pending') return 'pending_approval';
  if (session.closing.docstatus === 1) return 'closed';
  return 'closing_draft';
}

/** Draft POS Closing Entry awaiting manager submit (not rejected, not submitted). */
export function isAwaitingSubmission(session) {
  const closing = session?.closing;
  if (!closing || closing.docstatus !== 0) return false;
  const audit = session.audit || closing.audit;
  const approvalStatus = audit?.approval_status || session.approvalStatus;
  return approvalStatus !== 'rejected';
}

/** @alias — used for KPIs and pending queue */
export function needsManagerReview(session) {
  return isAwaitingSubmission(session);
}

export function isSelfShiftAction(session, user) {
  const opener = session?.audit?.operator || session?.cashier;
  if (!opener || !user) return false;
  const ids = [user.name, user.email, user.full_name].filter(Boolean).map(String);
  return ids.some((id) => id === String(opener));
}

/**
 * Show Approve/Reject only when user may execute shift closing approval (accountant / admin).
 */
export function canActOnShiftSession(session, user, canExecuteShiftApproval) {
  if (!canExecuteShiftApproval || !isAwaitingSubmission(session)) return false;
  return !isSelfShiftAction(session, user);
}

/** @deprecated use canActOnShiftSession */
export function canManagerActOnSession(session, user, canExecuteShiftApproval) {
  return canActOnShiftSession(session, user, canExecuteShiftApproval);
}

export function buildApprovalTimeline(session) {
  const audit = session?.audit || session?.closing?.audit;
  const events = [];

  const requestedBy = audit?.operator || session?.cashier;
  const requestedAt =
    audit?.requested_at || session?.closedAt || session?.closing?.creation || null;
  if (requestedBy || requestedAt) {
    events.push({
      key: 'requested',
      label: 'Requested by',
      actor: requestedBy || '—',
      at: requestedAt,
    });
  }

  if (audit?.approval_status === 'approved' || audit?.approved_by || session?.closing?.docstatus === 1) {
    events.push({
      key: 'approved',
      label: 'Approved by',
      actor: audit?.approved_by || '—',
      at: audit?.approved_at || session?.closing?.modified || null,
    });
  }

  if (audit?.approval_status === 'rejected' || audit?.rejected_by) {
    events.push({
      key: 'rejected',
      label: 'Rejected by',
      actor: audit?.rejected_by || '—',
      at: audit?.rejected_at || session?.closing?.modified || null,
    });
  }

  return events;
}

export function buildShiftSession(opening, closing = null) {
  const audit = closing?.audit || opening?.audit || null;
  const expectedCash = closing
    ? roundMoney(closing.expectedCash)
    : roundMoney(opening?.openingCash ?? 0);
  const countedCash = closing ? roundMoney(closing.actualCash) : null;
  const variance = closing ? roundMoney(closing.variance) : 0;
  const varianceSeverity =
    closing && countedCash != null
      ? calculateVariance(expectedCash, countedCash).severity
      : 'ok';

  const salesCount = Number(audit?.sales_count ?? closing?.salesCount ?? 0) || 0;
  const auditSalesTotal =
    audit?.sales_total != null && audit.sales_total !== ''
      ? roundMoney(audit.sales_total)
      : null;
  // POS Closing Entry grand_total is cash reconciliation, not shift sales — never use it here.
  const salesTotal = roundMoney(closing?.salesTotal ?? auditSalesTotal ?? 0);

  const approvalStatus = deriveApprovalStatus({ closing, audit, varianceSeverity });

  const session = {
    id: opening?.name || closing?.pos_opening_entry || closing?.name,
    openingName: opening?.name || closing?.pos_opening_entry || null,
    closingName: closing?.name || null,
    cashier: opening?.user || opening?.owner || closing?.user || closing?.owner || '—',
    register: opening?.pos_profile || closing?.pos_profile || '—',
    company: opening?.company || closing?.company,
    openedAt: parseSessionTimestamp(opening) || parseSessionTimestamp(closing),
    closedAt: closing ? parseSessionTimestamp(closing) : null,
    periodStart: opening?.period_start_date || closing?.period_start_date,
    periodEnd: closing?.period_end_date || closing?.posting_date,
    invoicesCount: salesCount,
    salesTotal,
    expectedCash,
    countedCash,
    variance,
    varianceSeverity,
    approvalStatus,
    audit,
    opening,
    closing,
    openingDocstatus: opening?.docstatus,
    closingDocstatus: closing?.docstatus,
  };

  session.sessionStatus = deriveSessionStatus(session);
  session.needsReview = needsManagerReview(session);
  session.awaitingSubmission = isAwaitingSubmission(session);
  session.timeline = buildApprovalTimeline(session);
  return session;
}

/**
 * @param {Array} openings normalized opening entries
 * @param {Array} closings normalized closing entries (may include audit)
 */
export function buildShiftSessions(openings = [], closings = []) {
  const closingByOpening = new Map();
  const orphanClosings = [];

  for (const c of closings) {
    if (c?.pos_opening_entry) {
      closingByOpening.set(c.pos_opening_entry, c);
    } else {
      orphanClosings.push(c);
    }
  }

  const usedClosingNames = new Set();
  const sessions = [];

  for (const opening of openings) {
    const closing = closingByOpening.get(opening.name) || null;
    if (closing?.name) usedClosingNames.add(closing.name);
    sessions.push(buildShiftSession(opening, closing));
  }

  for (const c of closings) {
    if (usedClosingNames.has(c.name)) continue;
    const opening = openings.find((o) => o.name === c.pos_opening_entry);
    if (!opening) sessions.push(buildShiftSession(null, c));
  }

  for (const c of orphanClosings) {
    if (!usedClosingNames.has(c.name)) {
      sessions.push(buildShiftSession(null, c));
    }
  }

  return sessions.sort((a, b) => {
    const ta = new Date(a.openedAt || a.closedAt || 0).getTime();
    const tb = new Date(b.openedAt || b.closedAt || 0).getTime();
    return tb - ta;
  });
}

export function isSessionToday(session, todayIso = new Date().toISOString().slice(0, 10)) {
  const dates = [session.periodStart, session.periodEnd, session.openedAt, session.closedAt]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 10));
  return dates.some((d) => d === todayIso);
}

export function computeShiftHistoryKpis(sessions = []) {
  const today = new Date().toISOString().slice(0, 10);
  let openShifts = 0;
  let pendingApprovals = 0;
  let totalSalesToday = 0;
  let totalVariance = 0;

  for (const s of sessions) {
    if (s.sessionStatus === 'open') openShifts += 1;
    if (s.awaitingSubmission) pendingApprovals += 1;
    if (!isSessionToday(s, today)) continue;

    // Open shifts accrue live sales; closed shifts count only after manager submit (docstatus 1).
    // Pending draft closings are excluded so "Sales today" increases when a shift is approved.
    const countsForSalesToday =
      s.sessionStatus === 'open' || s.closing?.docstatus === 1;
    if (countsForSalesToday) {
      totalSalesToday = roundMoney(totalSalesToday + (s.salesTotal || 0));
    }
    if (s.closing?.docstatus === 1) {
      totalVariance = roundMoney(totalVariance + Math.abs(s.variance || 0));
    }
  }

  return { openShifts, pendingApprovals, totalSalesToday, totalVariance };
}

const STATUS_FILTER_MAP = {
  open: (s) => s.sessionStatus === 'open',
  pending: (s) => s.awaitingSubmission,
  submitted: (s) => s.closing?.docstatus === 1,
  rejected: (s) => s.approvalStatus === 'rejected',
  draft: (s) => s.closing?.docstatus === 0 && !s.awaitingSubmission,
};

export function filterShiftSessions(sessions = [], filters = {}) {
  const { cashier, status, date, register } = filters;
  let out = sessions;

  if (register) {
    out = out.filter((s) => s.register === register);
  }
  if (cashier) {
    out = out.filter((s) => s.cashier === cashier);
  }
  if (date) {
    const d = String(date).slice(0, 10);
    out = out.filter((s) => {
      const start = String(s.periodStart || '').slice(0, 10);
      const end = String(s.periodEnd || '').slice(0, 10);
      const opened = s.openedAt ? String(s.openedAt).slice(0, 10) : '';
      const closed = s.closedAt ? String(s.closedAt).slice(0, 10) : '';
      return start === d || end === d || opened === d || closed === d;
    });
  }
  if (status && status !== 'all' && STATUS_FILTER_MAP[status]) {
    out = out.filter(STATUS_FILTER_MAP[status]);
  }

  return out;
}

export function collectFilterOptions(sessions = []) {
  const cashiers = new Set();
  const registers = new Set();
  for (const s of sessions) {
    if (s.cashier) cashiers.add(s.cashier);
    if (s.register) registers.add(s.register);
  }
  return {
    cashiers: [...cashiers].sort(),
    registers: [...registers].sort(),
  };
}

/**
 * ERPNext POS shift documents — Opening/Closing Entry + aggregated summaries.
 * Field lists are split so cashiers never query `remarks` (ERP field-level perm).
 */
import api from './api';
import { submitPosOpeningEntryOnServer } from './erpSubmitApi';

/** List / compact queries — no remarks, no child tables */
const OPENING_LIST_FIELDS = [
  'name',
  'pos_profile',
  'company',
  'period_start_date',
  'posting_date',
  'status',
  'docstatus',
  'user',
  'owner',
  'creation',
  'modified',
];

const CLOSING_LIST_FIELDS = [
  'name',
  'pos_profile',
  'company',
  'pos_opening_entry',
  'period_start_date',
  'period_end_date',
  'posting_date',
  'status',
  'docstatus',
  'user',
  'owner',
  'creation',
  'modified',
  'grand_total',
];

/** Cashier open/close/POS — balance + reconciliation, no remarks */
const OPENING_OPERATIONAL_FIELDS = [...OPENING_LIST_FIELDS, 'balance_details'];

const CLOSING_OPERATIONAL_FIELDS = [...CLOSING_LIST_FIELDS, 'payment_reconciliation'];

/** Manager audit detail only */
const OPENING_AUDIT_FIELDS = [...OPENING_OPERATIONAL_FIELDS, 'remarks'];

const CLOSING_AUDIT_FIELDS = [...CLOSING_OPERATIONAL_FIELDS, 'remarks'];

function resourceGet(doctype, name, fields) {
  return api.get(`/api/resource/${doctype}/${encodeURIComponent(name)}`, {
    params: { fields: JSON.stringify(fields) },
  });
}

export const listPOSOpeningEntries = (filters = [], limit = 20, { silent = false } = {}) =>
  api.get('/api/resource/POS Opening Entry', {
    silentApi: silent,
    params: {
      fields: JSON.stringify(OPENING_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'creation desc',
      limit_page_length: limit,
    },
  });

export const listPOSClosingEntries = (filters = [], limit = 20, { silent = false } = {}) =>
  api.get('/api/resource/POS Closing Entry', {
    silentApi: silent,
    params: {
      fields: JSON.stringify(CLOSING_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'creation desc',
      limit_page_length: limit,
    },
  });

export async function getDraftClosingForOpening(openingName) {
  if (!openingName) return null;
  try {
    const res = await listPOSClosingEntries(
      [['pos_opening_entry', '=', openingName], ['docstatus', '=', 0]],
      1,
      { silent: true },
    );
    return res?.data?.data?.[0] || null;
  } catch {
    return null;
  }
}

export const getPOSOpeningEntryOperational = (name) =>
  resourceGet('POS Opening Entry', name, OPENING_OPERATIONAL_FIELDS);

export const getPOSOpeningEntryAudit = (name) =>
  resourceGet('POS Opening Entry', name, OPENING_AUDIT_FIELDS);

export const createPOSOpeningEntry = (payload) =>
  api.post('/api/resource/POS Opening Entry', payload);

/** Server insert() + submit() — preferred open path */
export const openPOSShiftOnServer = ({
  pos_profile,
  company,
  user,
  opening_amount = 0,
  mode_of_payment = 'Cash',
  remarks,
}) =>
  api.post('/api/method/elmahdi.api.shifts.open_pos_shift', {
    pos_profile,
    company,
    user: user || undefined,
    opening_amount,
    mode_of_payment,
    remarks: remarks || '',
  });

export const repairDraftOpeningEntriesOnServer = (dryRun = true) =>
  api.post('/api/method/elmahdi.api.shifts.repair_draft_opening_entries', {
    dry_run: dryRun ? 1 : 0,
  });

const SUBMIT_OPENING_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Submit draft opening via native ERPNext submit (server method only).
 */
export async function submitPOSOpeningEntry(name) {
  if (!name) throw new Error('Opening entry name required');

  const loadDoc = async () => {
    const res = await getPOSOpeningEntryOperational(name);
    return res?.data?.data;
  };

  const existing = await loadDoc().catch(() => null);
  if (existing?.docstatus === 1) return existing;

  let lastErr;
  for (let i = 0; i <= SUBMIT_OPENING_RETRIES; i += 1) {
    try {
      const res = await submitPosOpeningEntryOnServer(name);
      const msg = res?.data?.message || res?.data;
      if (msg?.docstatus === 1) return msg;
      const doc = await loadDoc();
      if (doc?.docstatus === 1) return doc;
    } catch (e) {
      lastErr = e;
      if (i < SUBMIT_OPENING_RETRIES) await sleep(400);
    }
  }
  throw lastErr || new Error(`Failed to submit POS Opening Entry ${name}`);
}

export const getPOSClosingEntryOperational = (name) =>
  resourceGet('POS Closing Entry', name, CLOSING_OPERATIONAL_FIELDS);

export const getPOSClosingEntryAudit = (name) =>
  resourceGet('POS Closing Entry', name, CLOSING_AUDIT_FIELDS);

export const createPOSClosingEntry = (payload) =>
  api.post('/api/resource/POS Closing Entry', payload);

/** Manager/Accountant approval: server sets audit + submits (bypasses REST docstatus perms). */
export const approvePOSClosingEntryOnServer = ({ name, notes = '' }) =>
  api.post('/api/method/elmahdi.api.pos_closing_approval.approve_pos_closing_entry', {
    name,
    notes: notes || '',
  });

/** Server-side shift aggregates (preferred). */
export const fetchShiftSummaryFromERP = (posOpeningEntry) =>
  api.get('/api/method/elmahdi.api.shifts.get_shift_summary', {
    params: { pos_opening_entry: posOpeningEntry },
    silentApi: true,
  });

/** Server-built closing draft with reconciliation rows. */
export const prepareClosingEntryFromERP = ({ posOpeningEntry, actualCash, notes, paymentCounts }) =>
  api.post('/api/method/elmahdi.api.shifts.prepare_closing_entry', {
    pos_opening_entry: posOpeningEntry,
    actual_cash: actualCash,
    notes: notes || '',
    payment_counts: paymentCounts ? JSON.stringify(paymentCounts) : undefined,
  });

/** Manager/Accountant reject: server sets audit only (keeps draft). */
export const rejectPOSClosingEntryOnServer = ({ name, reason = '' }) =>
  api.post('/api/method/elmahdi.api.pos_closing_approval.reject_pos_closing_entry', {
    name,
    notes: reason || '',
  });

export const listShiftPOSInvoices = ({ posProfile, fromDate, owner, limit = 500 }) => {
  const filters = [
    ['docstatus', '=', 1],
    ['is_pos', '=', 1],
    ['pos_profile', '=', posProfile],
    ['posting_date', '>=', fromDate],
  ];
  if (owner) filters.push(['owner', '=', owner]);
  return api.get('/api/resource/POS Invoice', {
    params: {
      fields: JSON.stringify([
        'name',
        'grand_total',
        'posting_date',
        'owner',
        'is_return',
        'return_against',
        'status',
        'docstatus',
        'customer',
      ]),
      filters: JSON.stringify(filters),
      limit_page_length: limit,
    },
  });
};

export const listVoidedShiftPOSInvoices = ({ posProfile, fromDate, owner, limit = 100 }) => {
  const filters = [
    ['docstatus', '=', 2],
    ['is_pos', '=', 1],
    ['pos_profile', '=', posProfile],
    ['posting_date', '>=', fromDate],
  ];
  if (owner) filters.push(['owner', '=', owner]);
  return api.get('/api/resource/POS Invoice', {
    params: {
      fields: JSON.stringify(['name', 'grand_total', 'posting_date', 'owner', 'status']),
      filters: JSON.stringify(filters),
      limit_page_length: limit,
    },
  });
};

export async function getOpenPOSOpeningEntry(posProfile, user) {
  const filters = [
    ['pos_profile', '=', posProfile],
    ['docstatus', '=', 1],
  ];
  if (user) filters.push(['user', '=', user]);

  const res = await listPOSOpeningEntries(filters, 15);
  const rows = (res?.data?.data || []).filter((r) => !r.status || r.status === 'Open');
  const opening = rows[0] || null;
  if (!opening?.name) return null;

  const draftClosing = await getDraftClosingForOpening(opening.name);
  if (draftClosing) {
    return {
      ...opening,
      pendingClose: true,
      draftClosingName: draftClosing.name,
      status: 'Pending Close',
    };
  }
  return opening;
}

export async function getActiveShiftForUser({ posProfile, user }) {
  if (!posProfile) return null;
  const row = await getOpenPOSOpeningEntry(posProfile, user);
  if (!row?.name) return null;
  const docRes = await getPOSOpeningEntryOperational(row.name);
  return docRes?.data?.data || row;
}

/**
 * ERPNext POS shift documents — Opening/Closing Entry + aggregated summaries.
 * Field lists are split so cashiers never query `remarks` (ERP field-level perm).
 */
import api from './api';

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

export const listPOSOpeningEntries = (filters = [], limit = 20) =>
  api.get('/api/resource/POS Opening Entry', {
    params: {
      fields: JSON.stringify(OPENING_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'creation desc',
      limit_page_length: limit,
    },
  });

export const getPOSOpeningEntryOperational = (name) =>
  resourceGet('POS Opening Entry', name, OPENING_OPERATIONAL_FIELDS);

export const getPOSOpeningEntryAudit = (name) =>
  resourceGet('POS Opening Entry', name, OPENING_AUDIT_FIELDS);

export const createPOSOpeningEntry = (payload) =>
  api.post('/api/resource/POS Opening Entry', payload);

export const submitPOSOpeningEntry = (name) =>
  api.put(`/api/resource/POS Opening Entry/${encodeURIComponent(name)}`, { docstatus: 1 });

export const listPOSClosingEntries = (filters = [], limit = 20) =>
  api.get('/api/resource/POS Closing Entry', {
    params: {
      fields: JSON.stringify(CLOSING_LIST_FIELDS),
      filters: JSON.stringify(filters),
      order_by: 'creation desc',
      limit_page_length: limit,
    },
  });

export const getPOSClosingEntryOperational = (name) =>
  resourceGet('POS Closing Entry', name, CLOSING_OPERATIONAL_FIELDS);

export const getPOSClosingEntryAudit = (name) =>
  resourceGet('POS Closing Entry', name, CLOSING_AUDIT_FIELDS);

export const createPOSClosingEntry = (payload) =>
  api.post('/api/resource/POS Closing Entry', payload);

export const submitPOSClosingEntry = (name) =>
  api.put(`/api/resource/POS Closing Entry/${encodeURIComponent(name)}`, { docstatus: 1 });

/** Server-side shift aggregates (preferred). */
export const fetchShiftSummaryFromERP = (posOpeningEntry) =>
  api.get('/api/method/elmahdi.api.shifts.get_shift_summary', {
    params: { pos_opening_entry: posOpeningEntry },
  });

/** Server-built closing draft with reconciliation rows. */
export const prepareClosingEntryFromERP = ({ posOpeningEntry, actualCash, notes, paymentCounts }) =>
  api.post('/api/method/elmahdi.api.shifts.prepare_closing_entry', {
    pos_opening_entry: posOpeningEntry,
    actual_cash: actualCash,
    notes: notes || '',
    payment_counts: paymentCounts ? JSON.stringify(paymentCounts) : undefined,
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
  return rows[0] || null;
}

export async function getActiveShiftForUser({ posProfile, user }) {
  if (!posProfile) return null;
  const row = await getOpenPOSOpeningEntry(posProfile, user);
  if (!row?.name) return null;
  const docRes = await getPOSOpeningEntryOperational(row.name);
  return docRes?.data?.data || row;
}

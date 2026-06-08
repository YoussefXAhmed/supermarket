/**
 * HR Leave Management — thin client over elmahdi.api.hr_leave.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.hr_leave';

export const LEAVE_STATUSES = ['Open', 'Approved', 'Rejected'];

export async function listLeaveApplications({ status, employee, leaveType, dateFrom, dateTo, branch, limit } = {}) {
  const res = await api.get(`${BASE}.list_leave_applications`, {
    params: {
      status: status || undefined,
      employee: employee || undefined,
      leave_type: leaveType || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      branch: branch || undefined,
      limit: limit || 200,
    },
  });
  return res.data?.message || [];
}

export async function getLeaveKpis() {
  const res = await api.get(`${BASE}.get_leave_kpis`);
  return res.data?.message || { pending: 0, approved_month: 0, rejected_month: 0, on_leave_today: 0 };
}

export async function listLeaveTypes() {
  const res = await api.get(`${BASE}.list_leave_types`);
  return res.data?.message || [];
}

export async function getLeaveBalance({ employee, leaveType } = {}) {
  const res = await api.get(`${BASE}.get_leave_balance`, {
    params: { employee, leave_type: leaveType || undefined },
  });
  return res.data?.message || {};
}

export async function submitLeaveApplication({ employee, leaveType, fromDate, toDate, description }) {
  const res = await api.post(`${BASE}.submit_leave_application`, {
    employee,
    leave_type: leaveType,
    from_date: fromDate,
    to_date: toDate,
    description: description || undefined,
  });
  return res.data?.message;
}

export async function decideLeaveApplication({ name, decision, notes }) {
  const res = await api.post(`${BASE}.decide_leave_application`, {
    name,
    decision,
    notes: notes || undefined,
  });
  return res.data?.message;
}

// ── Phase 4.b — batch decide endpoint (Leave Requests) ───────────────────
//
// `items` is a list of leave-application names. `decision` is the
// uniform decision applied to every row ("Approved" or "Rejected").
// `notes` is the optional decision footer applied to every row.
//
// Returns the standard run_row_batch envelope:
//   { audit_id, total, succeeded, failed, results: [{name, ok, error?, decision, status}] }
//
// Pass an empty `items` list and the call short-circuits to a zero-row
// envelope without touching the network.
export async function batchDecideLeaveApplications({ items, decision, notes } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return { audit_id: null, total: 0, succeeded: 0, failed: 0, results: [] };
  }
  if (decision !== 'Approved' && decision !== 'Rejected') {
    throw new Error('decision must be "Approved" or "Rejected"');
  }
  const res = await api.post(`${BASE}.batch_decide_leave_applications`, {
    items: list,
    decision,
    notes: notes || '',
  });
  return res.data?.message || { results: [], total: 0, succeeded: 0, failed: 0 };
}

export async function cancelLeaveApplication(name) {
  const res = await api.post(`${BASE}.cancel_leave_application`, { name });
  return res.data?.message;
}

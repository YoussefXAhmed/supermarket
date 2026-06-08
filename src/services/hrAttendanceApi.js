/**
 * HR Attendance — thin client over elmahdi.api.hr_attendance.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.hr_attendance';

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Half Day', 'On Leave'];

export async function listAttendance({ dateFrom, dateTo, branch, employee, status, limit } = {}) {
  const res = await api.get(`${BASE}.list_attendance`, {
    params: {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      branch: branch || undefined,
      employee: employee || undefined,
      status: status || undefined,
      limit: limit || 500,
    },
  });
  return res.data?.message || [];
}

export async function getAttendanceKpis({ date } = {}) {
  const res = await api.get(`${BASE}.get_attendance_kpis`, {
    params: { date: date || undefined },
  });
  return res.data?.message || { present: 0, absent: 0, late: 0, on_leave: 0, half_day: 0, employees: 0 };
}

export async function markAttendance({ employee, attendanceDate, status, inTime, outTime }) {
  const res = await api.post(`${BASE}.mark_attendance`, {
    employee,
    attendance_date: attendanceDate,
    status,
    in_time: inTime || undefined,
    out_time: outTime || undefined,
  });
  return res.data?.message;
}

export async function bulkMarkAttendance({ attendanceDate, defaultStatus, branch, overrides }) {
  const res = await api.post(`${BASE}.bulk_mark_attendance`, {
    attendance_date: attendanceDate,
    default_status: defaultStatus || 'Present',
    branch: branch || undefined,
    overrides: JSON.stringify(overrides || {}),
  });
  return res.data?.message;
}

export async function deleteAttendance(name) {
  const res = await api.post(`${BASE}.delete_attendance`, { name });
  return res.data?.message;
}

// ── Phase 4.b — batch endpoints (Attendance) ────────────────────────────
//
// Both helpers short-circuit on an empty `items` list without hitting
// the network. Returns the standard run_row_batch envelope.

export async function batchUpdateAttendanceStatus({ items, status } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return { audit_id: null, total: 0, succeeded: 0, failed: 0, results: [] };
  }
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw new Error('status must be one of: ' + ATTENDANCE_STATUSES.join(', '));
  }
  const res = await api.post(`${BASE}.batch_update_attendance_status`, {
    items: list,
    status,
  });
  return res.data?.message || { results: [], total: 0, succeeded: 0, failed: 0 };
}

export async function batchDeleteAttendance({ items } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) {
    return { audit_id: null, total: 0, succeeded: 0, failed: 0, results: [] };
  }
  const res = await api.post(`${BASE}.batch_delete_attendance`, {
    items: list,
  });
  return res.data?.message || { results: [], total: 0, succeeded: 0, failed: 0 };
}

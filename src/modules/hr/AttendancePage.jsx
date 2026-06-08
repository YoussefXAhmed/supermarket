/**
 * /hr/attendance — daily attendance management.
 *
 * Layout:
 *   • PageHeader with "Mark today" CTA (HR only).
 *   • 4 KPI cards: Present / Absent / Late / On Leave for the selected date.
 *   • Filter bar: date range, branch, employee, status.
 *   • Table: one row per Attendance record.
 *   • Bulk-mark modal: lists all active employees in the chosen branch,
 *     defaults each row to Present, lets HR override per-row.
 *
 * Permissions:
 *   • Read: HR + Store Manager + Admin + employee self-service.
 *     Row-level scoping in row_scoping.py enforces the data set.
 *   • Write: HR + Admin only. The "Mark today" CTA and per-row edit
 *     buttons hide for everyone else.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Badge,
  BatchResultToast,
  Btn,
  BulkActionBar,
  EmptyState,
  PageHeader,
  PageLoading,
  StatCard,
  Modal,
  Table,
  ConfirmDialog,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { useNotify } from '../../context/NotificationContext';
import { useSelection } from '../../hooks/useSelection';
import {
  ATTENDANCE_STATUSES,
  listAttendance,
  getAttendanceKpis,
  markAttendance,
  bulkMarkAttendance,
  deleteAttendance,
  batchUpdateAttendanceStatus,
  batchDeleteAttendance,
} from '../../services/hrAttendanceApi';
import {
  listBranches,
  listEmployees,
} from '../../services/hrEmployeeApi';
import { fmtDate } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const STATUS_TONE = {
  Present:   'green',
  Absent:    'red',
  Late:      'amber',
  'Half Day': 'blue',
  'On Leave': 'default',
};

function todayStr() { return new Date().toISOString().slice(0, 10); }

function StatusBadge({ status, t }) {
  if (!status) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <Badge color={STATUS_TONE[status] || 'default'}>
      {t(`hr.attendance.status.${status.replace(' ', '')}`, { defaultValue: status })}
    </Badge>
  );
}

export default function AttendancePage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const canManage = Boolean(capabilities?.canManageAttendance || capabilities?.canManageSystem);

  // Today's KPI bar — independent of the table date filter so the
  // dashboard-style "today's status" stays accurate even while the user
  // explores past dates in the table.
  const [kpis, setKpis] = useState(null);
  const [kpisDate, setKpisDate] = useState(todayStr());

  // Filters for the table.
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo,   setDateTo]   = useState(todayStr());
  const [branchFilter, setBranchFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Picklists.
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Mark-today modal.
  const [markOpen, setMarkOpen] = useState(false);
  const [markBranch, setMarkBranch] = useState('');
  const [markDate, setMarkDate] = useState(todayStr());
  const [markRows, setMarkRows] = useState([]); // [{employee, employee_name, status}]
  const [markBusy, setMarkBusy] = useState(false);

  // Delete confirm.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Phase 4.b — batch operations on selected rows. Selection is keyed
  // by the Attendance row name and stable across the load() refetch
  // that runs after every successful batch action.
  const attendanceSelection = useSelection({
    items: rows,
    getId: (row) => row?.name,
  });
  const [batchInFlight, setBatchInFlight] = useState(false);
  const [batchStatusTarget, setBatchStatusTarget] = useState(null); // 'Present' | 'Absent' | 'Late' | 'Half Day' | 'On Leave'
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // Initial picklist load.
  useEffect(() => {
    listBranches().then(setBranches).catch(() => setBranches([]));
    listEmployees({ limit: 500, status: 'Active' }).then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const [hrmsMissing, setHrmsMissing] = useState(false);

  const loadKpis = useCallback(() => {
    getAttendanceKpis({ date: kpisDate })
      .then((data) => {
        setKpis(data);
        setHrmsMissing(Boolean(data?.hrms_not_installed));
      })
      .catch(() => setKpis(null));
  }, [kpisDate]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAttendance({
        dateFrom,
        dateTo,
        branch: branchFilter,
        employee: employeeFilter,
        status: statusFilter,
        limit: 500,
      });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchFilter, employeeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openMarkToday = () => {
    setMarkBranch(branchFilter || '');
    setMarkDate(todayStr());
    setMarkRows(employees
      .filter((e) => !branchFilter || e.branch === branchFilter)
      .map((e) => ({ employee: e.id, employee_name: e.full_name, status: 'Present' })),
    );
    setMarkOpen(true);
  };

  // When the user picks a branch in the modal, refilter the employee list.
  useEffect(() => {
    if (!markOpen) return;
    setMarkRows(employees
      .filter((e) => !markBranch || e.branch === markBranch)
      .map((e) => ({ employee: e.id, employee_name: e.full_name, status: 'Present' })),
    );
  }, [markBranch, markOpen, employees]);

  const submitMarkToday = async () => {
    if (!markRows.length) return;
    setMarkBusy(true);
    try {
      const overrides = {};
      for (const r of markRows) {
        if (r.status && r.status !== 'Present') overrides[r.employee] = r.status;
      }
      const res = await bulkMarkAttendance({
        attendanceDate: markDate,
        defaultStatus: 'Present',
        branch: markBranch || undefined,
        overrides,
      });
      const okCount = (res?.results || []).filter((r) => r.ok).length;
      const failCount = (res?.results || []).length - okCount;
      notify.success(
        t('hr.attendance.markTodaySuccess', {
          defaultValue: '{{ok}} record(s) saved; {{fail}} failed.',
          ok: okCount,
          fail: failCount,
        }),
      );
      setMarkOpen(false);
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setMarkBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAttendance(deleteTarget.name);
      notify.success(t('hr.attendance.deleted', { defaultValue: 'Attendance record removed.' }));
      setDeleteTarget(null);
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  // ── Phase 4.b — batch handlers ──────────────────────────────────────
  //
  // Two operations on the selected rows:
  //   • Set status to X — for end-of-day fixes (e.g. mark 6 employees
  //     who came in late as "Late" in one shot). Inherits the existing
  //     mark_attendance amend/cancel-and-resubmit semantics per row.
  //   • Delete N — removes selected attendance records. Cancellation
  //     cascade preserved.
  //
  // We don't optimistic-update because each row goes through ERPNext's
  // submit/amend dance — the result envelope tells us per-row exactly
  // what happened.
  const reportBatchResult = (result, kind /* 'updated' | 'deleted' */, opts = {}) => {
    if (!result) return;
    const errors = (result.results || [])
      .filter((r) => !r.ok)
      .map((r) => ({ id: r.name, message: r.error || t('common.unknownError', { defaultValue: 'Unknown error' }) }));
    const headline = kind === 'updated'
      ? t('hr.attendance.batchUpdateHeadline', {
          defaultValue: '{{succeeded}} of {{total}} updated to {{status}}',
          succeeded: result.succeeded,
          total: result.total,
          status: opts.status || '',
        })
      : t('hr.attendance.batchDeleteHeadline', {
          defaultValue: '{{succeeded}} of {{total}} deleted',
          succeeded: result.succeeded,
          total: result.total,
        });
    const toast = (
      <BatchResultToast
        total={result.total}
        succeeded={result.succeeded}
        failed={result.failed}
        errors={errors}
        headline={headline}
        initiallyOpen={result.failed > 0 && result.failed <= 3}
      />
    );
    if (result.failed > 0) notify.warning(toast, { duration: 9000 });
    else notify.success(toast, { duration: 5000 });
  };

  const onBatchSetStatus = async () => {
    const status = batchStatusTarget;
    const ids = attendanceSelection.selectedIds;
    if (!status || !ids.length || batchInFlight) return;
    setBatchInFlight(true);
    try {
      const result = await batchUpdateAttendanceStatus({ items: ids, status });
      reportBatchResult(result, 'updated', { status });
      attendanceSelection.clear();
      setBatchStatusTarget(null);
      await Promise.all([load(), loadKpis()]);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setBatchInFlight(false);
    }
  };

  const onBatchDelete = async () => {
    const ids = attendanceSelection.selectedIds;
    if (!ids.length || batchInFlight) return;
    setBatchInFlight(true);
    try {
      const result = await batchDeleteAttendance({ items: ids });
      reportBatchResult(result, 'deleted');
      attendanceSelection.clear();
      setBatchDeleteConfirm(false);
      await Promise.all([load(), loadKpis()]);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setBatchInFlight(false);
    }
  };

  const columns = useMemo(() => {
    const checkboxColumn = canManage && rows.length > 0
      ? {
          key: '__select__',
          label: (
            <input
              type="checkbox"
              className="row-checkbox"
              aria-label={t('hr.attendance.selectAll', { defaultValue: 'Select all attendance rows' })}
              checked={attendanceSelection.allSelected}
              ref={(el) => { if (el) el.indeterminate = attendanceSelection.someSelected; }}
              onChange={attendanceSelection.toggleAll}
            />
          ),
          render: (_v, row) => (
            <input
              type="checkbox"
              className="row-checkbox"
              aria-label={t('hr.attendance.selectRow', { defaultValue: 'Select {{name}}', name: row.name })}
              checked={attendanceSelection.isSelected(row.name)}
              disabled={batchInFlight}
              onChange={() => attendanceSelection.toggle(row.name)}
            />
          ),
        }
      : null;
    const baseCols = [
    { key: 'attendance_date', label: t('hr.attendance.colDate', { defaultValue: 'Date' }),
      render: (v) => fmtDate(v) },
    { key: 'employee_name', label: t('hr.attendance.colEmployee', { defaultValue: 'Employee' }),
      render: (v, r) => <span>{v || r.employee}</span> },
    { key: 'branch', label: t('hr.attendance.colBranch', { defaultValue: 'Branch' }),
      render: (v) => v ? <Badge color="default">{v}</Badge>
                       : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'status', label: t('hr.attendance.colStatus', { defaultValue: 'Status' }),
      render: (v) => <StatusBadge status={v} t={t} /> },
    { key: 'in_time', label: t('hr.attendance.colIn', { defaultValue: 'In' }),
      render: (v) => v ? new Date(v).toLocaleTimeString() : '—' },
    { key: 'out_time', label: t('hr.attendance.colOut', { defaultValue: 'Out' }),
      render: (v) => v ? new Date(v).toLocaleTimeString() : '—' },
    ...(canManage ? [{
      key: 'actions',
      label: t('ui.table.actions', { defaultValue: 'Actions' }),
      render: (_v, row) => (
        <Btn variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
          {t('common.remove', { defaultValue: 'Remove' })}
        </Btn>
      ),
    }] : []),
    ];
    return checkboxColumn ? [checkboxColumn, ...baseCols] : baseCols;
  }, [canManage, t, rows.length, attendanceSelection, batchInFlight]);

  return (
    <TablePageLayout>
      <PageHeader
        title={t('hr.attendance.title', { defaultValue: 'Attendance' })}
        subtitle={t('hr.attendance.subtitle', {
          defaultValue: 'Daily attendance records and KPIs',
        })}
        dense
        actions={canManage ? (
          <Btn variant="primary" size="sm" onClick={openMarkToday}>
            {t('hr.attendance.markToday', { defaultValue: 'Mark today' })}
          </Btn>
        ) : null}
      />

      {hrmsMissing && (
        <LayoutSection variant="raised" flushHead>
          <div className="login-error" role="alert" style={{ margin: 0 }}>
            <strong>{t('hr.attendance.hrmsMissingTitle', { defaultValue: 'HR Management app is not installed.' })}</strong>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
              {t('hr.attendance.hrmsMissingDesc', {
                defaultValue: 'Attendance, Leave and Payroll require the `hrms` app. Run from the bench root: bench get-app hrms && bench --site SITE install-app hrms && bench --site SITE migrate',
              })}
            </p>
          </div>
        </LayoutSection>
      )}

      {/* KPI strip — uses its own date so a HR officer browsing past records
          still sees TODAY's status at a glance. */}
      <section className="layout-grid layout-grid--kpi" aria-label="Attendance KPIs">
        <StatCard
          label={t('hr.attendance.kpi.present', { defaultValue: 'Present' })}
          value={kpis?.present ?? '…'}
          icon="✓" color="green" compact
        />
        <StatCard
          label={t('hr.attendance.kpi.absent', { defaultValue: 'Absent' })}
          value={kpis?.absent ?? '…'}
          icon="✕" color="red" compact
        />
        <StatCard
          label={t('hr.attendance.kpi.late', { defaultValue: 'Late' })}
          value={kpis?.late ?? '…'}
          icon="⏰" color="amber" compact
        />
        <StatCard
          label={t('hr.attendance.kpi.onLeave', { defaultValue: 'On leave' })}
          value={kpis?.on_leave ?? '…'}
          icon="🏖" color="blue" compact
        />
      </section>

      <LayoutSection variant="flat" flushHead>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="input" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label={t('hr.attendance.from', { defaultValue: 'From' })} />
          <input type="date" className="input" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label={t('hr.attendance.to', { defaultValue: 'To' })} />
          <select className="input" value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            aria-label={t('hr.employees.branchFilter', { defaultValue: 'Branch' })}>
            <option value="">{t('hr.employees.allBranches', { defaultValue: 'All branches' })}</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>
            ))}
          </select>
          <select className="input" value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            aria-label={t('hr.attendance.employee', { defaultValue: 'Employee' })}>
            <option value="">{t('hr.attendance.allEmployees', { defaultValue: 'All employees' })}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name || e.id}</option>
            ))}
          </select>
          <select className="input" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('hr.attendance.colStatus', { defaultValue: 'Status' })}>
            <option value="">{t('hr.attendance.allStatuses', { defaultValue: 'All statuses' })}</option>
            {ATTENDANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`hr.attendance.status.${s.replace(' ', '')}`, { defaultValue: s })}
              </option>
            ))}
          </select>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={22} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🗓"
          title={t('hr.attendance.empty', { defaultValue: 'No attendance records' })}
          desc={t('hr.attendance.emptyDesc', { defaultValue: 'Try a wider date range or different filters.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <Table columns={columns} data={rows} />
        </LayoutSection>
      )}

      {/* Mark-today bulk modal. */}
      <Modal
        open={markOpen}
        onClose={() => !markBusy && setMarkOpen(false)}
        size="lg"
        title={t('hr.attendance.markTodayTitle', { defaultValue: 'Mark attendance' })}
        footer={(
          <>
            <Btn variant="ghost" size="md" onClick={() => setMarkOpen(false)} disabled={markBusy}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn variant="primary" size="md" onClick={submitMarkToday}
              disabled={markBusy || !markRows.length} loading={markBusy}>
              {t('hr.attendance.saveAll', { defaultValue: 'Save attendance' })}
            </Btn>
          </>
        )}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input type="date" className="input" value={markDate}
            onChange={(e) => setMarkDate(e.target.value)} style={{ maxWidth: 180 }} />
          <select className="input" value={markBranch}
            onChange={(e) => setMarkBranch(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">{t('hr.attendance.allBranches', { defaultValue: 'All branches' })}</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>
            ))}
          </select>
        </div>
        {markRows.length === 0 ? (
          <EmptyState icon="👥" title={t('hr.attendance.noEmployeesInBranch', { defaultValue: 'No active employees in this branch' })} />
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table table--compact" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t('hr.attendance.colEmployee', { defaultValue: 'Employee' })}</th>
                  <th>{t('hr.attendance.colStatus', { defaultValue: 'Status' })}</th>
                </tr>
              </thead>
              <tbody>
                {markRows.map((r, i) => (
                  <tr key={r.employee}>
                    <td>{r.employee_name || r.employee}</td>
                    <td>
                      <select
                        className="input"
                        value={r.status}
                        onChange={(e) => {
                          const next = [...markRows];
                          next[i] = { ...next[i], status: e.target.value };
                          setMarkRows(next);
                        }}
                      >
                        {ATTENDANCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`hr.attendance.status.${s.replace(' ', '')}`, { defaultValue: s })}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('hr.attendance.deleteTitle', { defaultValue: 'Remove attendance' })}
        message={deleteTarget
          ? t('hr.attendance.deleteConfirm', {
              defaultValue: 'Remove the attendance record for {{name}} on {{date}}?',
              name: deleteTarget.employee_name || deleteTarget.employee,
              date: fmtDate(deleteTarget.attendance_date),
            })
          : ''}
        confirmLabel={t('common.remove', { defaultValue: 'Remove' })}
        variant="danger"
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />

      {/* Phase 4.b — batch operations on selected rows. Set-status
          surfaces a 5-button picker inside the bulk bar so the operator
          can pick a target status in a single click. Delete uses a
          confirm dialog because it's destructive. */}
      {canManage && (
        <BulkActionBar
          selectedCount={attendanceSelection.count}
          onClear={attendanceSelection.clear}
          countLabel={t('hr.attendance.batchSelected', {
            defaultValue: '{{count}} attendance rows selected',
            count: attendanceSelection.count,
          })}
        >
          {ATTENDANCE_STATUSES.map((s) => (
            <Btn
              key={s}
              variant="ghost"
              size="sm"
              loading={batchInFlight && batchStatusTarget === s}
              disabled={batchInFlight}
              onClick={() => setBatchStatusTarget(s)}
            >
              {t('hr.attendance.batchSetStatus', {
                defaultValue: 'Mark {{status}}',
                status: t(`hr.attendance.status.${s.replace(' ', '')}`, { defaultValue: s }),
              })}
            </Btn>
          ))}
          <Btn
            variant="danger"
            size="sm"
            loading={batchInFlight && batchDeleteConfirm}
            disabled={batchInFlight}
            onClick={() => setBatchDeleteConfirm(true)}
          >
            {t('hr.attendance.batchDelete', {
              defaultValue: 'Delete {{count}}',
              count: attendanceSelection.count,
            })}
          </Btn>
        </BulkActionBar>
      )}

      <ConfirmDialog
        open={!!batchStatusTarget}
        title={t('hr.attendance.batchSetStatusTitle', {
          defaultValue: 'Set {{count}} rows to {{status}}?',
          count: attendanceSelection.count,
          status: batchStatusTarget
            ? t(`hr.attendance.status.${batchStatusTarget.replace(' ', '')}`, { defaultValue: batchStatusTarget })
            : '',
        })}
        message={t('hr.attendance.batchSetStatusMsg', {
          defaultValue:
            'Each row will be re-amended to the new status. Rows already cancelled or outside your branch scope fail individually — the rest proceed.',
        })}
        confirmLabel={t('hr.attendance.batchSetStatusConfirm', {
          defaultValue: 'Set {{count}}',
          count: attendanceSelection.count,
        })}
        variant="primary"
        loading={batchInFlight}
        onCancel={() => !batchInFlight && setBatchStatusTarget(null)}
        onConfirm={onBatchSetStatus}
      />

      <ConfirmDialog
        open={batchDeleteConfirm}
        title={t('hr.attendance.batchDeleteTitle', {
          defaultValue: 'Remove {{count}} attendance rows?',
          count: attendanceSelection.count,
        })}
        message={t('hr.attendance.batchDeleteMsg', {
          defaultValue:
            'The selected attendance records will be cancelled and removed. Records linked to leave or already cancelled may fail individually.',
        })}
        confirmLabel={t('hr.attendance.batchDeleteConfirm', {
          defaultValue: 'Delete {{count}}',
          count: attendanceSelection.count,
        })}
        variant="danger"
        loading={batchInFlight}
        onCancel={() => !batchInFlight && setBatchDeleteConfirm(false)}
        onConfirm={onBatchDelete}
      />
    </TablePageLayout>
  );
}

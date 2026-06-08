/**
 * /hr/leave — Leave Management.
 *
 * Roles + actions:
 *   • Everyone with a linked Employee record can REQUEST leave
 *     (self-service, gated by canRequestLeave).
 *   • HR + Store Manager (own branch) + Admin can APPROVE / REJECT
 *     (gated by canApproveLeave).
 *   • HR + Admin can submit on behalf of any employee.
 *
 * Row-level scoping is enforced server-side by row_scoping.leave_application_pqc.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Badge,
  BatchResultToast,
  Btn,
  BulkActionBar,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  PageLoading,
  StatCard,
  Table,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { useNotify } from '../../context/NotificationContext';
import { useSelection } from '../../hooks/useSelection';
import {
  batchDecideLeaveApplications,
  cancelLeaveApplication,
  decideLeaveApplication,
  getLeaveKpis,
  listLeaveApplications,
  listLeaveTypes,
  submitLeaveApplication,
} from '../../services/hrLeaveApi';
import { listBranches, listEmployees } from '../../services/hrEmployeeApi';
import { fmtDate } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const STATUS_TONE = {
  Open: 'amber',
  Approved: 'green',
  Rejected: 'red',
};

function StatusBadge({ status, t }) {
  if (!status) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <Badge color={STATUS_TONE[status] || 'default'}>
      {t(`hr.leave.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function LeavePage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const canApprove = Boolean(capabilities?.canApproveLeave || capabilities?.canManageSystem);
  const canRequestForAny = Boolean(capabilities?.canManageEmployees || capabilities?.canManageSystem);

  const [kpis, setKpis] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(addDays(todayStr(), -60));
  const [dateTo, setDateTo] = useState(addDays(todayStr(), 30));

  // Picklists
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Request modal
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqForm, setReqForm] = useState({
    employee: '', leave_type: '', from_date: todayStr(),
    to_date: addDays(todayStr(), 1), description: '',
  });
  const [reqBusy, setReqBusy] = useState(false);

  // Decision modal
  const [decideTarget, setDecideTarget] = useState(null); // { row, decision }
  const [decideNotes, setDecideNotes] = useState('');
  const [decideBusy, setDecideBusy] = useState(false);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  // Phase 4.b — batch decision state. Only Open rows are selectable;
  // selectableRows is recomputed whenever rows change so toggleAll
  // tracks the actionable subset (and ignores closed rows).
  const selectableRows = useMemo(
    () => rows.filter((r) => r.status === 'Open'),
    [rows],
  );
  const leaveSelection = useSelection({
    items: selectableRows,
    getId: (row) => row?.name,
  });
  const [batchInFlight, setBatchInFlight] = useState(false);
  const [batchDecision, setBatchDecision] = useState(null); // 'Approved' | 'Rejected'
  const [batchNotes, setBatchNotes] = useState('');

  useEffect(() => {
    listLeaveTypes().then(setLeaveTypes).catch(() => setLeaveTypes([]));
    listBranches().then(setBranches).catch(() => setBranches([]));
    listEmployees({ limit: 500, status: 'Active' }).then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const loadKpis = useCallback(() => {
    getLeaveKpis().then(setKpis).catch(() => setKpis(null));
  }, []);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listLeaveApplications({
        status: statusFilter,
        leaveType: leaveTypeFilter,
        employee: employeeFilter,
        branch: branchFilter,
        dateFrom,
        dateTo,
        limit: 300,
      }));
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, leaveTypeFilter, employeeFilter, branchFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const openRequest = () => {
    // Default to the currently-logged-in employee if they have a linked record.
    const linked = employees.find((e) => e.system_user_id);
    setReqForm({
      employee: canRequestForAny ? '' : (linked?.id || ''),
      leave_type: leaveTypes[0]?.name || '',
      from_date: todayStr(),
      to_date: addDays(todayStr(), 1),
      description: '',
    });
    setRequestOpen(true);
  };

  const submitRequest = async () => {
    if (!reqForm.employee || !reqForm.leave_type) {
      notify.warning(t('hr.leave.requireEmployeeAndType', { defaultValue: 'Pick an employee and a leave type.' }));
      return;
    }
    setReqBusy(true);
    try {
      const res = await submitLeaveApplication({
        employee: reqForm.employee,
        leaveType: reqForm.leave_type,
        fromDate: reqForm.from_date,
        toDate: reqForm.to_date,
        description: reqForm.description,
      });
      notify.success(t('hr.leave.requestSubmitted', { defaultValue: 'Leave request submitted ({{name}})', name: res.name }));
      setRequestOpen(false);
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setReqBusy(false);
    }
  };

  const submitDecision = async () => {
    if (!decideTarget) return;
    setDecideBusy(true);
    try {
      await decideLeaveApplication({
        name: decideTarget.row.name,
        decision: decideTarget.decision,
        notes: decideNotes,
      });
      notify.success(decideTarget.decision === 'Approved'
        ? t('hr.leave.approved', { defaultValue: 'Leave approved.' })
        : t('hr.leave.rejected', { defaultValue: 'Leave rejected.' }));
      setDecideTarget(null);
      setDecideNotes('');
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setDecideBusy(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await cancelLeaveApplication(cancelTarget.name);
      notify.success(t('hr.leave.cancelled', { defaultValue: 'Leave application cancelled.' }));
      setCancelTarget(null);
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setCancelBusy(false);
    }
  };

  // ── Phase 4.b — batch decide handler ──────────────────────────────────
  //
  // The same handler covers Approve Selected + Reject Selected — the
  // `batchDecision` state ("Approved" | "Rejected") drives the wording
  // of the confirm dialog and the API payload.
  //
  // No optimistic UI here: ERPNext's Leave Application submit cascades
  // to attendance + leave-ledger entries, so we wait for the server
  // confirmation rather than risk visual rollback complexity.
  const reportBatchResult = (result, decision) => {
    if (!result) return;
    const errors = (result.results || [])
      .filter((r) => !r.ok)
      .map((r) => ({ id: r.name, message: r.error || t('common.unknownError', { defaultValue: 'Unknown error' }) }));
    const headline = decision === 'Approved'
      ? t('hr.leave.batchApproveHeadline', {
          defaultValue: '{{succeeded}} of {{total}} approved',
          succeeded: result.succeeded,
          total: result.total,
        })
      : t('hr.leave.batchRejectHeadline', {
          defaultValue: '{{succeeded}} of {{total}} rejected',
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

  const onBatchDecide = async () => {
    const decision = batchDecision;
    const ids = leaveSelection.selectedIds;
    if (!decision || !ids.length || batchInFlight) return;
    const trimmedNotes = (batchNotes || '').trim();
    // Rejection requires a reason — same UX policy as the single-doc path
    // (where the modal lets the approver type one before submitting).
    if (decision === 'Rejected' && !trimmedNotes) {
      notify.warning(t('hr.leave.batchRejectReasonRequired', {
        defaultValue: 'Enter a rejection reason in the notes field.',
      }));
      return;
    }
    setBatchInFlight(true);
    try {
      const result = await batchDecideLeaveApplications({
        items: ids,
        decision,
        notes: trimmedNotes,
      });
      reportBatchResult(result, decision);
      leaveSelection.clear();
      setBatchDecision(null);
      setBatchNotes('');
      await Promise.all([load(), loadKpis()]);
    } catch (e) {
      // Envelope-level failure (size cap, list shape, role gate) — no
      // per-row results to render. Single error toast; selection stays.
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setBatchInFlight(false);
    }
  };

  const openBatchDecisionDialog = (decision) => {
    setBatchDecision(decision);
    setBatchNotes('');
  };
  const closeBatchDecisionDialog = () => {
    if (batchInFlight) return;
    setBatchDecision(null);
    setBatchNotes('');
  };

  const columns = useMemo(() => {
    // Phase 4.b — checkbox column for the batch-decide flow. Renders an
    // empty cell on rows whose status is not Open (Approved/Rejected
    // are immutable per the existing single-doc behavior). The header
    // checkbox toggles the actionable subset only — matching how
    // useSelection was initialised with selectableRows.
    const checkboxColumn = canApprove && selectableRows.length > 0
      ? {
          key: '__select__',
          label: (
            <input
              type="checkbox"
              className="row-checkbox"
              aria-label={t('hr.leave.selectAllOpen', { defaultValue: 'Select all open requests' })}
              checked={leaveSelection.allSelected}
              ref={(el) => { if (el) el.indeterminate = leaveSelection.someSelected; }}
              onChange={leaveSelection.toggleAll}
            />
          ),
          render: (_v, row) => (
            row.status === 'Open'
              ? (
                <input
                  type="checkbox"
                  className="row-checkbox"
                  aria-label={t('hr.leave.selectRow', { defaultValue: 'Select {{name}}', name: row.name })}
                  checked={leaveSelection.isSelected(row.name)}
                  disabled={batchInFlight}
                  onChange={() => leaveSelection.toggle(row.name)}
                />
              )
              : null
          ),
        }
      : null;
    const baseCols = [
    { key: 'name', label: t('hr.leave.colId', { defaultValue: 'Application' }),
      render: (v) => <span className="mono">{v}</span> },
    { key: 'employee_name', label: t('hr.leave.colEmployee', { defaultValue: 'Employee' }),
      render: (v, r) => v || r.employee },
    { key: 'leave_type', label: t('hr.leave.colType', { defaultValue: 'Type' }) },
    { key: 'from_date', label: t('hr.leave.colFrom', { defaultValue: 'From' }),
      render: (v) => fmtDate(v) },
    { key: 'to_date', label: t('hr.leave.colTo', { defaultValue: 'To' }),
      render: (v) => fmtDate(v) },
    { key: 'total_leave_days', label: t('hr.leave.colDays', { defaultValue: 'Days' }),
      render: (v) => Number(v || 0).toFixed(1) },
    { key: 'status', label: t('hr.leave.colStatus', { defaultValue: 'Status' }),
      render: (v) => <StatusBadge status={v} t={t} /> },
    { key: 'actions', label: t('ui.table.actions', { defaultValue: 'Actions' }),
      render: (_v, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {row.status === 'Open' && canApprove && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => { setDecideTarget({ row, decision: 'Approved' }); setDecideNotes(''); }}>
                {t('hr.leave.approve', { defaultValue: 'Approve' })}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => { setDecideTarget({ row, decision: 'Rejected' }); setDecideNotes(''); }}>
                {t('hr.leave.reject', { defaultValue: 'Reject' })}
              </Btn>
            </>
          )}
          {(row.status === 'Open' || canRequestForAny) && (
            <Btn variant="ghost" size="sm" onClick={() => setCancelTarget(row)}>
              {t('common.remove', { defaultValue: 'Remove' })}
            </Btn>
          )}
        </div>
      ),
    },
    ];
    return checkboxColumn ? [checkboxColumn, ...baseCols] : baseCols;
  }, [
    canApprove,
    canRequestForAny,
    t,
    selectableRows.length,
    leaveSelection,
    batchInFlight,
  ]);

  const hrmsMissing = !!kpis?.hrms_not_installed;

  return (
    <TablePageLayout>
      <PageHeader
        title={t('hr.leave.title', { defaultValue: 'Leave Management' })}
        subtitle={t('hr.leave.subtitle', { defaultValue: 'Requests, approvals, and balances' })}
        dense
        actions={(
          <Btn variant="primary" size="sm" onClick={openRequest}>
            {t('hr.leave.newRequest', { defaultValue: 'Request leave' })}
          </Btn>
        )}
      />

      {hrmsMissing && (
        <LayoutSection variant="raised" flushHead>
          <div className="login-error" role="alert" style={{ margin: 0 }}>
            <strong>{t('hr.attendance.hrmsMissingTitle', { defaultValue: 'HR Management app is not installed.' })}</strong>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
              {t('hr.attendance.hrmsMissingDesc')}
            </p>
          </div>
        </LayoutSection>
      )}

      <section className="layout-grid layout-grid--kpi" aria-label="Leave KPIs">
        <StatCard
          label={t('hr.leave.kpi.pending', { defaultValue: 'Pending' })}
          value={kpis?.pending ?? '…'}
          icon="⏰" color="amber" compact
        />
        <StatCard
          label={t('hr.leave.kpi.approvedMonth', { defaultValue: 'Approved this month' })}
          value={kpis?.approved_month ?? '…'}
          icon="✓" color="green" compact
        />
        <StatCard
          label={t('hr.leave.kpi.rejectedMonth', { defaultValue: 'Rejected this month' })}
          value={kpis?.rejected_month ?? '…'}
          icon="✕" color="red" compact
        />
        <StatCard
          label={t('hr.leave.kpi.onLeaveToday', { defaultValue: 'On leave today' })}
          value={kpis?.on_leave_today ?? '…'}
          icon="🏖" color="blue" compact
        />
      </section>

      <LayoutSection variant="flat" flushHead>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="input" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="input" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} />
          <select className="input" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('hr.leave.allStatuses', { defaultValue: 'All statuses' })}</option>
            <option value="Open">{t('hr.leave.status.Open', { defaultValue: 'Open' })}</option>
            <option value="Approved">{t('hr.leave.status.Approved', { defaultValue: 'Approved' })}</option>
            <option value="Rejected">{t('hr.leave.status.Rejected', { defaultValue: 'Rejected' })}</option>
          </select>
          <select className="input" value={leaveTypeFilter}
            onChange={(e) => setLeaveTypeFilter(e.target.value)}>
            <option value="">{t('hr.leave.allTypes', { defaultValue: 'All types' })}</option>
            {leaveTypes.map((lt) => <option key={lt.name} value={lt.name}>{lt.leave_type_name || lt.name}</option>)}
          </select>
          <select className="input" value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">{t('hr.employees.allBranches', { defaultValue: 'All branches' })}</option>
            {branches.map((b) => <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>)}
          </select>
          <select className="input" value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">{t('hr.attendance.allEmployees', { defaultValue: 'All employees' })}</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
          </select>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={22} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🏖"
          title={t('hr.leave.empty', { defaultValue: 'No leave applications' })}
          desc={t('hr.leave.emptyDesc', { defaultValue: 'Try wider filters or submit a new request.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <Table columns={columns} data={rows} />
        </LayoutSection>
      )}

      {/* Request modal */}
      <Modal
        open={requestOpen}
        onClose={() => !reqBusy && setRequestOpen(false)}
        size="md"
        title={t('hr.leave.requestTitle', { defaultValue: 'Request leave' })}
        footer={(
          <>
            <Btn variant="ghost" size="md" onClick={() => setRequestOpen(false)} disabled={reqBusy}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn variant="primary" size="md" onClick={submitRequest} loading={reqBusy}
              disabled={reqBusy || !reqForm.employee || !reqForm.leave_type}>
              {t('hr.leave.submit', { defaultValue: 'Submit request' })}
            </Btn>
          </>
        )}
      >
        <div className="form-stack">
          {canRequestForAny && (
            <label>
              {t('hr.leave.employee', { defaultValue: 'Employee' })} *
              <select className="input" value={reqForm.employee}
                onChange={(e) => setReqForm({ ...reqForm, employee: e.target.value })}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
              </select>
            </label>
          )}
          <label>
            {t('hr.leave.type', { defaultValue: 'Leave type' })} *
            <select className="input" value={reqForm.leave_type}
              onChange={(e) => setReqForm({ ...reqForm, leave_type: e.target.value })}>
              <option value="">—</option>
              {leaveTypes.map((lt) => <option key={lt.name} value={lt.name}>{lt.leave_type_name || lt.name}</option>)}
            </select>
          </label>
          <label>
            {t('hr.leave.from', { defaultValue: 'From' })} *
            <input type="date" className="input" value={reqForm.from_date}
              onChange={(e) => setReqForm({ ...reqForm, from_date: e.target.value })} />
          </label>
          <label>
            {t('hr.leave.to', { defaultValue: 'To' })} *
            <input type="date" className="input" value={reqForm.to_date}
              onChange={(e) => setReqForm({ ...reqForm, to_date: e.target.value })} />
          </label>
          <label>
            {t('hr.leave.reason', { defaultValue: 'Reason / notes' })}
            <textarea className="input" rows={3} value={reqForm.description}
              onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} />
          </label>
        </div>
      </Modal>

      {/* Decision modal */}
      <Modal
        open={!!decideTarget}
        onClose={() => !decideBusy && setDecideTarget(null)}
        size="md"
        title={decideTarget
          ? (decideTarget.decision === 'Approved'
              ? t('hr.leave.approveTitle', { defaultValue: 'Approve leave' })
              : t('hr.leave.rejectTitle', { defaultValue: 'Reject leave' }))
          : ''}
        footer={(
          <>
            <Btn variant="ghost" size="md" onClick={() => setDecideTarget(null)} disabled={decideBusy}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn
              variant={decideTarget?.decision === 'Approved' ? 'primary' : 'danger'}
              size="md"
              onClick={submitDecision}
              loading={decideBusy}
            >
              {decideTarget?.decision === 'Approved'
                ? t('hr.leave.approve', { defaultValue: 'Approve' })
                : t('hr.leave.reject', { defaultValue: 'Reject' })}
            </Btn>
          </>
        )}
      >
        {decideTarget && (
          <div className="form-stack">
            <p style={{ margin: 0 }}>
              {t('hr.leave.decideConfirm', {
                defaultValue: '{{employee}} · {{type}} · {{from}} → {{to}} ({{days}} days)',
                employee: decideTarget.row.employee_name || decideTarget.row.employee,
                type: decideTarget.row.leave_type,
                from: fmtDate(decideTarget.row.from_date),
                to: fmtDate(decideTarget.row.to_date),
                days: Number(decideTarget.row.total_leave_days || 0).toFixed(1),
              })}
            </p>
            <label>
              {t('hr.leave.notes', { defaultValue: 'Notes (optional)' })}
              <textarea className="input" rows={3} value={decideNotes}
                onChange={(e) => setDecideNotes(e.target.value)} />
            </label>
          </div>
        )}
      </Modal>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget}
        title={t('hr.leave.cancelTitle', { defaultValue: 'Cancel leave' })}
        message={cancelTarget
          ? t('hr.leave.cancelConfirm', {
              defaultValue: 'Cancel the leave application {{name}}? This will also clean up any linked attendance records.',
              name: cancelTarget.name,
            })
          : ''}
        confirmLabel={t('common.remove', { defaultValue: 'Remove' })}
        variant="danger"
        loading={cancelBusy}
        onCancel={() => !cancelBusy && setCancelTarget(null)}
        onConfirm={submitCancel}
      />

      {/* Phase 4.b — sticky-bottom bulk action bar. Renders only when
          at least one Open row is selected. Per requirement, supports
          BOTH "Approve Selected" and "Reject Selected". */}
      {canApprove && (
        <BulkActionBar
          selectedCount={leaveSelection.count}
          onClear={leaveSelection.clear}
          countLabel={t('hr.leave.batchSelected', {
            defaultValue: '{{count}} leave requests selected',
            count: leaveSelection.count,
          })}
        >
          <Btn
            variant="success"
            size="sm"
            loading={batchInFlight && batchDecision === 'Approved'}
            disabled={batchInFlight}
            onClick={() => openBatchDecisionDialog('Approved')}
          >
            {t('hr.leave.batchApprove', {
              defaultValue: 'Approve {{count}}',
              count: leaveSelection.count,
            })}
          </Btn>
          <Btn
            variant="danger"
            size="sm"
            loading={batchInFlight && batchDecision === 'Rejected'}
            disabled={batchInFlight}
            onClick={() => openBatchDecisionDialog('Rejected')}
          >
            {t('hr.leave.batchReject', {
              defaultValue: 'Reject {{count}}',
              count: leaveSelection.count,
            })}
          </Btn>
        </BulkActionBar>
      )}

      {/* Batch decision modal — uses Modal (not ConfirmDialog) because
          we need a textarea for the optional notes / required reject
          reason. Same body shape as the single-doc decision modal. */}
      <Modal
        open={!!batchDecision}
        onClose={closeBatchDecisionDialog}
        size="md"
        title={batchDecision === 'Approved'
          ? t('hr.leave.batchApproveTitle', {
              defaultValue: 'Approve {{count}} leave requests?',
              count: leaveSelection.count,
            })
          : t('hr.leave.batchRejectTitle', {
              defaultValue: 'Reject {{count}} leave requests?',
              count: leaveSelection.count,
            })}
        footer={(
          <>
            <Btn variant="ghost" size="md" onClick={closeBatchDecisionDialog} disabled={batchInFlight}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn
              variant={batchDecision === 'Approved' ? 'primary' : 'danger'}
              size="md"
              onClick={onBatchDecide}
              loading={batchInFlight}
              disabled={batchInFlight || (batchDecision === 'Rejected' && !batchNotes.trim())}
            >
              {batchDecision === 'Approved'
                ? t('hr.leave.batchApproveConfirm', { defaultValue: 'Approve {{count}}', count: leaveSelection.count })
                : t('hr.leave.batchRejectConfirm', { defaultValue: 'Reject {{count}}', count: leaveSelection.count })}
            </Btn>
          </>
        )}
      >
        <div className="form-stack">
          <p className="ui-modal__message">
            {batchDecision === 'Approved'
              ? t('hr.leave.batchApproveMsg', {
                  defaultValue:
                    'Each request will be submitted and a leave allocation/attendance record created. Rows outside your branch scope will fail individually — the rest will proceed.',
                })
              : t('hr.leave.batchRejectMsg', {
                  defaultValue:
                    'The reason below will be appended to every rejected leave application. The reason is required.',
                })}
          </p>
          <label>
            {batchDecision === 'Rejected'
              ? t('hr.leave.batchRejectReason', { defaultValue: 'Rejection reason (required)' })
              : t('hr.leave.notes', { defaultValue: 'Notes (optional)' })}
            <textarea
              className="input"
              rows={3}
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              autoFocus
            />
          </label>
        </div>
      </Modal>
    </TablePageLayout>
  );
}

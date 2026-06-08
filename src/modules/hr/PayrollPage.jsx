/**
 * /hr/payroll — Payroll management (HR + Admin).
 *
 * Workflow surfaced:
 *   1. KPI strip: Draft / Submitted / Paid + totals (gross / net) for
 *      the selected month.
 *   2. "Generate payroll" button → runs `generate_monthly_payroll(year, month)`.
 *   3. "Assign structure" button → opens modal to set base salary for an
 *      employee against a Salary Structure.
 *   4. Filter bar: month, branch, employee, status.
 *   5. Table: per-slip actions (View / Submit / Mark Paid / Print / Remove).
 *   6. View modal: header + earnings + deductions breakdown.
 *
 * Print: clicks open the unified ERPNext-rendered PDF via the Elmahdi
 * Payslip print format (registered in setup/print_formats.py).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard, Badge, Btn, ConfirmDialog, EmptyState,
  Modal, PageHeader, PageLoading, StatCard, Table,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useNotify } from '../../context/NotificationContext';
import { useAuth } from '../../hooks/useAuth';
import {
  assignSalaryStructure,
  cancelSalarySlip,
  generateMonthlyPayroll,
  getPayrollKpis,
  getSalarySlipDetail,
  listSalarySlips,
  listSalaryStructures,
  markSlipPaid,
  submitSalarySlip,
} from '../../services/hrPayrollApi';
import { listBranches, listEmployees } from '../../services/hrEmployeeApi';
import { fmtCurrency, fmtDate } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { printErpFormat } from '../../utils/printErpFormat';

const STATUS_TONE = { Draft: 'default', Submitted: 'amber', Paid: 'green', Cancelled: 'red' };

function statusBadge(slip, t) {
  // ERPNext sometimes leaves `status` blank for newly-inserted slips.
  let s = slip.status;
  if (!s) s = slip.docstatus === 1 ? 'Submitted' : 'Draft';
  return (
    <Badge color={STATUS_TONE[s] || 'default'}>
      {t(`hr.payroll.status.${s}`, { defaultValue: s })}
    </Badge>
  );
}

export default function PayrollPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const canManage = Boolean(capabilities?.canManagePayroll || capabilities?.canManageSystem);

  // Filters
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');

  // Data
  const [kpis, setKpis] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Picklists
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);

  // Generate confirm
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Assign-structure modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employee: '', structure: '', base: '', from_date: '',
  });
  const [assignBusy, setAssignBusy] = useState(false);

  // View slip
  const [viewSlip, setViewSlip] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    listBranches().then(setBranches).catch(() => setBranches([]));
    listEmployees({ limit: 500, status: 'Active' }).then(setEmployees).catch(() => setEmployees([]));
    listSalaryStructures().then(setStructures).catch(() => setStructures([]));
  }, []);

  const loadKpis = useCallback(() => {
    getPayrollKpis({ year, month }).then(setKpis).catch(() => setKpis(null));
  }, [year, month]);
  useEffect(() => { loadKpis(); }, [loadKpis]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listSalarySlips({
        year, month, status: statusFilter, branch: branchFilter,
        employee: employeeFilter, limit: 300,
      }));
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [year, month, statusFilter, branchFilter, employeeFilter]);
  useEffect(() => { load(); }, [load]);

  const runGenerate = async () => {
    setGenerateBusy(true);
    try {
      const res = await generateMonthlyPayroll({ year, month, branch: branchFilter });
      notify.success(t('hr.payroll.generated', {
        defaultValue: 'Created {{ok}} slips; skipped {{fail}}.',
        ok: res.created, fail: res.skipped,
      }));
      setGenerateOpen(false);
      load();
      loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setGenerateBusy(false);
    }
  };

  const openAssign = () => {
    setAssignForm({
      employee: '', structure: structures[0]?.name || 'Elmahdi Monthly Default',
      base: '', from_date: `${year}-${String(month).padStart(2, '0')}-01`,
    });
    setAssignOpen(true);
  };

  const submitAssign = async () => {
    const base = Number(assignForm.base);
    if (!assignForm.employee || !assignForm.structure || !Number.isFinite(base) || base <= 0) {
      notify.warning(t('hr.payroll.assignRequire', { defaultValue: 'Pick an employee, structure and a positive base salary.' }));
      return;
    }
    setAssignBusy(true);
    try {
      await assignSalaryStructure({
        employee: assignForm.employee,
        structure: assignForm.structure,
        base,
        fromDate: assignForm.from_date,
      });
      notify.success(t('hr.payroll.assigned', { defaultValue: 'Salary structure assigned.' }));
      setAssignOpen(false);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setAssignBusy(false);
    }
  };

  const openView = async (row) => {
    setViewLoading(true);
    setViewSlip({ name: row.name, loading: true });
    try {
      const d = await getSalarySlipDetail(row.name);
      setViewSlip(d);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
      setViewSlip(null);
    } finally {
      setViewLoading(false);
    }
  };

  const doSubmit = async (row) => {
    try {
      await submitSalarySlip(row.name);
      notify.success(t('hr.payroll.slipSubmitted', { defaultValue: 'Slip submitted.' }));
      load(); loadKpis();
    } catch (e) { notify.error(getUserFriendlyMessage(e)); }
  };

  const doPaid = async (row) => {
    try {
      await markSlipPaid(row.name);
      notify.success(t('hr.payroll.slipPaid', { defaultValue: 'Slip marked Paid.' }));
      load(); loadKpis();
    } catch (e) { notify.error(getUserFriendlyMessage(e)); }
  };

  const doPrint = (row) => {
    printErpFormat({
      doctype: 'Salary Slip',
      name: row.name,
      format: 'Elmahdi Payslip',
    });
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await cancelSalarySlip(cancelTarget.name);
      notify.success(t('hr.payroll.slipCancelled', { defaultValue: 'Slip removed.' }));
      setCancelTarget(null);
      load(); loadKpis();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setCancelBusy(false);
    }
  };

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const columns = useMemo(() => [
    { key: 'name', label: t('hr.payroll.colId', { defaultValue: 'Slip' }),
      render: (v) => <span className="mono" style={{ fontSize: '0.76rem' }}>{v}</span> },
    { key: 'employee_name', label: t('hr.payroll.colEmployee', { defaultValue: 'Employee' }),
      render: (v, r) => v || r.employee },
    { key: 'branch', label: t('hr.payroll.colBranch', { defaultValue: 'Branch' }),
      render: (v) => v ? <Badge color="default">{v}</Badge> : <span style={{ color: 'var(--text-3)' }}>—</span> },
    { key: 'start_date', label: t('hr.payroll.colPeriod', { defaultValue: 'Period' }),
      render: (v, r) => `${fmtDate(v)} → ${fmtDate(r.end_date)}` },
    { key: 'gross_pay', label: t('hr.payroll.colGross', { defaultValue: 'Gross' }),
      render: (v) => <span className="mono">{fmtCurrency(v)}</span> },
    { key: 'total_deduction', label: t('hr.payroll.colDeductions', { defaultValue: 'Deductions' }),
      render: (v) => <span className="mono">{fmtCurrency(v)}</span> },
    { key: 'net_pay', label: t('hr.payroll.colNet', { defaultValue: 'Net' }),
      render: (v) => <strong className="mono">{fmtCurrency(v)}</strong> },
    { key: 'status', label: t('hr.payroll.colStatus', { defaultValue: 'Status' }),
      render: (_v, r) => statusBadge(r, t) },
    ...(canManage ? [{
      key: 'actions', label: t('ui.table.actions', { defaultValue: 'Actions' }),
      render: (_v, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" onClick={() => openView(row)}>
            {t('common.view', { defaultValue: 'View' })}
          </Btn>
          {row.docstatus === 0 && (
            <Btn variant="ghost" size="sm" onClick={() => doSubmit(row)}>
              {t('hr.payroll.submit', { defaultValue: 'Submit' })}
            </Btn>
          )}
          {row.docstatus === 1 && row.status !== 'Paid' && (
            <Btn variant="ghost" size="sm" onClick={() => doPaid(row)}>
              {t('hr.payroll.markPaid', { defaultValue: 'Mark Paid' })}
            </Btn>
          )}
          <Btn variant="ghost" size="sm" onClick={() => doPrint(row)}>
            {t('common.print', { defaultValue: 'Print' })}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => setCancelTarget(row)}>
            {t('common.remove', { defaultValue: 'Remove' })}
          </Btn>
        </div>
      ),
    }] : [{
      // Read-only viewer (Store Manager etc) — View + Print only.
      key: 'actions', label: t('ui.table.actions', { defaultValue: 'Actions' }),
      render: (_v, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" onClick={() => openView(row)}>
            {t('common.view', { defaultValue: 'View' })}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => doPrint(row)}>
            {t('common.print', { defaultValue: 'Print' })}
          </Btn>
        </div>
      ),
    }]),
  ], [canManage, t]);

  return (
    <TablePageLayout>
      <PageHeader
        title={t('hr.payroll.title', { defaultValue: 'Payroll' })}
        subtitle={t('hr.payroll.subtitle', { defaultValue: 'Monthly salary slips and payroll generation' })}
        dense
        actions={canManage ? (
          <>
            <Btn variant="ghost" size="sm" onClick={openAssign}>
              {t('hr.payroll.assignStructure', { defaultValue: 'Assign structure' })}
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => setGenerateOpen(true)}>
              {t('hr.payroll.generate', { defaultValue: 'Generate payroll' })}
            </Btn>
          </>
        ) : null}
      />

      <section className="layout-grid layout-grid--kpi" aria-label="Payroll KPIs">
        <StatCard label={t('hr.payroll.kpi.draft', { defaultValue: 'Draft' })}
          value={kpis?.draft ?? '…'} icon="✎" color="default" compact />
        <StatCard label={t('hr.payroll.kpi.submitted', { defaultValue: 'Submitted' })}
          value={kpis?.submitted ?? '…'} icon="✓" color="amber" compact />
        <StatCard label={t('hr.payroll.kpi.paid', { defaultValue: 'Paid' })}
          value={kpis?.paid ?? '…'} icon="💰" color="green" compact />
        <StatCard label={t('hr.payroll.kpi.totalGross', { defaultValue: 'Total gross' })}
          value={fmtCurrency(kpis?.total_gross ?? 0)} icon="💵" color="blue" compact />
        <StatCard label={t('hr.payroll.kpi.totalNet', { defaultValue: 'Total net' })}
          value={fmtCurrency(kpis?.total_net ?? 0)} icon="💵" color="accent" compact />
      </section>

      <LayoutSection variant="flat" flushHead>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })}
              </option>
            ))}
          </select>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('hr.payroll.allStatuses', { defaultValue: 'All statuses' })}</option>
            <option value="Draft">{t('hr.payroll.status.Draft', { defaultValue: 'Draft' })}</option>
            <option value="Submitted">{t('hr.payroll.status.Submitted', { defaultValue: 'Submitted' })}</option>
            <option value="Paid">{t('hr.payroll.status.Paid', { defaultValue: 'Paid' })}</option>
          </select>
          <select className="input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">{t('hr.employees.allBranches', { defaultValue: 'All branches' })}</option>
            {branches.map((b) => <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>)}
          </select>
          <select className="input" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
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
          icon="💼"
          title={t('hr.payroll.empty', { defaultValue: 'No salary slips' })}
          desc={t('hr.payroll.emptyDesc', { defaultValue: 'Assign structures and generate payroll for this period.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <Table columns={columns} data={rows} />
        </LayoutSection>
      )}

      {/* Generate confirm */}
      <ConfirmDialog
        open={generateOpen}
        title={t('hr.payroll.generateTitle', { defaultValue: 'Generate payroll' })}
        message={t('hr.payroll.generateConfirm', {
          defaultValue: 'Create draft salary slips for {{month}}/{{year}}{{branch}}?',
          month, year,
          branch: branchFilter ? ` (${branchFilter})` : '',
        })}
        confirmLabel={t('hr.payroll.generate', { defaultValue: 'Generate' })}
        variant="primary"
        loading={generateBusy}
        onCancel={() => !generateBusy && setGenerateOpen(false)}
        onConfirm={runGenerate}
      />

      {/* Assign structure modal */}
      <Modal
        open={assignOpen}
        onClose={() => !assignBusy && setAssignOpen(false)}
        size="md"
        title={t('hr.payroll.assignTitle', { defaultValue: 'Assign salary structure' })}
        footer={(
          <>
            <Btn variant="ghost" size="md" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn variant="primary" size="md" onClick={submitAssign} loading={assignBusy}
              disabled={assignBusy}>
              {t('hr.payroll.save', { defaultValue: 'Save assignment' })}
            </Btn>
          </>
        )}
      >
        <div className="form-stack">
          <label>
            {t('hr.payroll.employee', { defaultValue: 'Employee' })} *
            <select className="input" value={assignForm.employee}
              onChange={(e) => setAssignForm({ ...assignForm, employee: e.target.value })}>
              <option value="">—</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.id}</option>)}
            </select>
          </label>
          <label>
            {t('hr.payroll.structure', { defaultValue: 'Salary structure' })} *
            <select className="input" value={assignForm.structure}
              onChange={(e) => setAssignForm({ ...assignForm, structure: e.target.value })}>
              <option value="">—</option>
              {structures.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label>
            {t('hr.payroll.baseSalary', { defaultValue: 'Base salary (EGP)' })} *
            <input type="number" className="input" min="0" step="0.01"
              value={assignForm.base}
              onChange={(e) => setAssignForm({ ...assignForm, base: e.target.value })} />
          </label>
          <label>
            {t('hr.payroll.fromDate', { defaultValue: 'Effective from' })}
            <input type="date" className="input" value={assignForm.from_date}
              onChange={(e) => setAssignForm({ ...assignForm, from_date: e.target.value })} />
          </label>
        </div>
      </Modal>

      {/* View slip modal */}
      <Modal
        open={!!viewSlip}
        onClose={() => setViewSlip(null)}
        size="lg"
        title={viewSlip?.name || t('hr.payroll.viewTitle', { defaultValue: 'Salary slip' })}
        footer={viewSlip && !viewSlip.loading ? (
          <Btn variant="primary" size="md"
            onClick={() => printErpFormat({ doctype: 'Salary Slip', name: viewSlip.name, format: 'Elmahdi Payslip' })}>
            {t('common.print', { defaultValue: 'Print' })}
          </Btn>
        ) : null}
      >
        {viewLoading || viewSlip?.loading ? (
          <PageLoading size={22} />
        ) : viewSlip ? (
          <div>
            <p style={{ margin: '0 0 8px' }}>
              <strong>{viewSlip.employee_name || viewSlip.employee}</strong>
              {viewSlip.branch && <> · <span>{viewSlip.branch}</span></>}
            </p>
            <p style={{ margin: '0 0 16px', color: 'var(--text-2)', fontSize: '0.86rem' }}>
              {fmtDate(viewSlip.start_date)} → {fmtDate(viewSlip.end_date)}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ marginTop: 0 }}>{t('hr.payroll.earnings', { defaultValue: 'Earnings' })}</h4>
                <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                  {(viewSlip.earnings || []).map((e, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{e.salary_component}</span>
                      <span className="mono">{fmtCurrency(e.amount)}</span>
                    </li>
                  ))}
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', marginTop: 4, fontWeight: 600 }}>
                    <span>{t('hr.payroll.gross', { defaultValue: 'Gross' })}</span>
                    <span className="mono">{fmtCurrency(viewSlip.gross_pay)}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 style={{ marginTop: 0 }}>{t('hr.payroll.deductions', { defaultValue: 'Deductions' })}</h4>
                {(viewSlip.deductions || []).length === 0 ? (
                  <p style={{ color: 'var(--text-3)' }}>—</p>
                ) : (
                  <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                    {(viewSlip.deductions || []).map((e, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{e.salary_component}</span>
                        <span className="mono">{fmtCurrency(e.amount)}</span>
                      </li>
                    ))}
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', marginTop: 4, fontWeight: 600 }}>
                      <span>{t('hr.payroll.totalDeduction', { defaultValue: 'Total deductions' })}</span>
                      <span className="mono">{fmtCurrency(viewSlip.total_deduction)}</span>
                    </li>
                  </ul>
                )}
              </div>
            </div>
            <p style={{ marginTop: 16, padding: 12, background: 'var(--bg-3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
              <strong>{t('hr.payroll.netPay', { defaultValue: 'Net pay' })}</strong>
              <strong className="mono">{fmtCurrency(viewSlip.net_pay)}</strong>
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget}
        title={t('hr.payroll.cancelTitle', { defaultValue: 'Remove salary slip' })}
        message={cancelTarget ? t('hr.payroll.cancelConfirm', {
          defaultValue: 'Remove slip {{name}}? Submitted slips will be cancelled first.',
          name: cancelTarget.name,
        }) : ''}
        confirmLabel={t('common.remove', { defaultValue: 'Remove' })}
        variant="danger"
        loading={cancelBusy}
        onCancel={() => !cancelBusy && setCancelTarget(null)}
        onConfirm={submitCancel}
      />
    </TablePageLayout>
  );
}

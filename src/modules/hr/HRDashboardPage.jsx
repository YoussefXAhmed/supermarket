import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  PageHeader,
  PageLoading,
  StatCard,
} from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { RoleBadge } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import AccessibleLink from '../../components/auth/AccessibleLink';
import { getWorkforceSnapshot } from '../../services/hrEmployeeApi';
import { getAttendanceKpis } from '../../services/hrAttendanceApi';
import { getLeaveKpis } from '../../services/hrLeaveApi';
import { getPayrollKpis } from '../../services/hrPayrollApi';
import { fmtCurrency } from '../../utils/format';
import { computeWorkforceStats } from '../../utils/hrEmployees';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

function CountBarChart({ data = [], height = 140 }) {
  const max = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  if (!data.length) return <p className="page-header__sub">—</p>;
  return (
    <div className="trend-chart" style={{ height }} role="img" aria-label="Count chart">
      {data.map((point) => {
        const val = Number(point.value) || 0;
        const pct = Math.min(100, (val / max) * 100);
        return (
          <div key={point.label} className="trend-chart__bar-wrap" title={`${point.label}: ${val}`}>
            <div className="trend-chart__bar" style={{ height: `${pct}%` }} />
            <span className="trend-chart__label">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function HRDashboardPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const canViewEmployees = hasCapability(capabilities, 'canViewEmployees');
  const canManageUsers = hasCapability(capabilities, 'canManageOperationalUsers');
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [attendanceKpis, setAttendanceKpis] = useState(null);
  const [leaveKpis, setLeaveKpis] = useState(null);
  const [payrollKpis, setPayrollKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [snap, atk, lk, pk] = await Promise.all([
        getWorkforceSnapshot(),
        getAttendanceKpis().catch(() => null),
        getLeaveKpis().catch(() => null),
        getPayrollKpis().catch(() => null),
      ]);
      setEmployees(snap.employees);
      setUsers(snap.users);
      setAttendanceKpis(atk);
      setLeaveKpis(lk);
      setPayrollKpis(pk);
    } catch (e) {
      setEmployees([]);
      setUsers([]);
      setAttendanceKpis(null);
      setLeaveKpis(null);
      setPayrollKpis(null);
      setError(getUserFriendlyMessage(e, t('hr.dashboard.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(
    () => computeWorkforceStats(employees, users),
    [employees, users],
  );

  const deptChart = useMemo(
    () => stats.byDepartment.map((d) => ({ label: d.label, value: d.value })),
    [stats.byDepartment],
  );

  const roleChart = useMemo(
    () => stats.byRole.map((d) => ({ label: d.label.replace(/^Elmahdi /, ''), value: d.value })),
    [stats.byRole],
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={t('nav.hrOverview')}
        subtitle={t('nav.hrSubtitle')}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />

      <div className="accountant-hero">
        <RoleBadge />
        <p className="accountant-hero__hint">{t('nav.hrHint')}</p>
      </div>

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <section className="layout-grid layout-grid--kpi" aria-label={t('hr.dashboard.kpiLabel')}>
            <StatCard label={t('hr.dashboard.totalEmployees')} value={stats.total} icon="👥" color="blue" compact />
            <StatCard label={t('hr.dashboard.activeEmployees')} value={stats.active} icon="✓" color="green" compact />
            <StatCard label={t('hr.dashboard.withAccess')} value={stats.withAccess} icon="🔐" color="accent" compact />
            <StatCard label={t('hr.dashboard.withoutAccess')} value={stats.withoutAccess} icon="📋" color="default" compact />
            <StatCard label={t('hr.dashboard.newHires')} value={stats.newHires} icon="📅" color="amber" compact />
          </section>

          {attendanceKpis && (
            <LayoutSection title={t('hr.dashboard.todayAttendance', { defaultValue: "Today's attendance" })} variant="raised">
              <section className="layout-grid layout-grid--kpi" aria-label="Today attendance">
                <StatCard label={t('hr.attendance.kpi.present', { defaultValue: 'Present' })} value={attendanceKpis.present} icon="✓" color="green" compact />
                <StatCard label={t('hr.attendance.kpi.absent', { defaultValue: 'Absent' })}   value={attendanceKpis.absent}  icon="✕" color="red" compact />
                <StatCard label={t('hr.attendance.kpi.late', { defaultValue: 'Late' })}       value={attendanceKpis.late}    icon="⏰" color="amber" compact />
                <StatCard label={t('hr.attendance.kpi.onLeave', { defaultValue: 'On leave' })} value={attendanceKpis.on_leave} icon="🏖" color="blue" compact />
              </section>
            </LayoutSection>
          )}

          {leaveKpis && (
            <LayoutSection title={t('hr.dashboard.leaveOverview', { defaultValue: 'Leave overview' })} variant="raised">
              <section className="layout-grid layout-grid--kpi" aria-label="Leave overview">
                <StatCard label={t('hr.leave.kpi.pending', { defaultValue: 'Pending' })}             value={leaveKpis.pending}         icon="⏰" color="amber" compact />
                <StatCard label={t('hr.leave.kpi.approvedMonth', { defaultValue: 'Approved this month' })} value={leaveKpis.approved_month}  icon="✓" color="green" compact />
                <StatCard label={t('hr.leave.kpi.rejectedMonth', { defaultValue: 'Rejected this month' })} value={leaveKpis.rejected_month}  icon="✕" color="red" compact />
                <StatCard label={t('hr.leave.kpi.onLeaveToday', { defaultValue: 'On leave today' })}      value={leaveKpis.on_leave_today}  icon="🏖" color="blue" compact />
              </section>
            </LayoutSection>
          )}

          {payrollKpis && (
            <LayoutSection title={t('hr.dashboard.payrollMonth', { defaultValue: 'Payroll — this month' })} variant="raised">
              <section className="layout-grid layout-grid--kpi" aria-label="Payroll overview">
                <StatCard label={t('hr.payroll.kpi.draft', { defaultValue: 'Draft' })}        value={payrollKpis.draft}        icon="✎" color="default" compact />
                <StatCard label={t('hr.payroll.kpi.submitted', { defaultValue: 'Submitted' })} value={payrollKpis.submitted}    icon="✓" color="amber" compact />
                <StatCard label={t('hr.payroll.kpi.paid', { defaultValue: 'Paid' })}          value={payrollKpis.paid}         icon="💰" color="green" compact />
                <StatCard label={t('hr.payroll.kpi.totalNet', { defaultValue: 'Total net' })} value={fmtCurrency(payrollKpis.total_net)} icon="💵" color="accent" compact />
              </section>
            </LayoutSection>
          )}

          <LayoutSection title={t('hr.dashboard.byDepartment')} variant="raised">
            <CountBarChart data={deptChart} height={140} />
          </LayoutSection>

          <LayoutSection title={t('hr.dashboard.byRole')} variant="raised">
            <CountBarChart data={roleChart} height={140} />
          </LayoutSection>

          <LayoutSection title={t('hr.dashboard.quickLinks')} variant="raised">
            <div className="accountant-links">
              {canViewEmployees && (
                <AccessibleLink to="/hr/employees" className="accountant-links__card">
                  <span className="accountant-links__icon">👥</span>
                  <span className="accountant-links__label">{t('nav.employees')}</span>
                  <span className="accountant-links__desc">{t('hr.dashboard.employeesDesc')}</span>
                </AccessibleLink>
              )}
              {(hasCapability(capabilities, 'canManageAttendance') || hasCapability(capabilities, 'canViewHRReports')) && (
                <AccessibleLink to="/hr/attendance" className="accountant-links__card">
                  <span className="accountant-links__icon">🗓</span>
                  <span className="accountant-links__label">{t('nav.attendance', { defaultValue: 'Attendance' })}</span>
                  <span className="accountant-links__desc">{t('hr.dashboard.attendanceDesc', { defaultValue: 'Daily attendance and KPIs.' })}</span>
                </AccessibleLink>
              )}
              {(hasCapability(capabilities, 'canApproveLeave') || hasCapability(capabilities, 'canRequestLeave') || hasCapability(capabilities, 'canViewHRReports')) && (
                <AccessibleLink to="/hr/leave" className="accountant-links__card">
                  <span className="accountant-links__icon">🏖</span>
                  <span className="accountant-links__label">{t('nav.leave', { defaultValue: 'Leave' })}</span>
                  <span className="accountant-links__desc">{t('hr.dashboard.leaveDesc', { defaultValue: 'Requests, approvals, and balances.' })}</span>
                </AccessibleLink>
              )}
              {(hasCapability(capabilities, 'canManagePayroll') || hasCapability(capabilities, 'canViewHRReports')) && (
                <AccessibleLink to="/hr/payroll" className="accountant-links__card">
                  <span className="accountant-links__icon">💼</span>
                  <span className="accountant-links__label">{t('nav.payroll', { defaultValue: 'Payroll' })}</span>
                  <span className="accountant-links__desc">{t('hr.dashboard.payrollDesc', { defaultValue: 'Generate slips, submit, and mark paid.' })}</span>
                </AccessibleLink>
              )}
              {canManageUsers && (
                <AccessibleLink to="/hr/users" className="accountant-links__card">
                  <span className="accountant-links__icon">🧑‍💼</span>
                  <span className="accountant-links__label">{t('nav.systemUsers')}</span>
                  <span className="accountant-links__desc">{t('hr.dashboard.usersDesc')}</span>
                </AccessibleLink>
              )}
            </div>
          </LayoutSection>
        </>
      )}
    </DashboardLayout>
  );
}

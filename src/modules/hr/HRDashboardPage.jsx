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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await getWorkforceSnapshot();
      setEmployees(snap.employees);
      setUsers(snap.users);
    } catch (e) {
      setEmployees([]);
      setUsers([]);
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

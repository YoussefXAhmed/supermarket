import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDashboardStats } from '../../services/api';
import { StatCard, PageHeader, PageLoading, ApiErrorCard, Badge, PartialDataBanner, Btn, Skeleton } from '../../components/ui';
import TrendChart from '../../components/ui/TrendChart';
import PaginatedTable from '../../components/ui/PaginatedTable';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { fmtCurrency, fmtCurrencyCompact, fmtPercent } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import { isAdministratorPersona } from '../../auth/navigationConfig';

export default function DashboardPage({ monitorOnly = false }) {
  const { t, i18n } = useTranslation();
  const { capabilities } = useAuth();
  const isGovernanceAdmin = isAdministratorPersona(capabilities);
  const canViewInvoices = hasCapability(capabilities, 'canViewInvoices');
  const [stats, setStats] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getDashboardStats()
      .then((data) => {
        setStats(data);
        setWarnings(data.warnings || []);
      })
      .catch((e) => {
        setStats(null);
        setWarnings([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    // Skeleton dashboard: same shape as the real one so layout doesn't shift
    // when data arrives — a far less jarring loading state than a centered spinner.
    return (
      <DashboardLayout className="dashboard">
        <PageHeader title={t('dashboardPage.title')} subtitle={t('dashboardPage.subtitle')} dense />
        <section className="layout-grid layout-grid--kpi" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card stat-card--compact">
              <Skeleton variant="circle" width={34} height={34} />
              <div className="stat-card__body" style={{ flex: 1 }}>
                <Skeleton variant="text" width="55%" />
                <div style={{ height: 6 }} />
                <Skeleton variant="title" width="70%" />
              </div>
            </div>
          ))}
        </section>
        <section className="layout-grid layout-grid--kpi" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card stat-card--compact">
              <Skeleton variant="circle" width={34} height={34} />
              <div className="stat-card__body" style={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" />
                <div style={{ height: 6 }} />
                <Skeleton variant="title" width="50%" />
              </div>
            </div>
          ))}
        </section>
        <div className="card" aria-hidden="true">
          <Skeleton variant="title" width="32%" />
          <div style={{ height: 14 }} />
          <Skeleton variant="block" height={120} />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboardPage.title')} subtitle={t('dashboardPage.subtitle')} dense />
        <ApiErrorCard message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  const invoiceColumns = [
    { key: 'name', label: t('dashboardPage.invoices'), render: (v) => <span className="mono">{v}</span> },
    { key: 'customer', label: t('dashboardPage.customers') },
    { key: 'posting_date', label: t('pos.receiptDate') },
    { key: 'grand_total', label: t('pos.receiptTotal'), render: (v) => fmtCurrency(v) },
    {
      key: 'status',
      label: t('common.view'),
      render: (v) => (
        <Badge color={v === 'Paid' ? 'green' : v === 'Unpaid' ? 'amber' : 'default'}>{v}</Badge>
      ),
    },
  ];

  const trendLabel =
    stats?.lastMonthRevenue > 0
      ? `${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}%`
      : '—';

  const showFinancialKpis = !monitorOnly && stats?.hasFinancialKpis;

  const primaryKpis = [
    {
      label: t('dashboardPage.revenueMtd'),
      value: fmtCurrencyCompact(stats?.revenue || 0),
      icon: '💰',
      color: 'accent',
      trend: stats?.revenueTrend,
    },
    {
      label: t('dashboardPage.salesToday'),
      value: fmtCurrencyCompact(stats?.salesToday || 0),
      icon: '🛍️',
      color: 'blue',
    },
    ...(showFinancialKpis
      ? [{
          label: t('dashboardPage.netProfit'),
          value: fmtCurrencyCompact(stats?.netProfit || 0),
          icon: '📈',
          color: 'green',
        }]
      : []),
    {
      label: t('dashboardPage.salesCountMtd'),
      value: stats?.salesCount || 0,
      icon: '🧾',
      color: 'amber',
    },
  ];

  const secondaryKpis = [
    { label: t('dashboardPage.avgTicket'), value: fmtCurrency(stats?.avgTicket || 0), icon: '🛒', color: 'amber' },
    { label: t('dashboardPage.paid'), value: stats?.paidCount || 0, icon: '✅', color: 'green' },
    { label: t('dashboardPage.products'), value: stats?.itemCount || 0, icon: '📦', color: 'blue' },
    { label: t('dashboardPage.customers'), value: stats?.customerCount || 0, icon: '👥', color: 'accent' },
  ];

  const monthLabel = new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <DashboardLayout className="dashboard">
      <PageHeader
        title={t('dashboardPage.title')}
        subtitle={`${t('dashboardPage.subtitle')} · ${monthLabel}`}
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load}>
            {t('common.refresh')}
          </Btn>
        }
      />

      <PartialDataBanner warnings={warnings} />

      <section className="layout-grid layout-grid--kpi" aria-label="Primary KPIs">
        {primaryKpis.map((k) => (
          <StatCard key={k.label} {...k} compact />
        ))}
      </section>

      <section className="layout-grid layout-grid--kpi" aria-label="Secondary KPIs">
        {secondaryKpis.map((k) => (
          <StatCard key={k.label} {...k} compact />
        ))}
      </section>

      <LayoutSection
        title={t('dashboardPage.salesTrend')}
        subtitle={
          showFinancialKpis
            ? t('dashboardPage.salesTrendSubtitle', {
                margin: fmtPercent(stats?.grossMarginPct ?? 0, 0),
                trend: trendLabel,
              })
            : t('dashboardPage.salesTrendSubtitleNoMargin', { trend: trendLabel })
        }
        variant="raised"
      >
        <TrendChart data={stats?.salesTrend || []} valueKey="value" labelKey="label" />
      </LayoutSection>

      <LayoutSection
        title={t('dashboardPage.recentInvoices')}
        subtitle={t('dashboardPage.thisMonth')}
        variant="raised"
        actions={
          !monitorOnly && canViewInvoices ? (
            <Link to="/admin/invoices" className="btn btn--ghost btn--sm">
              {t('dashboardPage.viewAll')}
            </Link>
          ) : null
        }
      >
        <PaginatedTable
          columns={invoiceColumns}
          data={stats?.invoiceData || []}
          pageSize={8}
          compact
          emptyMsg={t('dashboardPage.noInvoices')}
          rowKey={(r) => r.name}
        />
      </LayoutSection>

      {!monitorOnly && isGovernanceAdmin && (
        <LayoutSection title={t('dashboardPage.quickActions')} subtitle={t('dashboardPage.adminQuickActionsSubtitle')} variant="flat">
          <div className="workflow-bar">
            <div className="workflow-bar__actions" style={{ marginLeft: 0 }}>
              <Link to="/admin/users" className="btn btn--primary btn--sm">{t('nav.users')}</Link>
              <Link to="/admin/products" className="btn btn--ghost btn--sm">{t('nav.products')}</Link>
              <Link to="/admin/reports" className="btn btn--ghost btn--sm">{t('nav.reports')}</Link>
              <Link to="/admin/activity" className="btn btn--ghost btn--sm">{t('nav.activity')}</Link>
              <Link to="/admin/settings" className="btn btn--ghost btn--sm">{t('nav.settings')}</Link>
            </div>
          </div>
        </LayoutSection>
      )}
    </DashboardLayout>
  );
}

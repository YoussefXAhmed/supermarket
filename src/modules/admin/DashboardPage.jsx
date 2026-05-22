import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDashboardStats } from '../../services/api';
import { StatCard, PageHeader, PageLoading, ApiErrorCard, Badge, PartialDataBanner, Btn } from '../../components/ui';
import TrendChart from '../../components/ui/TrendChart';
import PaginatedTable from '../../components/ui/PaginatedTable';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { fmtCurrency, fmtCurrencyCompact, fmtPercent } from '../../utils/format';

export default function DashboardPage() {
  const { t } = useTranslation();
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

  if (loading) return <PageLoading size={24} />;

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')} dense />
        <ApiErrorCard message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  const invoiceColumns = [
    { key: 'name', label: t('admin.dashboard.invoices'), render: (v) => <span className="mono">{v}</span> },
    { key: 'customer', label: t('admin.dashboard.customers') },
    { key: 'posting_date', label: t('finance.table.date') },
    { key: 'grand_total', label: t('purchasing.reports.amount'), render: (v) => fmtCurrency(v) },
    {
      key: 'status',
      label: t('finance.table.status'),
      render: (v) => (
        <Badge color={v === 'Paid' ? 'green' : v === 'Unpaid' ? 'amber' : 'default'}>{v}</Badge>
      ),
    },
  ];

  const primaryKpis = [
    { label: t('admin.dashboard.revenueMtd'), value: fmtCurrencyCompact(stats?.revenue || 0), icon: '💰', color: 'accent', trend: stats?.revenueTrend },
    { label: t('admin.dashboard.estProfit'), value: fmtCurrencyCompact(stats?.estimatedProfit || 0), icon: '📈', color: 'green' },
    { label: t('admin.dashboard.invoices'), value: stats?.invoiceCount || 0, icon: '🧾', color: 'blue' },
    { label: t('admin.dashboard.avgTicket'), value: fmtCurrency(stats?.avgTicket || 0), icon: '🛒', color: 'amber' },
  ];

  const secondaryKpis = [
    { label: t('admin.dashboard.paid'), value: stats?.paidCount || 0, icon: '✅', color: 'green' },
    { label: t('admin.dashboard.unpaid'), value: stats?.unpaidCount || 0, icon: '⏳', color: 'red' },
    { label: t('admin.dashboard.products'), value: stats?.itemCount || 0, icon: '📦', color: 'blue' },
    { label: t('admin.dashboard.customers'), value: stats?.customerCount || 0, icon: '👥', color: 'accent' },
  ];

  return (
    <DashboardLayout className="dashboard">
      <PageHeader
        title={t('admin.dashboard.title')}
        subtitle={`${t('admin.dashboard.primaryKpis')} · ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh')}</Btn>}
      />

      <PartialDataBanner warnings={warnings} />

      <section className="layout-grid layout-grid--kpi" aria-label={t('admin.dashboard.primaryKpis')}>
        {primaryKpis.map((k) => (
          <StatCard key={k.label} {...k} compact />
        ))}
      </section>

      <section className="layout-grid layout-grid--kpi" aria-label={t('admin.dashboard.secondaryKpis')}>
        {secondaryKpis.map((k) => (
          <StatCard key={k.label} {...k} compact />
        ))}
      </section>

      <LayoutSection
        title={t('admin.dashboard.salesTrend')}
        subtitle={`${t('admin.dashboard.recentInvoices')} 14d · est. margin ${fmtPercent(stats?.grossMarginPct ?? 28, 0)}${stats?.lastMonthRevenue > 0 ? ` · ${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}% vs last month` : ''}`}
        variant="raised"
      >
        <TrendChart data={stats?.salesTrend || []} valueKey="value" labelKey="label" />
      </LayoutSection>

      <LayoutSection
        title={t('admin.dashboard.recentInvoices')}
        subtitle={t('admin.dashboard.thisMonth')}
        variant="raised"
        actions={<Link to="/admin/invoices" className="btn btn--ghost btn--sm">{t('common.viewAll')}</Link>}
      >
        <PaginatedTable
          columns={invoiceColumns}
          data={stats?.invoiceData || []}
          pageSize={8}
          compact
          emptyMsg={t('admin.dashboard.noInvoices')}
          rowKey={(r) => r.name}
        />
      </LayoutSection>

      <LayoutSection title={t('admin.dashboard.quickActions')} subtitle={t('admin.dashboard.jumpToModules')} variant="flat">
        <div className="workflow-bar">
          <div className="workflow-bar__actions" style={{ marginLeft: 0 }}>
            <Link to="/pos" className="btn btn--primary btn--sm">{t('common.pos')}</Link>
            <Link to="/inventory" className="btn btn--ghost btn--sm">{t('nav.inventory')}</Link>
            <Link to="/admin/purchasing" className="btn btn--ghost btn--sm">{t('nav.purchasing')}</Link>
            <Link to="/admin/activity" className="btn btn--ghost btn--sm">{t('nav.activity')}</Link>
          </div>
        </div>
      </LayoutSection>
    </DashboardLayout>
  );
}

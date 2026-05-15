import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats } from '../../services/api';
import { StatCard, PageHeader, PageLoading, ApiErrorCard, Badge, PartialDataBanner, Btn } from '../../components/ui';
import TrendChart from '../../components/ui/TrendChart';
import PaginatedTable from '../../components/ui/PaginatedTable';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { fmtCurrency, fmtCurrencyCompact, fmtPercent } from '../../utils/format';

export default function DashboardPage() {
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
        <PageHeader title="Dashboard" subtitle="Business overview" dense />
        <ApiErrorCard message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  const invoiceColumns = [
    { key: 'name', label: 'Invoice', render: (v) => <span className="mono">{v}</span> },
    { key: 'customer', label: 'Customer' },
    { key: 'posting_date', label: 'Date' },
    { key: 'grand_total', label: 'Amount', render: (v) => fmtCurrency(v) },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <Badge color={v === 'Paid' ? 'green' : v === 'Unpaid' ? 'amber' : 'default'}>{v}</Badge>
      ),
    },
  ];

  const primaryKpis = [
    { label: 'Revenue (MTD)', value: fmtCurrencyCompact(stats?.revenue || 0), icon: '💰', color: 'accent', trend: stats?.revenueTrend },
    { label: 'Est. profit', value: fmtCurrencyCompact(stats?.estimatedProfit || 0), icon: '📈', color: 'green' },
    { label: 'Invoices', value: stats?.invoiceCount || 0, icon: '🧾', color: 'blue' },
    { label: 'Avg. ticket', value: fmtCurrency(stats?.avgTicket || 0), icon: '🛒', color: 'amber' },
  ];

  const secondaryKpis = [
    { label: 'Paid', value: stats?.paidCount || 0, icon: '✅', color: 'green' },
    { label: 'Unpaid', value: stats?.unpaidCount || 0, icon: '⏳', color: 'red' },
    { label: 'Products', value: stats?.itemCount || 0, icon: '📦', color: 'blue' },
    { label: 'Customers', value: stats?.customerCount || 0, icon: '👥', color: 'accent' },
  ];

  return (
    <DashboardLayout className="dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={`KPIs · ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load}>Refresh</Btn>}
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
        title="Sales trend"
        subtitle={`Last 14 days · est. margin ${fmtPercent(stats?.grossMarginPct ?? 28, 0)}${stats?.lastMonthRevenue > 0 ? ` · ${stats.revenueTrend >= 0 ? '+' : ''}${stats.revenueTrend}% vs last month` : ''}`}
        variant="raised"
      >
        <TrendChart data={stats?.salesTrend || []} valueKey="value" labelKey="label" />
      </LayoutSection>

      <LayoutSection
        title="Recent invoices"
        subtitle="This month"
        variant="raised"
        actions={<Link to="/admin/invoices" className="btn btn--ghost btn--sm">View all</Link>}
      >
        <PaginatedTable
          columns={invoiceColumns}
          data={stats?.invoiceData || []}
          pageSize={8}
          compact
          emptyMsg="No invoices this month"
          rowKey={(r) => r.name}
        />
      </LayoutSection>

      <LayoutSection title="Quick actions" subtitle="Jump to core modules" variant="flat">
        <div className="workflow-bar">
          <div className="workflow-bar__actions" style={{ marginLeft: 0 }}>
            <Link to="/pos" className="btn btn--primary btn--sm">POS</Link>
            <Link to="/inventory" className="btn btn--ghost btn--sm">Inventory</Link>
            <Link to="/admin/purchasing" className="btn btn--ghost btn--sm">Purchasing</Link>
            <Link to="/admin/activity" className="btn btn--ghost btn--sm">Activity</Link>
          </div>
        </div>
      </LayoutSection>
    </DashboardLayout>
  );
}

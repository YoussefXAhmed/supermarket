import { useEffect, useState } from 'react';
import { getDashboardStats } from '../../services/api';
import { StatCard, PageHeader, Spinner, Badge } from '../../components/ui';

const fmt = (n) => new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <Spinner size={28} />
    </div>
  );

  return (
    <div className="dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={`Overview for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
      />

      {/* ── Stats ── */}
      <div className="stats-grid">
        <StatCard label="Revenue This Month" value={fmt(stats?.revenue || 0)} icon="💰" color="accent" />
        <StatCard label="Invoices This Month" value={stats?.invoiceCount || 0} icon="🧾" color="blue" />
        <StatCard label="Paid Invoices" value={stats?.paidCount || 0} icon="✅" color="green" />
        <StatCard label="Active Products" value={stats?.itemCount || 0} icon="📦" color="red" />
      </div>

      {/* ── Recent Invoices ── */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 16, fontSize: '0.95rem', fontWeight: 600 }}>Recent Invoices</h2>
        {stats?.invoiceData?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(stats.invoiceData || []).slice(0, 10).map(inv => (
                  <tr key={inv.name}>
                    <td className="mono" style={{ fontSize: '0.78rem' }}>{inv.name}</td>
                    <td>{inv.customer || '—'}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>{inv.posting_date}</td>
                    <td className="mono">{fmt(inv.grand_total)}</td>
                    <td>
                      <Badge color={inv.status === 'Paid' ? 'green' : inv.status === 'Unpaid' ? 'amber' : 'default'}>
                        {inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No invoices this month yet.</p>
        )}
      </div>
    </div>
  );
}

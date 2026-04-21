import { useEffect, useState } from 'react';
import { getSalesInvoices } from '../../services/api';
import { PageHeader, Spinner, EmptyState, Badge, Table } from '../../components/ui';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(n || 0);

const STATUS_COLOR = {
  Paid: 'green', Unpaid: 'amber', Overdue: 'red',
  'Return': 'blue', Cancelled: 'default',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 50;

  const load = (p = 0) => {
    setLoading(true);
    getSalesInvoices({ limit: PAGE_SIZE, start: p * PAGE_SIZE })
      .then(r => setInvoices(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const columns = [
    {
      key: 'name', label: 'Invoice #',
      render: v => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>{v}</span>
    },
    { key: 'customer', label: 'Customer' },
    {
      key: 'posting_date', label: 'Date',
      render: v => <span style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>{v}</span>
    },
    {
      key: 'grand_total', label: 'Total',
      render: v => <span className="mono" style={{ fontWeight: 600 }}>{fmt(v)}</span>
    },
    {
      key: 'outstanding_amount', label: 'Outstanding',
      render: v => <span className="mono" style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{fmt(v)}</span>
    },
    {
      key: 'status', label: 'Status',
      render: v => <Badge color={STATUS_COLOR[v] || 'default'}>{v}</Badge>
    },
  ];

  return (
    <div>
      <PageHeader title="Sales Invoices" subtitle="All invoices from ERPNext" />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>
      ) : invoices.length === 0 ? (
        <EmptyState icon="🧾" title="No invoices found" />
      ) : (
        <>
          <Table columns={columns} data={invoices} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >← Prev</button>
            <span style={{ padding: '6px 12px', fontSize: '0.82rem', color: 'var(--text-2)' }}>
              Page {page + 1}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={invoices.length < PAGE_SIZE}
              onClick={() => setPage(p => p + 1)}
            >Next →</button>
          </div>
        </>
      )}
    </div>
  );
}

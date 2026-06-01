import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSalesInvoices } from '../../services/api';
import { PageHeader, PageLoading, ApiErrorCard, EmptyState, Badge, Table } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(n || 0);

const STATUS_COLOR = {
  Paid: 'green', Unpaid: 'amber', Overdue: 'red',
  'Return': 'blue', Cancelled: 'default',
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 50;

  const load = (p = 0) => {
    setLoading(true);
    setError('');
    getSalesInvoices({ limit: PAGE_SIZE, start: p * PAGE_SIZE })
      .then(r => setInvoices(r.data.data || []))
      .catch((e) => {
        setInvoices([]);
        setError(getUserFriendlyMessage(e, t('finance.loadInvoicesError')));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const columns = [
    {
      key: 'name', label: t('finance.invoiceNumber'),
      render: v => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>{v}</span>
    },
    { key: 'customer', label: t('finance.customer') },
    {
      key: 'posting_date', label: t('finance.date'),
      render: v => <span style={{ color: 'var(--text-2)', fontSize: '0.8rem' }}>{v}</span>
    },
    {
      key: 'grand_total', label: t('finance.totalLabel'),
      render: v => <span className="mono" style={{ fontWeight: 600 }}>{fmt(v)}</span>
    },
    {
      key: 'outstanding_amount', label: t('finance.outstandingLabel'),
      render: v => <span className="mono" style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{fmt(v)}</span>
    },
    {
      key: 'status', label: t('finance.table.status'),
      render: v => <Badge color={STATUS_COLOR[v] || 'default'}>{v}</Badge>
    },
  ];

  const sparse = invoices.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader title={t('finance.salesInvoices')} subtitle={t('finance.salesInvoicesSubtitle')} dense />

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={() => load(page)} />
      ) : invoices.length === 0 ? (
        <EmptyState icon="🧾" title={t('finance.noInvoicesFound')} />
      ) : (
        <>
          <LayoutSection variant="raised" flushHead fit={sparse}>
            <TableRegion fit={sparse}>
              <Table columns={columns} data={invoices} compact />
            </TableRegion>
          </LayoutSection>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >← {t('ui.pagination.previous')}</button>
            <span style={{ padding: '6px 12px', fontSize: '0.82rem', color: 'var(--text-2)' }}>
              {t('ui.pagination.pageSimple', { page: page + 1 })}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={invoices.length < PAGE_SIZE}
              onClick={() => setPage(p => p + 1)}
            >{t('ui.pagination.next')} →</button>
          </div>
        </>
      )}
    </TablePageLayout>
  );
}

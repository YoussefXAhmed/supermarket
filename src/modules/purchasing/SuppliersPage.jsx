import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, PageLoading, ApiErrorCard, EmptyState, Table, Btn, Badge } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    listSuppliers({ limit: 300 })
      .then((r) => setRows(r?.data?.data || []))
      .catch((e) => {
        setRows([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    const text = q.trim().toLowerCase();
    if (!text) return true;
    return (
      (r.supplier_name || '').toLowerCase().includes(text) ||
      (r.name || '').toLowerCase().includes(text)
    );
  });

  const columns = [
    {
      key: 'supplier_name',
      label: 'Supplier',
      render: (v, row) => (
        <Link to={`/admin/purchasing/suppliers/${encodeURIComponent(row.name)}`}>{v || row.name}</Link>
      ),
    },
    { key: 'name', label: 'ID', render: (v) => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{v}</span> },
    { key: 'supplier_group', label: 'Group' },
    { key: 'mobile_no', label: 'Mobile', render: (v) => v || '—' },
    { key: 'email_id', label: 'Email', render: (v) => v || '—' },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <Btn variant="ghost" size="sm" onClick={() => navigate(`/admin/purchasing/suppliers/${encodeURIComponent(row.name)}`)}>
          View
        </Btn>
      ),
    },
  ];

  const sparse = filtered.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader
        title="Suppliers"
        subtitle={`${filtered.length} active suppliers`}
        dense
        actions={
          <Btn variant="primary" size="sm" onClick={() => navigate('/admin/purchasing/suppliers/new')}>
            + New supplier
          </Btn>
        }
      />
      <LayoutSection variant="flat" flushHead>
        <input
          className="input toolbar__input-md"
          placeholder="Search suppliers…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </LayoutSection>
      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🏭" title="No suppliers" desc="Create your first supplier to start purchasing." />
      ) : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={filtered} compact />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

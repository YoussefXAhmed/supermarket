import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageLoading, ApiErrorCard, EmptyState, Table, Btn, Badge } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { purchasingPath } from '../../utils/workspacePaths';

export default function SuppliersPage() {
  const { t } = useTranslation();
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
      label: t('purchasing.table.supplier'),
      render: (v, row) => (
        <Link to={purchasingPath(`suppliers/${encodeURIComponent(row.name)}`)}>{v || row.name}</Link>
      ),
    },
    { key: 'name', label: t('inventory.table.id'), render: (v) => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{v}</span> },
    { key: 'supplier_group', label: t('purchasing.table.group') },
    { key: 'mobile_no', label: t('purchasing.table.mobile'), render: (v) => v || '—' },
    { key: 'email_id', label: t('purchasing.table.email'), render: (v) => v || '—' },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <Btn variant="ghost" size="sm" onClick={() => navigate(purchasingPath(`suppliers/${encodeURIComponent(row.name)}`))}>
          {t('common.view')}
        </Btn>
      ),
    },
  ];

  const sparse = filtered.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader
        title={t('nav.suppliers')}
        subtitle={`${filtered.length} active suppliers`}
        dense
        actions={
          <Btn variant="primary" size="sm" onClick={() => navigate(purchasingPath('suppliers/new'))}>
            + {t('purchasing.newSupplier')}
          </Btn>
        }
      />
      <LayoutSection variant="flat" flushHead>
        <input
          className="input toolbar__input-md"
          placeholder={t('purchasing.searchSuppliers')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </LayoutSection>
      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🏭" title={t('purchasing.noSuppliers')} desc={t('purchasing.noSuppliersDesc')} />
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

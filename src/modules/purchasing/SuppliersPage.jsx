import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageLoading, ApiErrorCard, EmptyState, Table, Btn, Badge } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { listSuppliers, listSupplierGroups } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { suppliersPath } from '../../utils/workspacePaths';
import { useAuth } from '../../hooks/useAuth';
import { canManageSuppliers } from '../../auth/navigationConfig';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { capabilities } = useAuth();
  const canManage = canManageSuppliers(capabilities);

  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      listSuppliers({ limit: 300 }),
      listSupplierGroups().catch(() => ({ data: { data: [] } })),
    ])
      .then(([sup, grp]) => {
        setRows(sup?.data?.data || []);
        setCategories(grp?.data?.data || []);
      })
      .catch((e) => {
        setRows([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Build the option list — every supplier's group + every known Supplier
  // Group leaf, so a category that exists but has no suppliers yet still
  // appears, and a supplier with a stale/unknown group still appears.
  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const c of categories) if (c.name) set.add(c.name);
    for (const r of rows) if (r.supplier_group) set.add(r.supplier_group);
    return [...set].sort();
  }, [categories, rows]);

  const filtered = rows.filter((r) => {
    const text = q.trim().toLowerCase();
    const textOk = !text
      || (r.supplier_name || '').toLowerCase().includes(text)
      || (r.name || '').toLowerCase().includes(text);
    const categoryOk =
      categoryFilter === 'all'
        ? true
        : categoryFilter === 'uncategorized'
          ? !r.supplier_group
          : r.supplier_group === categoryFilter;
    return textOk && categoryOk;
  });

  const columns = [
    {
      key: 'supplier_name',
      label: t('purchasing.table.supplier'),
      render: (v, row) => (
        <Link to={suppliersPath(pathname, encodeURIComponent(row.name))}>{v || row.name}</Link>
      ),
    },
    { key: 'name', label: t('inventory.table.id'), render: (v) => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{v}</span> },
    {
      key: 'supplier_group',
      label: t('purchasing.table.category', { defaultValue: 'Category' }),
      render: (v) =>
        v ? (
          <Badge color="blue">{v}</Badge>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>—</span>
        ),
    },
    {
      key: 'supplier_type',
      label: t('purchasing.table.type', { defaultValue: 'Type' }),
      render: (v) =>
        v ? (
          <Badge color={v === 'Company' ? 'green' : v === 'Partnership' ? 'amber' : 'default'}>{v}</Badge>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>—</span>
        ),
    },
    { key: 'country', label: t('purchasing.table.country', { defaultValue: 'Country' }), render: (v) => v || '—' },
    { key: 'mobile_no', label: t('purchasing.table.mobile'), render: (v) => v || '—' },
    { key: 'email_id', label: t('purchasing.table.email'), render: (v) => v || '—' },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <Btn variant="ghost" size="sm" onClick={() => navigate(suppliersPath(pathname, encodeURIComponent(row.name)))}>
          {canManage ? t('common.edit') : t('common.view')}
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
          canManage ? (
            <Btn variant="primary" size="sm" onClick={() => navigate(suppliersPath(pathname, 'new'))}>
              + {t('purchasing.newSupplier')}
            </Btn>
          ) : null
        }
      />
      <LayoutSection variant="flat" flushHead>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input toolbar__input-md"
            placeholder={t('purchasing.searchSuppliers')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 200 }}
          />
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ maxWidth: 240 }}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            <option value="uncategorized">Uncategorized</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
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

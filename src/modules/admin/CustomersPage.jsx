import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, EmptyState, PageHeader, PageLoading, Table } from '../../components/ui';
import ExportToolbar from '../../components/ui/ExportToolbar';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { getCustomers } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function CustomersPage() {
  const { t } = useTranslation();

  const EXPORT_COLUMNS = [
    { key: 'customer_name', label: t('admin.customers.name') },
    { key: 'name', label: t('admin.customers.id') },
    { key: 'customer_type', label: t('admin.customers.type') },
    { key: 'customer_group', label: t('admin.customers.group') },
    { key: 'territory', label: t('admin.customers.territory') },
    { key: 'mobile_no', label: t('admin.customers.mobile') },
  ];

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getCustomers({ limit: 100 })
      .then((r) => {
        setCustomers(r.data.data || []);
      })
      .catch((e) => {
        setCustomers([]);
        setError(getUserFriendlyMessage(e, t('admin.customers.failedToLoad')));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return customers;
    return customers.filter((row) => {
      const haystack = [
        row.customer_name,
        row.name,
        row.customer_type,
        row.customer_group,
        row.territory,
        row.mobile_no,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [customers, query]);

  const columns = [
    { key: 'customer_name', label: t('admin.customers.name') },
    { key: 'name', label: t('admin.customers.id'), render: (v) => <span className="mono mono-subtle">{v}</span> },
    { key: 'customer_type', label: t('admin.customers.type'), render: (v) => v || '—' },
    { key: 'customer_group', label: t('admin.customers.group') },
    { key: 'territory', label: t('admin.customers.territory') },
    { key: 'mobile_no', label: t('admin.customers.mobile'), render: (v) => v || '—' },
  ];

  const sparse = filtered.length > 0 && filtered.length <= 5;
  const layoutClass = [
    'page-layout--list-page',
    sparse ? 'page-layout--table-fit-relaxed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TablePageLayout tableConstrain={sparse} className={layoutClass}>
      <PageHeader
        title={t('admin.customers.title')}
        subtitle={
          query.trim()
            ? `${filtered.length} of ${customers.length} customers`
            : `${customers.length} customers`
        }
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              type="search"
              placeholder={t('admin.customers.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('admin.customers.searchLabel')}
            />
            <select className="input toolbar__input-fixed" disabled aria-label={t('admin.customers.typeFilter')}>
              <option>{t('admin.customers.allTypes')}</option>
            </select>
            <select className="input toolbar__input-fixed" disabled aria-label={t('admin.customers.groupFilter')}>
              <option>{t('admin.customers.allGroups')}</option>
            </select>
          </div>
          <ExportToolbar
            filename="customers"
            title={t('admin.customers.title')}
            columns={EXPORT_COLUMNS}
            rows={filtered}
            disabled={!filtered.length}
          />
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title={query.trim() ? t('admin.customers.noMatching') : t('admin.customers.noCustomers')}
          desc={query.trim() ? t('admin.customers.tryDifferent') : undefined}
        />
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

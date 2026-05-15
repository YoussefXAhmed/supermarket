import { useEffect, useMemo, useState } from 'react';
import { ApiErrorCard, EmptyState, PageHeader, PageLoading, Table } from '../../components/ui';
import ExportToolbar from '../../components/ui/ExportToolbar';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { getCustomers } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const EXPORT_COLUMNS = [
  { key: 'customer_name', label: 'Name' },
  { key: 'name', label: 'ID' },
  { key: 'customer_type', label: 'Type' },
  { key: 'customer_group', label: 'Group' },
  { key: 'territory', label: 'Territory' },
  { key: 'mobile_no', label: 'Mobile' },
];

export default function CustomersPage() {
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
        setError(getUserFriendlyMessage(e, 'Failed to load customers'));
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
    { key: 'customer_name', label: 'Name' },
    { key: 'name', label: 'ID', render: (v) => <span className="mono mono-subtle">{v}</span> },
    { key: 'customer_type', label: 'Type', render: (v) => v || '—' },
    { key: 'customer_group', label: 'Group' },
    { key: 'territory', label: 'Territory' },
    { key: 'mobile_no', label: 'Mobile', render: (v) => v || '—' },
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
        title="Customers"
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
              placeholder="Search customers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search customers"
            />
            <select className="input toolbar__input-fixed" disabled aria-label="Customer type filter">
              <option>All types</option>
            </select>
            <select className="input toolbar__input-fixed" disabled aria-label="Customer group filter">
              <option>All groups</option>
            </select>
          </div>
          <ExportToolbar
            filename="customers"
            title="Customers"
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
          title={query.trim() ? 'No matching customers' : 'No customers yet'}
          desc={query.trim() ? 'Try a different search term.' : undefined}
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

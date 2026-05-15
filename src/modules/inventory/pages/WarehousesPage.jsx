import { useEffect, useMemo, useState } from 'react';
import { ApiErrorCard, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import ExportToolbar from '../../../components/ui/ExportToolbar';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { listWarehouses } from '../../../services/inventoryApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

const EXPORT_COLUMNS = [
  { key: 'warehouse_name', label: 'Warehouse' },
  { key: 'name', label: 'ID' },
  { key: 'warehouse_type', label: 'Type' },
  { key: 'company', label: 'Company' },
  { key: 'parent_warehouse', label: 'Parent' },
];

export default function WarehousesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listWarehouses({ limit: 300 });
      setRows(res?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, 'Failed to load warehouses'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.warehouse_name,
        row.name,
        row.warehouse_type,
        row.company,
        row.parent_warehouse,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [rows, query]);

  const columns = [
    { key: 'warehouse_name', label: 'Warehouse' },
    { key: 'name', label: 'ID', render: (v) => <span className="mono mono-subtle">{v}</span> },
    { key: 'warehouse_type', label: 'Type', render: (v) => v || '—' },
    { key: 'company', label: 'Company' },
    { key: 'parent_warehouse', label: 'Parent', render: (v) => v || '—' },
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
        title="Warehouses"
        subtitle={
          query.trim()
            ? `${filtered.length} of ${rows.length} warehouses`
            : `${rows.length} warehouses`
        }
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              type="search"
              placeholder="Search warehouses…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search warehouses"
            />
            <select className="input toolbar__input-fixed" disabled aria-label="Warehouse type filter">
              <option>All types</option>
            </select>
            <select className="input toolbar__input-fixed" disabled aria-label="Company filter">
              <option>All companies</option>
            </select>
          </div>
          <ExportToolbar
            filename="warehouses"
            title="Warehouses"
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
          icon="🏬"
          title={query.trim() ? 'No matching warehouses' : 'No warehouses found'}
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

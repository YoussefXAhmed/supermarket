import { useEffect, useMemo, useState } from 'react';
import { Badge, EmptyState, PageHeader, PageLoading, Table } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { getStockLedger } from '../../services/api';

export default function InventoryPage() {
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getStockLedger({ limit: 200 })
      .then((r) => setBins(r.data.data || []))
      .catch(() => setBins([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const text = filter.trim().toLowerCase();
    if (!text) return bins;
    return bins.filter(
      (b) =>
        b.item_code?.toLowerCase().includes(text) ||
        b.warehouse?.toLowerCase().includes(text),
    );
  }, [bins, filter]);

  const columns = [
    {
      key: 'item_code',
      label: 'Item Code',
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    { key: 'warehouse', label: 'Warehouse' },
    {
      key: 'actual_qty',
      label: 'In Stock',
      render: (v) => (
        <Badge color={v > 10 ? 'green' : v > 0 ? 'amber' : 'red'}>{v ?? 0}</Badge>
      ),
    },
    { key: 'reserved_qty', label: 'Reserved', render: (v) => <span className="mono">{v ?? 0}</span> },
    { key: 'ordered_qty', label: 'Ordered', render: (v) => <span className="mono">{v ?? 0}</span> },
    {
      key: 'valuation_rate',
      label: 'Val. Rate',
      render: (v) => <span className="mono">EGP {(v || 0).toFixed(2)}</span>,
    },
  ];

  const sparse = filtered.length > 0 && filtered.length <= 8;
  const layoutClass = [
    'page-layout--list-page',
    sparse ? 'page-layout--table-fit-relaxed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TablePageLayout tableConstrain={sparse} className={layoutClass}>
      <PageHeader
        title="Inventory"
        subtitle="Live stock levels from ERPNext Bin"
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              type="search"
              placeholder="Filter by item or warehouse…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter stock"
            />
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📦"
          title={filter.trim() ? 'No matching stock' : 'No stock data'}
          desc={
            filter.trim()
              ? 'Try a different filter.'
              : 'Make sure your Bin records are populated in ERPNext'
          }
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

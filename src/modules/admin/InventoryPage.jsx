import { useEffect, useState } from 'react';
import { getStockLedger } from '../../services/api';
import { PageHeader, Spinner, EmptyState, Badge, Table } from '../../components/ui';

export default function InventoryPage() {
  const [bins, setBins]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');

  useEffect(() => {
    getStockLedger({ limit: 200 })
      .then(r => setBins(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = bins.filter(b =>
    !filter ||
    b.item_code?.toLowerCase().includes(filter.toLowerCase()) ||
    b.warehouse?.toLowerCase().includes(filter.toLowerCase())
  );

  const columns = [
    { key: 'item_code', label: 'Item Code', render: v => <span className="mono" style={{ fontSize: '0.78rem' }}>{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    {
      key: 'actual_qty', label: 'In Stock',
      render: (v) => (
        <Badge color={v > 10 ? 'green' : v > 0 ? 'amber' : 'red'}>
          {v ?? 0}
        </Badge>
      )
    },
    { key: 'reserved_qty', label: 'Reserved', render: v => <span className="mono">{v ?? 0}</span> },
    { key: 'ordered_qty',  label: 'Ordered',  render: v => <span className="mono">{v ?? 0}</span> },
    {
      key: 'valuation_rate', label: 'Val. Rate',
      render: v => <span className="mono">EGP {(v || 0).toFixed(2)}</span>
    },
  ];

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Live stock levels from ERPNext Bin" />

      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 340 }}
          placeholder="Filter by item or warehouse…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📦" title="No stock data" desc="Make sure your Bin records are populated in ERPNext" />
      ) : (
        <Table columns={columns} data={filtered} />
      )}
    </div>
  );
}

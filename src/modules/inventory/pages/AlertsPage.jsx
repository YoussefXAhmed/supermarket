import { useState } from 'react';
import { Badge, Btn, EmptyState, PageHeader, Spinner, Table } from '../../../components/ui';
import { listBins } from '../../../services/inventoryApi';

export default function AlertsPage() {
  const [threshold, setThreshold] = useState(10);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listBins({
        limit: 800,
        filters: [['actual_qty', '<=', Number(threshold)]],
      });
      setRows(res?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Failed to load low stock alerts');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Qty', render: (v) => <Badge color={Number(v || 0) <= 0 ? 'red' : 'amber'}>{Number(v || 0).toFixed(2)}</Badge> },
    { key: 'valuation_rate', label: 'Valuation', render: (v) => <span className="mono">EGP {Number(v || 0).toFixed(2)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Low Stock Alerts" subtitle="Threshold-based alerts from Bin quantities" />
      <div className="card panel">
        <div className="toolbar__group">
          <label className="page-header__sub">Threshold</label>
          <input
            className="input toolbar__input-xs"
            type="number"
            min="0"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          <Btn variant="ghost" size="sm" onClick={load}>Load Alerts</Btn>
        </div>
      </div>

      {loading ? (
        <div className="content-loading"><Spinner size={26} /></div>
      ) : error ? (
        <div className="card content-error">{error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="🚨" title="No low stock alerts loaded" desc="Set threshold and click Load Alerts." />
      ) : (
        <Table columns={columns} data={rows} />
      )}
    </div>
  );
}

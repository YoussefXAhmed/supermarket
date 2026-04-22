import { useEffect, useMemo, useState } from 'react';
import { Btn, EmptyState, PageHeader, Spinner } from '../../components/ui';
import InventoryOverviewCards from '../../components/inventory/InventoryOverviewCards';
import InventoryProductsTable from '../../components/inventory/InventoryProductsTable';
import { getInventorySnapshot } from '../../services/inventoryService';

export default function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState({
    totalProducts: 0,
    totalQty: 0,
    totalValue: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [q, setQ] = useState('');
  const [warehouse, setWarehouse] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await getInventorySnapshot();
      setRows(snapshot.rows);
      setMetrics(snapshot.metrics);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const textOk = !text ||
        (r.item_name || '').toLowerCase().includes(text) ||
        (r.item_code || '').toLowerCase().includes(text);

      // Keep current logic/data shape; warehouse filter is UI-ready and works when warehouse label exists.
      const warehouseLabel = String(r.warehouse || r.warehouse_label || 'all').toLowerCase();
      const warehouseOk = warehouse === 'all' || warehouseLabel === warehouse;
      return textOk && warehouseOk;
    });
  }, [rows, q, warehouse]);

  return (
    <div>
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Products, quantity and valuation snapshot from ERPNext"
        actions={<Btn variant="ghost" size="sm" onClick={load}>Refresh</Btn>}
      />

      <InventoryOverviewCards metrics={metrics} />

      <div className="card panel">
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items by name or code"
            />
            <select
              className="input toolbar__input-fixed"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="all">All Warehouses</option>
            </select>
          </div>
          <a className="btn btn--ghost btn--sm" href="http://localhost:8000/app/item" target="_blank" rel="noreferrer">
            + New Item
          </a>
        </div>
      </div>

      {loading ? (
        <div className="content-loading">
          <Spinner size={28} />
        </div>
      ) : error ? (
        <div className="card content-error">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📦" title="No inventory data" desc="Try a different search term." />
      ) : (
        <InventoryProductsTable rows={filtered} />
      )}
    </div>
  );
}


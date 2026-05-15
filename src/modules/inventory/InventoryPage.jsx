import { useEffect, useMemo, useState } from 'react';
import { Btn, PageHeader, PageLoading, ApiErrorCard } from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getERPDeskUrl } from '../../utils/erpLinks';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import InventoryOverviewCards from '../../components/inventory/InventoryOverviewCards';
import InventoryProductsTable from '../../components/inventory/InventoryProductsTable';
import { getInventorySnapshot, getWarehousesList } from '../../services/inventoryService';
import { useInventoryCapabilities } from '../../hooks/useInventoryCapabilities';

export default function InventoryPage() {
  const { canInventoryViewValuation } = useInventoryCapabilities();
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
  const [warehouseList, setWarehouseList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (wh = warehouse) => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await getInventorySnapshot({
        warehouse: wh === 'all' ? undefined : wh,
      });
      setRows(snapshot.rows);
      setMetrics(snapshot.metrics);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, 'Failed to load inventory'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getWarehousesList().then(setWarehouseList).catch(() => {});
    load('all');
  }, []);

  useEffect(() => {
    load(warehouse);
  }, [warehouse]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const textOk = !text ||
        (r.item_name || '').toLowerCase().includes(text) ||
        (r.item_code || '').toLowerCase().includes(text);
      const warehouseLabel = String(r.warehouse || r.warehouse_label || 'all').toLowerCase();
      const warehouseOk = warehouse === 'all' || warehouseLabel === warehouse;
      return textOk && warehouseOk;
    });
  }, [rows, q, warehouse]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Inventory"
        subtitle="Stock snapshot from ERPNext"
        dense
        actions={<Btn variant="ghost" size="sm" onClick={() => load()}>Refresh</Btn>}
      />

      <InventoryOverviewCards metrics={metrics} showValuation={canInventoryViewValuation} />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar" style={{ margin: 0 }}>
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search items"
            />
            <select
              className="input toolbar__input-fixed"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="all">All warehouses</option>
              {warehouseList.map((w) => (
                <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
              ))}
            </select>
          </div>
          <a className="btn btn--ghost btn--sm" href={getERPDeskUrl('item')} target="_blank" rel="noreferrer">
            + New item
          </a>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={24} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={() => load()} />
      ) : filtered.length === 0 ? (
        <p className="empty-inline">No inventory rows match your filters.</p>
      ) : (
        <LayoutSection
          title="Products"
          subtitle={`${filtered.length} items`}
          variant="raised"
          flushHead
        >
          <InventoryProductsTable rows={filtered} showValuation={canInventoryViewValuation} />
        </LayoutSection>
      )}
    </DashboardLayout>
  );
}

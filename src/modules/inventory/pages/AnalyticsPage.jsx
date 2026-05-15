import { useEffect, useState } from 'react';
import { Btn, PageHeader, PageLoading, ApiErrorCard, Table, StatCard } from '../../../components/ui';
import { AnalyticsLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { getInventoryAnalytics, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { fmtCurrencyCompact } from '../../../utils/format';

export default function AnalyticsPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getWarehousesList().then(setWarehouses).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const analytics = await getInventoryAnalytics({
        warehouse: warehouse === 'all' ? undefined : warehouse,
        days: 30,
      });
      setData(analytics);
    } catch (e) {
      setData(null);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const moverColumns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: 'Name' },
    { key: 'movement_qty', label: '30d movement', render: (v) => Number(v).toFixed(2) },
    { key: 'stock_qty', label: 'Stock', render: (v) => Number(v).toFixed(2) },
  ];

  const deadColumns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: 'Name' },
    { key: 'qty', label: 'Qty', render: (v) => Number(v).toFixed(2) },
    { key: 'value', label: 'Value', render: (v) => fmtCurrencyCompact(v) },
  ];

  const moversSparse = (data?.topMovers?.length || 0) <= 8;
  const deadSparse = (data?.deadStock?.length || 0) <= 8;

  return (
    <AnalyticsLayout>
      <PageHeader
        title="Inventory analytics"
        subtitle="Top movers, dead stock, value trends"
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load}>Refresh</Btn>}
      />

      <LayoutSection variant="flat" flushHead>
        <select className="input toolbar__input-fixed" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          <option value="all">All warehouses</option>
          {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
        </select>
      </LayoutSection>

      {loading ? (
        <PageLoading size={24} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : data ? (
        <>
          <section className="layout-grid layout-grid--kpi">
            <StatCard label="Stock value" value={fmtCurrencyCompact(data.metrics?.totalValue)} icon="💰" color="accent" compact />
            <StatCard label="SKUs" value={data.metrics?.totalProducts ?? 0} icon="📦" color="blue" compact />
            <StatCard label="Low stock" value={data.metrics?.lowStock ?? 0} icon="⚠️" color="amber" compact />
            <StatCard label="Reorder" value={data.metrics?.reorderCount ?? 0} icon="📋" color="red" compact />
          </section>

          <div className="analytics-layout__grid">
            <LayoutSection title="Top movers" subtitle="30 days" variant="raised" fit={moversSparse}>
              <Table columns={moverColumns} data={data.topMovers} emptyMsg="No movement" compact />
            </LayoutSection>

            <LayoutSection title="Dead stock" subtitle="No movement" variant="raised" fit={deadSparse}>
              <Table columns={deadColumns} data={data.deadStock} emptyMsg="None detected" compact />
            </LayoutSection>
          </div>

          <LayoutSection title="Value trend" subtitle="Stock movement" variant="raised">
            <div className="value-trend">
              {data.valueTrend?.map((point) => {
                const maxVal = Math.max(...(data.valueTrend || []).map((p) => p.value), 1);
                const pct = Math.min(100, (point.value / maxVal) * 100);
                return (
                  <div key={point.date} className="value-trend__bar-wrap" title={`${point.date}: ${fmtCurrencyCompact(point.value)}`}>
                    <div className="value-trend__bar" style={{ height: `${pct}%` }} />
                    <span className="value-trend__label">{point.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </LayoutSection>
        </>
      ) : (
        <p className="empty-inline">Select warehouse and click Refresh.</p>
      )}
    </AnalyticsLayout>
  );
}

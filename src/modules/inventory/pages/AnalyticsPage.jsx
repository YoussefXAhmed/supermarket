import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, PageHeader, PageLoading, ApiErrorCard, Table, StatCard } from '../../../components/ui';
import { AnalyticsLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { getInventoryAnalytics, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { fmtCurrencyCompact } from '../../../utils/format';

export default function AnalyticsPage() {
  const { t } = useTranslation();
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
    { key: 'item_code', label: t('inventory.analytics.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: t('inventory.analytics.name') },
    { key: 'movement_qty', label: t('inventory.analytics.movement30d'), render: (v) => Number(v).toFixed(2) },
    { key: 'stock_qty', label: t('inventory.analytics.stock'), render: (v) => Number(v).toFixed(2) },
  ];

  const deadColumns = [
    { key: 'item_code', label: t('inventory.analytics.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: t('inventory.analytics.name') },
    { key: 'qty', label: t('inventory.analytics.qty'), render: (v) => Number(v).toFixed(2) },
    { key: 'value', label: t('inventory.analytics.value'), render: (v) => fmtCurrencyCompact(v) },
  ];

  const moversSparse = (data?.topMovers?.length || 0) <= 8;
  const deadSparse = (data?.deadStock?.length || 0) <= 8;

  return (
    <AnalyticsLayout>
      <PageHeader
        title={t('inventory.analytics.title')}
        subtitle={t('inventory.analytics.subtitle')}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh')}</Btn>}
      />

      <LayoutSection variant="flat" flushHead>
        <select className="input toolbar__input-fixed" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          <option value="all">{t('inventory.allWarehouses')}</option>
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
            <StatCard label={t('inventory.analytics.stockValue')} value={fmtCurrencyCompact(data.metrics?.totalValue)} icon="💰" color="accent" compact />
            <StatCard label={t('inventory.analytics.skus')} value={data.metrics?.totalProducts ?? 0} icon="📦" color="blue" compact />
            <StatCard label={t('inventory.analytics.lowStock')} value={data.metrics?.lowStock ?? 0} icon="⚠️" color="amber" compact />
            <StatCard label={t('inventory.analytics.reorder')} value={data.metrics?.reorderCount ?? 0} icon="📋" color="red" compact />
          </section>

          <div className="analytics-layout__grid">
            <LayoutSection title={t('inventory.analytics.topMovers')} subtitle={t('inventory.analytics.days30')} variant="raised" fit={moversSparse}>
              <Table columns={moverColumns} data={data.topMovers} emptyMsg={t('inventory.analytics.noMovement')} compact />
            </LayoutSection>

            <LayoutSection title={t('inventory.analytics.deadStock')} subtitle={t('inventory.analytics.noMovement')} variant="raised" fit={deadSparse}>
              <Table columns={deadColumns} data={data.deadStock} emptyMsg={t('inventory.analytics.noneDetected')} compact />
            </LayoutSection>
          </div>

          <LayoutSection title={t('inventory.analytics.valueTrend')} subtitle={t('inventory.analytics.stockMovement')} variant="raised">
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
        <p className="empty-inline">{t('inventory.analytics.selectWarehouseHint')}</p>
      )}
    </AnalyticsLayout>
  );
}

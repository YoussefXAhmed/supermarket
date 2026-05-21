import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Badge, Btn, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getReorderSuggestions, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { useInventoryCapabilities } from '../../../hooks/useInventoryCapabilities';
import api from '../../../services/api';

export default function AlertsPage() {
  const { t } = useTranslation();
  const { canInventoryViewValuation } = useInventoryCapabilities();
  const [tab, setTab] = useState('low');
  const [threshold, setThreshold] = useState(10);
  const [warehouse, setWarehouse] = useState('all');
  const [warehouses, setWarehouses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getWarehousesList().then(setWarehouses).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'reorder') {
        const suggestions = await getReorderSuggestions({
          warehouse: warehouse === 'all' ? undefined : warehouse,
        });
        setRows(
          suggestions.map((r) => ({
            item_code: r.item_code,
            warehouse: r.warehouse || '—',
            actual_qty: r.qty,
            reorder_level: r.reorder_level,
            suggested_qty: r.suggested_qty,
          })),
        );
      } else {
        // Centralized sellable stock threshold (never infer client-side).
        const res = await api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
          params: {
            ...(warehouse !== 'all' ? { warehouse } : {}),
            max_sellable_qty: Number(threshold),
            limit: 800,
          },
        });
        setRows(res?.data?.message || []);
      }
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const columns =
    tab === 'reorder'
      ? [
          { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
          { key: 'warehouse', label: t('inventory.table.warehouse') },
          {
            key: 'actual_qty',
            label: t('inventory.table.onHand'),
            render: (v) => <Badge color="amber">{Number(v || 0).toFixed(2)}</Badge>,
          },
          { key: 'reorder_level', label: t('inventory.table.reorderAt'), render: (v) => <span className="mono">{v}</span> },
          { key: 'suggested_qty', label: t('inventory.table.orderQty'), render: (v) => <strong>{v}</strong> },
        ]
      : [
          { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
          { key: 'warehouse', label: t('inventory.table.warehouse') },
          {
            key: 'sellable_qty',
            label: t('inventory.table.sellable'),
            render: (v) => (
              <Badge color={Number(v || 0) <= 0 ? 'red' : 'amber'}>
                {Number(v || 0).toFixed(2)}
              </Badge>
            ),
          },
          ...(canInventoryViewValuation
            ? [
                {
                  key: 'valuation_rate',
                  label: t('inventory.table.valuation'),
                  render: (v) => `EGP ${Number(v || 0).toFixed(2)}`,
                },
              ]
            : []),
        ];

  const sparse = rows.length > 0 && rows.length <= 8;

  return (
    <TablePageLayout className="page-layout--list-page" tableConstrain={sparse}>
      <PageHeader title={t('inventory.alerts.title')} subtitle={t('inventory.alerts.subtitle')} dense />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="pos-view-toggle">
            <button
              type="button"
              className={`pos-view-toggle__btn ${tab === 'low' ? 'pos-view-toggle__btn--active' : ''}`}
              onClick={() => setTab('low')}
            >
              {t('inventory.alerts.lowStock')}
            </button>
            <button
              type="button"
              className={`pos-view-toggle__btn ${tab === 'reorder' ? 'pos-view-toggle__btn--active' : ''}`}
              onClick={() => setTab('reorder')}
            >
              {t('inventory.alerts.reorderLevel')}
            </button>
          </div>
          <div className="toolbar__group">
            <select
              className="input toolbar__input-fixed"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="all">{t('inventory.allWarehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.warehouse_name || w.name}
                </option>
              ))}
            </select>
            {tab === 'low' && (
              <input
                className="input toolbar__input-xs"
                type="number"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                title={t('inventory.alerts.maxQtyThreshold')}
              />
            )}
            <Btn variant="ghost" size="sm" onClick={load}>
              {t('inventory.alerts.load')}
            </Btn>
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🚨" title={t('inventory.alerts.none')} desc={t('inventory.alerts.adjustFilters')} />
      ) : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={rows} compact />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

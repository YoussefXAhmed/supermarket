import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, EmptyState, PageHeader, PageLoading, Pill } from '../../../components/ui';
import { TablePageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { getWarehousesList } from '../../../services/inventoryService';
import { listLowStockItems } from '../../../services/inventoryThresholdsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { fmtNumber } from '../../../utils/format';

function statusTone(status) {
  if (status === 'out') return 'danger';
  if (status === 'alert') return 'warning';
  if (status === 'reorder') return 'info';
  return 'default';
}

function statusLabel(status, t) {
  if (status === 'out') return t('inventory.alerts.statusOut', { defaultValue: 'Out of stock' });
  if (status === 'alert') return t('inventory.alerts.statusAlert', { defaultValue: 'Below alert level' });
  if (status === 'reorder') return t('inventory.alerts.statusReorder', { defaultValue: 'At reorder level' });
  return status;
}

export default function AlertsPage() {
  const { t } = useTranslation();
  const [warehouse, setWarehouse] = useState('all');
  const [warehouses, setWarehouses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getWarehousesList().then(setWarehouses).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listLowStockItems(warehouse === 'all' ? '' : warehouse);
      setRows(res.rows || []);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => { load(); }, [load]);

  return (
    <TablePageLayout>
      <PageHeader
        title={t('inventory.alerts.title')}
        subtitle={t('inventory.alerts.subtitleItemLevel', {
          defaultValue: 'Items at or below their item-level alert threshold',
        })}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load} disabled={loading}>{t('common.refresh')}</Btn>}
      />

      <LayoutSection variant="flat" flushHead>
        <div className="filter-bar">
          <label className="filter-bar__field">
            <span>{t('inventory.table.warehouse')}</span>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="all">{t('inventory.allWarehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
              ))}
            </select>
          </label>
        </div>
      </LayoutSection>

      {loading && <PageLoading size={26} />}
      {!loading && error && <ApiErrorCard message={error} onRetry={load} />}
      {!loading && !error && (
        <LayoutSection variant="raised">
          {rows.length === 0 ? (
            <EmptyState
              icon="✓"
              title={t('inventory.alerts.noneTitle', { defaultValue: 'No items below alert level' })}
              desc={t('inventory.alerts.noneDesc', {
                defaultValue: 'Set alert thresholds on items from their detail page to monitor low stock.',
              })}
            />
          ) : (
            <table className="data-table data-table--fill">
              <thead>
                <tr>
                  <th>{t('inventory.alerts.colItem', { defaultValue: 'Item' })}</th>
                  <th>{t('inventory.table.warehouse')}</th>
                  <th className="num">{t('inventory.alerts.colCurrent', { defaultValue: 'Current Qty' })}</th>
                  <th className="num">{t('inventory.alerts.colAlert', { defaultValue: 'Alert Level' })}</th>
                  <th>{t('inventory.alerts.colStatus', { defaultValue: 'Status' })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.item_code}-${row.warehouse}`}>
                    <td className="fill-col">
                      <div>{row.item_name}</div>
                      <div className="mono mono--muted">{row.item_code}</div>
                    </td>
                    <td>{row.warehouse}</td>
                    <td className="num">{fmtNumber(row.actual_qty)} {row.stock_uom}</td>
                    <td className="num">{fmtNumber(row.alert_level)}</td>
                    <td><Pill tone={statusTone(row.status)}>{statusLabel(row.status, t)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

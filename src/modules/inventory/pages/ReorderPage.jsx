import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, EmptyState, PageHeader, PageLoading, Pill } from '../../../components/ui';
import { TablePageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { getWarehousesList } from '../../../services/inventoryService';
import { listReorderItems } from '../../../services/inventoryThresholdsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { fmtNumber } from '../../../utils/format';
import { useAuth } from '../../../hooks/useAuth';
import { purchasingPath } from '../../../utils/workspacePaths';

export default function ReorderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities } = useAuth();
  const canPurchase = Boolean(capabilities?.canAccessPurchasing || capabilities?.canManageSystem);

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
      const res = await listReorderItems(warehouse === 'all' ? '' : warehouse);
      setRows(res.rows || []);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  useEffect(() => { load(); }, [load]);

  const createRequest = (row) => {
    const params = new URLSearchParams({
      item: row.item_code,
      qty: String(row.suggested_qty || row.reorder_level || 1),
      warehouse: row.warehouse,
    });
    navigate(`${purchasingPath('receive')}?${params.toString()}`);
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('inventory.reorder.title')}
        subtitle={t('inventory.reorder.subtitleItemLevel', {
          defaultValue: 'Items at or below their item-level reorder threshold',
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
              title={t('inventory.reorder.noneTitle', { defaultValue: 'Nothing to reorder' })}
              desc={t('inventory.reorder.noneDesc', {
                defaultValue: 'Items will appear here when their stock drops to or below their reorder level.',
              })}
            />
          ) : (
            <table className="data-table data-table--fill">
              <thead>
                <tr>
                  <th>{t('inventory.alerts.colItem', { defaultValue: 'Item' })}</th>
                  <th>{t('inventory.table.warehouse')}</th>
                  <th className="num">{t('inventory.alerts.colCurrent', { defaultValue: 'Current Qty' })}</th>
                  <th className="num">{t('inventory.reorder.colReorder', { defaultValue: 'Reorder Level' })}</th>
                  <th className="num">{t('inventory.reorder.colSuggested', { defaultValue: 'Suggested Qty' })}</th>
                  <th aria-label="Action"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const critical = row.alert_level > 0 && row.actual_qty <= row.alert_level;
                  return (
                    <tr key={`${row.item_code}-${row.warehouse}`}>
                      <td className="fill-col">
                        <div>{row.item_name}</div>
                        <div className="mono mono--muted">{row.item_code}</div>
                      </td>
                      <td>{row.warehouse}</td>
                      <td className="num">
                        {critical ? (
                          <Pill tone="danger">{fmtNumber(row.actual_qty)} {row.stock_uom}</Pill>
                        ) : (
                          <span>{fmtNumber(row.actual_qty)} {row.stock_uom}</span>
                        )}
                      </td>
                      <td className="num">{fmtNumber(row.reorder_level)}</td>
                      <td className="num">
                        <strong>{fmtNumber(row.suggested_qty || 0)}</strong>
                      </td>
                      <td>
                        {canPurchase && (
                          <Btn variant="primary" size="sm" onClick={() => createRequest(row)}>
                            {t('inventory.reorder.createRequest', { defaultValue: 'Create Purchase Request' })}
                          </Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

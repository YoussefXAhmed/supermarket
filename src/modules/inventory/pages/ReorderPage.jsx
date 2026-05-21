import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Btn, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getReorderSuggestions, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { exportToCsv } from '../../../utils/exportCsv';

export default function ReorderPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('all');
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
      const data = await getReorderSuggestions({ warehouse: warehouse === 'all' ? undefined : warehouse });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    exportToCsv(`reorder-suggestions-${warehouse}`, [
      { key: 'item_code', label: t('inventory.stockEntry.itemCode') },
      { key: 'item_name', label: t('inventory.table.name') },
      { key: 'qty', label: t('inventory.table.currentQty'), export: (r) => r.qty },
      { key: 'reorder_level', label: t('inventory.alerts.reorderLevel'), export: (r) => r.reorder_level },
      { key: 'suggested_qty', label: t('inventory.reorder.suggestedOrder'), export: (r) => r.suggested_qty },
    ], rows);
  };

  const columns = [
    { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: t('inventory.table.name') },
    { key: 'qty', label: t('inventory.table.onHand'), render: (v) => <Badge color={Number(v) <= 0 ? 'red' : 'amber'}>{Number(v).toFixed(2)}</Badge> },
    { key: 'reorder_level', label: t('inventory.alerts.reorderLevel'), render: (v) => <span className="mono">{v}</span> },
    { key: 'suggested_qty', label: t('inventory.reorder.suggestedQty'), render: (v) => <strong className="mono">{Number(v).toFixed(0)}</strong> },
  ];

  const sparse = rows.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader
        title={t('inventory.reorder.title')}
        subtitle={t('inventory.reorder.subtitle')}
        dense
        actions={rows.length ? <Btn variant="ghost" size="sm" onClick={exportCsv}>{t('inventory.reports.exportCsv')}</Btn> : null}
      />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="all">{t('inventory.allWarehouses')}</option>
            {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
          </select>
          <Btn variant="ghost" size="sm" onClick={load}>{t('inventory.reorder.load')}</Btn>
        </div>
      </LayoutSection>
      {loading ? <PageLoading size={26} /> : error ? <ApiErrorCard message={error} onRetry={load} /> : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={rows} compact emptyMsg={t('inventory.reorder.empty')} />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

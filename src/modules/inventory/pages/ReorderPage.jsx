import { useEffect, useState } from 'react';
import { Badge, Btn, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getReorderSuggestions, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { exportToCsv } from '../../../utils/exportCsv';

export default function ReorderPage() {
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
      { key: 'item_code', label: 'Item Code' },
      { key: 'item_name', label: 'Name' },
      { key: 'qty', label: 'Current Qty', export: (r) => r.qty },
      { key: 'reorder_level', label: 'Reorder Level', export: (r) => r.reorder_level },
      { key: 'suggested_qty', label: 'Suggested Order', export: (r) => r.suggested_qty },
    ], rows);
  };

  const columns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'item_name', label: 'Name' },
    { key: 'qty', label: 'On hand', render: (v) => <Badge color={Number(v) <= 0 ? 'red' : 'amber'}>{Number(v).toFixed(2)}</Badge> },
    { key: 'reorder_level', label: 'Reorder level', render: (v) => <span className="mono">{v}</span> },
    { key: 'suggested_qty', label: 'Suggested qty', render: (v) => <strong className="mono">{Number(v).toFixed(0)}</strong> },
  ];

  const sparse = rows.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader
        title="Reorder suggestions"
        subtitle="Items at or below reorder level from ERPNext Item reorder table"
        dense
        actions={rows.length ? <Btn variant="ghost" size="sm" onClick={exportCsv}>Export CSV</Btn> : null}
      />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="all">All warehouses</option>
            {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
          </select>
          <Btn variant="ghost" size="sm" onClick={load}>Load suggestions</Btn>
        </div>
      </LayoutSection>
      {loading ? <PageLoading size={26} /> : error ? <ApiErrorCard message={error} onRetry={load} /> : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={rows} compact emptyMsg="Load to see reorder suggestions" />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

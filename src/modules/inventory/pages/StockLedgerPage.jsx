import { useState } from 'react';
import { Btn, EmptyState, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { listStockLedger } from '../../../services/inventoryApi';

export default function StockLedgerPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [itemCode, setItemCode] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const filters = itemCode.trim() ? [['item_code', '=', itemCode.trim()]] : undefined;
      const res = await listStockLedger({ limit: 300, filters });
      setRows(res?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, 'Failed to load stock ledger'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'posting_date', label: 'Date' },
    { key: 'posting_time', label: 'Time' },
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Qty Change', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'qty_after_transaction', label: 'Balance', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'voucher_type', label: 'Voucher' },
    { key: 'voucher_no', label: 'No.' },
  ];

  const sparse = rows.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader title="Stock Ledger" subtitle="Movement history from Stock Ledger Entry" dense />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <input className="input toolbar__input-sm" placeholder="Filter by item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
          <Btn variant="ghost" size="sm" onClick={load}>Load Movements</Btn>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="📒" title="No ledger entries loaded" desc="Use filter and click Load Movements." />
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

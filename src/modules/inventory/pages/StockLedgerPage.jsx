import { useState } from 'react';
import { Btn, EmptyState, PageHeader, Spinner, Table } from '../../../components/ui';
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
      setError(e.message || 'Failed to load stock ledger');
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

  return (
    <div>
      <PageHeader title="Stock Ledger" subtitle="Movement history from Stock Ledger Entry" />
      <div className="card panel">
        <div className="toolbar__group">
          <input className="input toolbar__input-sm" placeholder="Filter by item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
          <Btn variant="ghost" size="sm" onClick={load}>Load Movements</Btn>
        </div>
      </div>

      {loading ? (
        <div className="content-loading"><Spinner size={26} /></div>
      ) : error ? (
        <div className="card content-error">{error}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="📒" title="No ledger entries loaded" desc="Use filter and click Load Movements." />
      ) : (
        <Table columns={columns} data={rows} />
      )}
    </div>
  );
}

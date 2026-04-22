import { useState } from 'react';
import { Btn, EmptyState, PageHeader, Spinner, Table } from '../../../components/ui';
import { listBins, listStockLedger } from '../../../services/inventoryApi';

export default function ReportsPage() {
  const [balanceRows, setBalanceRows] = useState([]);
  const [movementRows, setMovementRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const [balanceRes, movementRes] = await Promise.all([
        listBins({ limit: 800 }),
        listStockLedger({ limit: 200 }),
      ]);
      setBalanceRows(balanceRes?.data?.data || []);
      setMovementRows(movementRes?.data?.data || []);
    } catch (e) {
      setBalanceRows([]);
      setMovementRows([]);
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const balanceColumns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Stock Balance', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'valuation_rate', label: 'Valuation', render: (v) => <span className="mono">EGP {Number(v || 0).toFixed(2)}</span> },
  ];

  const movementColumns = [
    { key: 'posting_date', label: 'Date' },
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Qty Change', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'voucher_type', label: 'Voucher' },
    { key: 'voucher_no', label: 'No.' },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock balance and movement reports from ERPNext"
        actions={<Btn variant="ghost" size="sm" onClick={loadReports}>Load Reports</Btn>}
      />

      {loading ? (
        <div className="content-loading"><Spinner size={26} /></div>
      ) : error ? (
        <div className="card content-error">{error}</div>
      ) : (
        <>
          <div className="card panel">
            <h3 className="section-title">Stock Balance</h3>
            {balanceRows.length === 0 ? (
              <EmptyState icon="📊" title="No stock balance rows loaded" />
            ) : (
              <Table columns={balanceColumns} data={balanceRows} />
            )}
          </div>

          <div className="card">
            <h3 className="section-title">Recent Movement</h3>
            {movementRows.length === 0 ? (
              <EmptyState icon="📈" title="No movement rows loaded" />
            ) : (
              <Table columns={movementColumns} data={movementRows} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

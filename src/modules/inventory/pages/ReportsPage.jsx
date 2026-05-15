import { useEffect, useState, useMemo } from 'react';
import { Btn, EmptyState, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { getStockBalanceReport, getWarehousesList } from '../../../services/inventoryService';
import { listStockLedger } from '../../../services/inventoryApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { exportToCsv, printElement } from '../../../utils/exportCsv';

export default function ReportsPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('all');
  const [itemSearch, setItemSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [balanceGrouped, setBalanceGrouped] = useState([]);
  const [movementRows, setMovementRows] = useState([]);
  const [groupByWarehouse, setGroupByWarehouse] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getWarehousesList().then(setWarehouses).catch(() => {});
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setFromDate(d.toISOString().slice(0, 10));
  }, []);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const [balance, movementRes] = await Promise.all([
        getStockBalanceReport({
          warehouse: warehouse === 'all' ? undefined : warehouse,
          itemSearch,
        }),
        listStockLedger({
          limit: 300,
          filters: [
            ...(warehouse !== 'all' ? [['warehouse', '=', warehouse]] : []),
            ...(fromDate ? [['posting_date', '>=', fromDate]] : []),
          ],
        }),
      ]);
      setBalanceGrouped(balance.grouped);
      setMovementRows(movementRes?.data?.data || []);
    } catch (e) {
      setBalanceGrouped([]);
      setMovementRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const flatBalance = useMemo(
    () => balanceGrouped.flatMap((g) => g.items.map((i) => ({ ...i, warehouse: g.warehouse }))),
    [balanceGrouped]
  );

  const exportBalance = () => {
    exportToCsv(`stock-balance-${warehouse}`, [
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'item_code', label: 'Item' },
      { key: 'actual_qty', label: 'Qty', export: (r) => r.actual_qty },
      { key: 'available_qty', label: 'Available', export: (r) => r.available_qty },
      { key: 'stock_value', label: 'Value', export: (r) => r.stock_value },
    ], flatBalance);
  };

  const balanceColumns = [
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'actual_qty', label: 'Balance', render: (v) => Number(v || 0).toFixed(2) },
    { key: 'available_qty', label: 'Available', render: (v) => Number(v || 0).toFixed(2) },
    { key: 'stock_value', label: 'Value', render: (v) => `EGP ${Number(v || 0).toFixed(2)}` },
  ];

  const movementColumns = [
    { key: 'posting_date', label: 'Date' },
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Qty', render: (v) => Number(v || 0).toFixed(2) },
    { key: 'voucher_type', label: 'Type' },
    { key: 'voucher_no', label: 'No.' },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock balance, movement, export and print"
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={loadReports}>Load</Btn>
            {flatBalance.length > 0 && <Btn variant="ghost" size="sm" onClick={exportBalance}>Export CSV</Btn>}
            {flatBalance.length > 0 && <Btn variant="ghost" size="sm" onClick={() => printElement('inv-report-print')}>Print</Btn>}
          </>
        }
      />

      <div className="card panel">
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="all">All warehouses</option>
            {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
          </select>
          <input className="input toolbar__input-sm" placeholder="Filter item code" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
          <input className="input toolbar__input-fixed" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="Movement from date" />
          <label className="inv-checkbox">
            <input type="checkbox" checked={groupByWarehouse} onChange={(e) => setGroupByWarehouse(e.target.checked)} />
            Group by warehouse
          </label>
        </div>
      </div>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={loadReports} />
      ) : (
        <div id="inv-report-print">
          {groupByWarehouse ? (
            balanceGrouped.map((group) => (
              <div key={group.warehouse} className="card panel">
                <h3 className="section-title">
                  {group.warehouse}
                  <span className="page-header__sub" style={{ marginLeft: 8 }}>
                    Qty {group.total_qty.toFixed(0)} · EGP {group.total_value.toFixed(2)}
                  </span>
                </h3>
                {group.items.length === 0 ? (
                  <EmptyState title="No rows" />
                ) : (
                  <Table columns={balanceColumns} data={group.items} />
                )}
              </div>
            ))
          ) : (
            <div className="card panel">
              <h3 className="section-title">Stock balance</h3>
              <Table columns={[{ key: 'warehouse', label: 'Warehouse' }, ...balanceColumns]} data={flatBalance} />
            </div>
          )}

          <div className="card panel">
            <h3 className="section-title">Stock movement</h3>
            {movementRows.length === 0 ? (
              <EmptyState icon="📈" title="No movement rows" />
            ) : (
              <Table columns={movementColumns} data={movementRows} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

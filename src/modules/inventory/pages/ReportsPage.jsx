import { useEffect, useMemo, useState } from 'react';
import { ApiErrorCard, Btn, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { listStockLedger } from '../../../services/inventoryApi';
import { getStockBalanceReport, getWarehousesList } from '../../../services/inventoryService';
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
    [balanceGrouped],
  );

  const exportBalance = () => {
    exportToCsv(
      `stock-balance-${warehouse}`,
      [
        { key: 'warehouse', label: 'Warehouse' },
        { key: 'item_code', label: 'Item' },
        { key: 'actual_qty', label: 'Qty', export: (r) => r.actual_qty },
        { key: 'available_qty', label: 'Available', export: (r) => r.available_qty },
        { key: 'stock_value', label: 'Value', export: (r) => r.stock_value },
      ],
      flatBalance,
    );
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
    <TablePageLayout className="page-layout--list-page">
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock balance, movement, export and print"
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={loadReports}>
              Load
            </Btn>
            {flatBalance.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={exportBalance}>
                Export CSV
              </Btn>
            )}
            {flatBalance.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={() => printElement('inv-report-print')}>
                Print
              </Btn>
            )}
          </>
        }
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <select
              className="input toolbar__input-fixed"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="all">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.warehouse_name || w.name}
                </option>
              ))}
            </select>
            <input
              className="input toolbar__input-sm"
              placeholder="Filter item code"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <input
              className="input toolbar__input-fixed"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="Movement from date"
            />
            <label className="inv-checkbox">
              <input
                type="checkbox"
                checked={groupByWarehouse}
                onChange={(e) => setGroupByWarehouse(e.target.checked)}
              />
              Group by warehouse
            </label>
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={loadReports} />
      ) : (
        <div id="inv-report-print">
          {groupByWarehouse
            ? balanceGrouped.map((group) => (
                <LayoutSection
                  key={group.warehouse}
                  variant="raised"
                  title={group.warehouse}
                  subtitle={`Qty ${group.total_qty.toFixed(0)} · EGP ${group.total_value.toFixed(2)}`}
                >
                  {group.items.length === 0 ? (
                    <EmptyState title="No rows" />
                  ) : (
                    <TableRegion>
                      <Table columns={balanceColumns} data={group.items} compact />
                    </TableRegion>
                  )}
                </LayoutSection>
              ))
            : (
                <LayoutSection variant="raised" title="Stock balance">
                  <TableRegion>
                    <Table
                      columns={[{ key: 'warehouse', label: 'Warehouse' }, ...balanceColumns]}
                      data={flatBalance}
                      compact
                    />
                  </TableRegion>
                </LayoutSection>
              )}

          <LayoutSection variant="raised" title="Stock movement">
            {movementRows.length === 0 ? (
              <EmptyState icon="📈" title="No movement rows" />
            ) : (
              <TableRegion>
                <Table columns={movementColumns} data={movementRows} compact />
              </TableRegion>
            )}
          </LayoutSection>
        </div>
      )}
    </TablePageLayout>
  );
}

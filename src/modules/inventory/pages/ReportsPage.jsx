import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { listStockLedger } from '../../../services/inventoryApi';
import { getStockBalanceReport, getWarehousesList } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { exportToCsv, printElement } from '../../../utils/exportCsv';

export default function ReportsPage() {
  const { t } = useTranslation();
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
        { key: 'warehouse', label: t('inventory.table.warehouse') },
        { key: 'item_code', label: t('inventory.stockEntry.item') },
        { key: 'actual_qty', label: t('inventory.stockEntry.qty'), export: (r) => r.actual_qty },
        { key: 'available_qty', label: t('inventory.available'), export: (r) => r.available_qty },
        { key: 'stock_value', label: t('inventory.table.value'), export: (r) => r.stock_value },
      ],
      flatBalance,
    );
  };

  const balanceColumns = [
    { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'actual_qty', label: t('inventory.table.balance'), render: (v) => Number(v || 0).toFixed(2) },
    { key: 'available_qty', label: t('inventory.available'), render: (v) => Number(v || 0).toFixed(2) },
    { key: 'stock_value', label: t('inventory.table.value'), render: (v) => `EGP ${Number(v || 0).toFixed(2)}` },
  ];

  const movementColumns = [
    { key: 'posting_date', label: t('finance.table.date') },
    { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: t('inventory.table.warehouse') },
    { key: 'actual_qty', label: t('inventory.stockEntry.qty'), render: (v) => Number(v || 0).toFixed(2) },
    { key: 'voucher_type', label: t('inventory.table.type') },
    { key: 'voucher_no', label: t('inventory.table.no') },
  ];

  return (
    <TablePageLayout className="page-layout--list-page">
      <PageHeader
        title={t('inventory.reports.title')}
        subtitle={t('inventory.reports.subtitle')}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={loadReports}>
              {t('inventory.reports.load')}
            </Btn>
            {flatBalance.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={exportBalance}>
                {t('inventory.reports.exportCsv')}
              </Btn>
            )}
            {flatBalance.length > 0 && (
              <Btn variant="ghost" size="sm" onClick={() => printElement('inv-report-print')}>
                {t('inventory.reports.print')}
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
              <option value="all">{t('inventory.allWarehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.warehouse_name || w.name}
                </option>
              ))}
            </select>
            <input
              className="input toolbar__input-sm"
              placeholder={t('inventory.reports.filterItemCode')}
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <input
              className="input toolbar__input-fixed"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title={t('inventory.reports.movementFromDate')}
            />
            <label className="inv-checkbox">
              <input
                type="checkbox"
                checked={groupByWarehouse}
                onChange={(e) => setGroupByWarehouse(e.target.checked)}
              />
              {t('inventory.reports.groupByWarehouse')}
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
                    <EmptyState title={t('inventory.reports.noRows')} />
                  ) : (
                    <TableRegion>
                      <Table columns={balanceColumns} data={group.items} compact />
                    </TableRegion>
                  )}
                </LayoutSection>
              ))
            : (
                <LayoutSection variant="raised" title={t('inventory.reports.stockBalance')}>
                  <TableRegion>
                    <Table
                      columns={[{ key: 'warehouse', label: t('inventory.table.warehouse') }, ...balanceColumns]}
                      data={flatBalance}
                      compact
                    />
                  </TableRegion>
                </LayoutSection>
              )}

          <LayoutSection variant="raised" title={t('inventory.reports.stockMovement')}>
            {movementRows.length === 0 ? (
              <EmptyState icon="📈" title={t('inventory.reports.noMovementRows')} />
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

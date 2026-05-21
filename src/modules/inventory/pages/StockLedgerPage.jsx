import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, EmptyState, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { listStockLedger } from '../../../services/inventoryApi';

export default function StockLedgerPage() {
  const { t } = useTranslation();
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
    { key: 'posting_date', label: t('finance.table.date') },
    { key: 'posting_time', label: t('inventory.table.time') },
    { key: 'item_code', label: t('inventory.stockEntry.item'), render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse', label: t('inventory.table.warehouse') },
    { key: 'actual_qty', label: t('inventory.table.qtyChange'), render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'qty_after_transaction', label: t('inventory.table.balance'), render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'voucher_type', label: t('inventory.table.voucher') },
    { key: 'voucher_no', label: t('inventory.table.no') },
  ];

  const sparse = rows.length <= 8;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader title={t('inventory.ledger.title')} subtitle={t('inventory.ledger.subtitle')} dense />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <input className="input toolbar__input-sm" placeholder={t('inventory.ledger.filterItemCode')} value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
          <Btn variant="ghost" size="sm" onClick={load}>{t('inventory.ledger.load')}</Btn>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="📒" title={t('inventory.ledger.emptyTitle')} desc={t('inventory.ledger.emptyDesc')} />
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

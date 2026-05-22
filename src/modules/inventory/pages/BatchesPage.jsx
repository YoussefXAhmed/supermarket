import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Badge, Btn, PageHeader, PageLoading, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getBatchAlerts } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function BatchesPage() {
  const { t } = useTranslation();
  const [daysAhead, setDaysAhead] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBatchAlerts({ daysAhead: Number(daysAhead) });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'batch_no', label: t('inventory.batches.batchLabel'), render: (v) => <span className="mono">{v}</span> },
    { key: 'item_code', label: t('inventory.batches.itemLabel'), render: (v) => <span className="mono">{v}</span> },
    { key: 'qty', label: t('inventory.batches.qtyLabel'), render: (v) => Number(v || 0).toFixed(2) },
    { key: 'expiry_date', label: t('inventory.batches.expiryLabel') },
    {
      key: 'days_until_expiry',
      label: t('inventory.batches.daysLeft'),
      render: (v, row) => (
        <Badge color={row.status === 'expired' ? 'red' : 'amber'}>{v ?? '—'}</Badge>
      ),
    },
    {
      key: 'status',
      label: t('inventory.batches.status'),
      render: (v) => <Badge color={v === 'expired' ? 'red' : 'amber'}>{v}</Badge>,
    },
  ];

  const sparse = rows.length > 0 && rows.length <= 8;

  return (
    <TablePageLayout className="page-layout--list-page" tableConstrain={sparse}>
      <PageHeader
        title={t('inventory.batches.title')}
        subtitle={t('inventory.batches.subtitle')}
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <label className="page-header__sub">{t('inventory.batches.alertWithin')}</label>
            <input
              className="input toolbar__input-xs"
              type="number"
              min="1"
              value={daysAhead}
              onChange={(e) => setDaysAhead(e.target.value)}
            />
            <Btn variant="ghost" size="sm" onClick={load}>
              {t('inventory.batches.loadBatches')}
            </Btn>
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table
              columns={columns}
              data={rows}
              compact
            emptyMsg={t('inventory.batches.empty')}
            />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

import { useState } from 'react';
import { ApiErrorCard, Badge, Btn, PageHeader, PageLoading, Table } from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getBatchAlerts } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function BatchesPage() {
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
    { key: 'batch_no', label: 'Batch', render: (v) => <span className="mono">{v}</span> },
    { key: 'item_code', label: 'Item', render: (v) => <span className="mono">{v}</span> },
    { key: 'qty', label: 'Qty', render: (v) => Number(v || 0).toFixed(2) },
    { key: 'expiry_date', label: 'Expiry' },
    {
      key: 'days_until_expiry',
      label: 'Days left',
      render: (v, row) => (
        <Badge color={row.status === 'expired' ? 'red' : 'amber'}>{v ?? '—'}</Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <Badge color={v === 'expired' ? 'red' : 'amber'}>{v}</Badge>,
    },
  ];

  const sparse = rows.length > 0 && rows.length <= 8;

  return (
    <TablePageLayout className="page-layout--list-page" tableConstrain={sparse}>
      <PageHeader
        title="Batch & Expiry"
        subtitle="Near-expiry and expired batches from ERPNext"
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <label className="page-header__sub">Alert within (days)</label>
            <input
              className="input toolbar__input-xs"
              type="number"
              min="1"
              value={daysAhead}
              onChange={(e) => setDaysAhead(e.target.value)}
            />
            <Btn variant="ghost" size="sm" onClick={load}>
              Load batches
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
              emptyMsg="No near-expiry batches — click Load batches"
            />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

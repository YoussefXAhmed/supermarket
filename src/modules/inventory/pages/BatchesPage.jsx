import { useState } from 'react';
import { Badge, Btn, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
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

  return (
    <div>
      <PageHeader title="Batch &amp; Expiry" subtitle="Near-expiry and expired batches from ERPNext" />
      <div className="card panel">
        <div className="toolbar__group">
          <label className="page-header__sub">Alert within (days)</label>
          <input className="input toolbar__input-xs" type="number" min="1" value={daysAhead} onChange={(e) => setDaysAhead(e.target.value)} />
          <Btn variant="ghost" size="sm" onClick={load}>Load batches</Btn>
        </div>
      </div>
      {loading ? <PageLoading size={26} /> : error ? <ApiErrorCard message={error} onRetry={load} /> : (
        <Table columns={columns} data={rows} emptyMsg="No near-expiry batches — click Load batches" />
      )}
    </div>
  );
}

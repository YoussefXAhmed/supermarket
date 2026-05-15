import { useEffect, useState } from 'react';
import { PageHeader, PageLoading, Btn, Badge, PartialDataBanner } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import PaginatedTable from '../../components/ui/PaginatedTable';
import ExportToolbar from '../../components/ui/ExportToolbar';
import { getActivityLogs, fetchERPActivityLogs, ActivityType } from '../../services/activityLogService';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const TYPE_LABELS = {
  [ActivityType.SALE]: 'Sale',
  [ActivityType.STOCK]: 'Stock',
  [ActivityType.ADJUSTMENT]: 'Adjustment',
  [ActivityType.USER]: 'User',
  [ActivityType.PURCHASE]: 'Purchase',
  [ActivityType.SYSTEM]: 'System',
};

export default function ActivityLogPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const local = getActivityLogs({ limit: 200, type: filter || undefined });
    const erp = await fetchERPActivityLogs(api, { limit: 80 });
    const w = [];
    if (!erp.length && local.length) w.push('ERP Activity Log unavailable — showing local session log only');
    const merged = [...local, ...erp]
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .slice(0, 250);
    setRows(merged);
    setWarnings(w);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]);

  const columns = [
    {
      key: 'ts',
      label: 'When',
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      key: 'type',
      label: 'Type',
      render: (v) => <Badge color={v === ActivityType.SALE ? 'green' : 'default'}>{TYPE_LABELS[v] || v}</Badge>,
    },
    { key: 'action', label: 'Action' },
    {
      key: 'user',
      label: 'User',
      render: (v) => v || user?.name || '—',
    },
    {
      key: 'detail',
      label: 'Detail',
      render: (_, row) => {
        const d = row.detail || {};
        const parts = [d.name, d.doctype, d.amount && `EGP ${d.amount}`].filter(Boolean);
        return parts.join(' · ') || '—';
      },
    },
  ];

  const exportRows = rows.map((r) => ({
    ...r,
    detail: JSON.stringify(r.detail || {}),
  }));

  return (
    <TablePageLayout>
      <PageHeader
        title="Activity log"
        subtitle="Sales, stock changes, adjustments, and user actions"
        dense
        actions={
          <ExportToolbar
            filename="activity-log"
            title="Activity Log"
            columns={[
              { key: 'ts', label: 'When' },
              { key: 'type', label: 'Type' },
              { key: 'action', label: 'Action' },
              { key: 'user', label: 'User' },
              { key: 'detail', label: 'Detail' },
            ]}
            rows={exportRows}
            disabled={!rows.length}
          />
        }
      />
      <PartialDataBanner warnings={warnings} />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <Btn variant="ghost" size="sm" onClick={load}>Refresh</Btn>
        </div>
      </LayoutSection>
      {loading ? (
        <PageLoading size={24} />
      ) : (
        <LayoutSection title="Events" variant="raised" flushHead>
          <PaginatedTable columns={columns} data={rows} pageSize={30} compact emptyMsg="No activity recorded yet" rowKey={(r) => r.id} />
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

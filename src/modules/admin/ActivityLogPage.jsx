import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageLoading, Btn, Badge, PartialDataBanner } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import PaginatedTable from '../../components/ui/PaginatedTable';
import ExportToolbar from '../../components/ui/ExportToolbar';
import { getActivityLogs, fetchERPActivityLogs, ActivityType } from '../../services/activityLogService';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

export default function ActivityLogPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const TYPE_LABELS = {
    [ActivityType.SALE]: t('admin.activity.typeSale'),
    [ActivityType.STOCK]: t('admin.activity.typeStock'),
    [ActivityType.ADJUSTMENT]: t('admin.activity.typeAdjustment'),
    [ActivityType.USER]: t('admin.activity.typeUser'),
    [ActivityType.PURCHASE]: t('admin.activity.typePurchase'),
    [ActivityType.SYSTEM]: t('admin.activity.typeSystem'),
  };

  const load = async () => {
    setLoading(true);
    const local = getActivityLogs({ limit: 200, type: filter || undefined });
    const erp = await fetchERPActivityLogs(api, { limit: 80 });
    const w = [];
    if (!erp.length && local.length) w.push(t('admin.activity.erpUnavailable'));
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
      label: t('admin.activity.when'),
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      key: 'type',
      label: t('admin.activity.type'),
      render: (v) => <Badge color={v === ActivityType.SALE ? 'green' : 'default'}>{TYPE_LABELS[v] || v}</Badge>,
    },
    { key: 'action', label: t('admin.activity.action') },
    {
      key: 'user',
      label: t('admin.activity.user'),
      render: (v) => v || user?.name || '—',
    },
    {
      key: 'detail',
      label: t('admin.activity.detail'),
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

  const EXPORT_COLUMNS = [
    { key: 'ts', label: t('admin.activity.when') },
    { key: 'type', label: t('admin.activity.type') },
    { key: 'action', label: t('admin.activity.action') },
    { key: 'user', label: t('admin.activity.user') },
    { key: 'detail', label: t('admin.activity.detail') },
  ];

  return (
    <TablePageLayout>
      <PageHeader
        title={t('admin.activity.title')}
        subtitle={t('admin.activity.subtitle')}
        dense
        actions={
          <ExportToolbar
            filename="activity-log"
            title={t('admin.activity.title')}
            columns={EXPORT_COLUMNS}
            rows={exportRows}
            disabled={!rows.length}
          />
        }
      />
      <PartialDataBanner warnings={warnings} />
      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('admin.activity.allTypes')}</option>
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh')}</Btn>
        </div>
      </LayoutSection>
      {loading ? (
        <PageLoading size={24} />
      ) : (
        <LayoutSection title={t('admin.activity.events')} variant="raised" flushHead>
          <PaginatedTable columns={columns} data={rows} pageSize={30} compact emptyMsg={t('admin.activity.noActivity')} rowKey={(r) => r.id} />
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

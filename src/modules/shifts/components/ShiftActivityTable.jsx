import { useTranslation } from 'react-i18next';
import { Table } from '../../../components/ui';
import { TableRegion } from '../../../components/layout/page-layouts';
import ShiftStatusBadge from './ShiftStatusBadge';

export default function ShiftActivityTable({ rows = [] }) {
  const { t } = useTranslation();

  const columns = [
    {
      key: 'type',
      label: t('ui.table.actions') === 'Actions' ? 'Type' : t('admin.activity.type'),
      render: (v) => (v === 'opening' ? t('erp.status.open') : t('shifts.closeShift')),
    },
    {
      key: 'name',
      label: t('ui.table.actions') === 'Actions' ? 'Document' : t('admin.activity.action'),
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    {
      key: 'pos_profile',
      label: t('shifts.filters.register'),
    },
    {
      key: 'user',
      label: t('shifts.filters.cashier'),
      render: (v, row) => v || row.owner || '—',
    },
    {
      key: 'period_start_date',
      label: t('shifts.drawer.periodStart'),
      render: (v, row) => {
        const end = row.period_end_date || row.posting_date || '';
        return end ? `${v || '—'} → ${end}` : v || '—';
      },
    },
    {
      key: 'status',
      label: t('erp.status.submitted') === 'Submitted' ? 'Status' : t('shifts.card.opened'),
      render: (v, row) => (
        <ShiftStatusBadge
          status={v}
          docstatus={row.docstatus}
          approvalStatus={row.audit?.approval_status}
        />
      ),
    },
    {
      key: 'variance',
      label: t('shifts.card.variance'),
      render: (v, row) =>
        row.type === 'closing' && row.variance != null
          ? `EGP ${Number(row.variance).toFixed(2)}`
          : row.type === 'opening'
            ? `EGP ${Number(row.openingCash || 0).toFixed(2)}`
            : '—',
    },
  ];

  return (
    <TableRegion>
      <Table columns={columns} data={rows} compact emptyMsg={t('shifts.noSessions')} />
    </TableRegion>
  );
}

import { Table } from '../../../components/ui';
import { TableRegion } from '../../../components/layout/page-layouts';
import ShiftStatusBadge from './ShiftStatusBadge';

export default function ShiftActivityTable({ rows = [] }) {
  const columns = [
    {
      key: 'type',
      label: 'Type',
      render: (v) => (v === 'opening' ? 'Open' : 'Close'),
    },
    {
      key: 'name',
      label: 'Document',
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    {
      key: 'pos_profile',
      label: 'Register',
    },
    {
      key: 'user',
      label: 'Cashier',
      render: (v, row) => v || row.owner || '—',
    },
    {
      key: 'period_start_date',
      label: 'Period',
      render: (v, row) => {
        const end = row.period_end_date || row.posting_date || '';
        return end ? `${v || '—'} → ${end}` : v || '—';
      },
    },
    {
      key: 'status',
      label: 'Status',
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
      label: 'Variance',
      render: (v, row) =>
        row.type === 'closing' && row.variance != null
          ? `EGP ${Number(row.variance).toFixed(2)}`
          : row.type === 'opening'
            ? `EGP ${Number(row.openingCash || 0).toFixed(2)} open`
            : '—',
    },
  ];

  return (
    <TableRegion>
      <Table columns={columns} data={rows} compact emptyMsg="No shift records" />
    </TableRegion>
  );
}

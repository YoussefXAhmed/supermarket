import { Badge } from '../../../components/ui';

export default function ShiftStatusBadge({ status, docstatus, approvalStatus }) {
  if (approvalStatus === 'pending') {
    return <Badge color="amber">Pending approval</Badge>;
  }
  if (docstatus === 1 && status === 'Closed') {
    return <Badge color="green">Closed</Badge>;
  }
  if (docstatus === 1 && (status === 'Open' || !status)) {
    return <Badge color="green">Open</Badge>;
  }
  if (docstatus === 0) {
    return <Badge color="amber">Draft</Badge>;
  }
  if (docstatus === 2) {
    return <Badge color="red">Cancelled</Badge>;
  }
  return <Badge color="default">{status || '—'}</Badge>;
}

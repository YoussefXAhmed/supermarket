import { Badge } from '../../../components/ui';
import { isAwaitingSubmission } from '../../../utils/shiftSessions';

/**
 * Shift session approval / lifecycle badge.
 * Submitted = green, Pending approval = yellow, Rejected = red.
 */
export default function ShiftStatusBadge({ session, approvalStatus, docstatus, status }) {
  const ap =
    approvalStatus ||
    session?.approvalStatus ||
    (session?.needsReview ? 'pending' : null);
  const closeDoc = docstatus ?? session?.closing?.docstatus;
  const sessionStatus = status || session?.sessionStatus;
  const awaiting = session ? isAwaitingSubmission(session) : closeDoc === 0;

  if (ap === 'rejected') {
    return <Badge color="red">Rejected</Badge>;
  }
  if (sessionStatus === 'open' || ap === 'open') {
    return <Badge color="blue">Open</Badge>;
  }
  if (awaiting || ap === 'pending' || sessionStatus === 'pending_approval') {
    return <Badge color="amber">Pending approval</Badge>;
  }
  if (closeDoc === 1 || ap === 'submitted' || ap === 'approved' || ap === 'auto') {
    return <Badge color="green">Submitted</Badge>;
  }
  if (closeDoc === 2) {
    return <Badge color="red">Cancelled</Badge>;
  }
  return <Badge color="default">{ap || status || '—'}</Badge>;
}

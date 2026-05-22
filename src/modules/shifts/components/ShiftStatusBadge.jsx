import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui';
import { isAwaitingSubmission } from '../../../utils/shiftSessions';

/**
 * Shift session approval / lifecycle badge.
 * Submitted = green, Pending approval = yellow, Rejected = red.
 */
export default function ShiftStatusBadge({ session, approvalStatus, docstatus, status }) {
  const { t } = useTranslation();
  const ap =
    approvalStatus ||
    session?.approvalStatus ||
    (session?.needsReview ? 'pending' : null);
  const closeDoc = docstatus ?? session?.closing?.docstatus;
  const sessionStatus = status || session?.sessionStatus;
  const awaiting = session ? isAwaitingSubmission(session) : closeDoc === 0;

  if (ap === 'rejected') {
    return <Badge color="red">{t('shifts.status.rejected')}</Badge>;
  }
  if (sessionStatus === 'open' || ap === 'open') {
    return <Badge color="blue">{t('shifts.status.open')}</Badge>;
  }
  if (awaiting || ap === 'pending' || sessionStatus === 'pending_approval') {
    return <Badge color="amber">{t('shifts.status.pendingApproval')}</Badge>;
  }
  if (closeDoc === 1 || ap === 'submitted' || ap === 'approved' || ap === 'auto') {
    return <Badge color="green">{t('shifts.status.submitted')}</Badge>;
  }
  if (closeDoc === 2) {
    return <Badge color="red">{t('shifts.status.cancelled')}</Badge>;
  }
  return <Badge color="default">{ap || status || '—'}</Badge>;
}

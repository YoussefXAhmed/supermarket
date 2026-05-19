import { approvalStatusLabel } from '../../utils/approvalStatuses';

const TONE = {
  draft: 'status-pill--draft',
  pending_approval: 'status-pill--pending',
  pending_manager: 'status-pill--pending',
  pending_accountant: 'status-pill--pending',
  approved: 'status-pill--approved',
  rejected: 'status-pill--rejected',
  submitted: 'status-pill--submitted',
};

export default function StatusPill({ status, label }) {
  const text = label || approvalStatusLabel(status);
  const tone = TONE[status] || 'status-pill--draft';
  return (
    <span className={`status-pill ${tone}`} title={text}>
      {text}
    </span>
  );
}

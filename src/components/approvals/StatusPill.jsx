/**
 * Approval status pill — thin domain wrapper over the shared <Pill>
 * primitive in components/ui. Maps approval lifecycle states to tones;
 * visual chrome lives in components.css `.pill / .pill--*`.
 */
import { Pill } from '../ui';
import { approvalStatusLabel } from '../../utils/approvalStatuses';

const TONE = {
  draft: 'draft',
  pending_approval: 'pending',
  pending_manager: 'pending',
  pending_accountant: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  submitted: 'submitted',
};

export default function StatusPill({ status, label }) {
  const text = label || approvalStatusLabel(status);
  return <Pill tone={TONE[status] || 'default'} title={text}>{text}</Pill>;
}

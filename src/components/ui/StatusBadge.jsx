/**
 * StatusBadge — dynamic status pill with an icon + colored chip.
 *
 *   <StatusBadge tone="green"  icon={<ApprovedIcon />} label="Approved" />
 *   <StatusBadge tone="amber"  icon={<PendingIcon />}  label="Pending" />
 *
 * For stock state, use the helper `stockStateIcon({qty, lowThreshold})` from
 * components/icons — it returns { Icon, tone, label } that maps directly to
 * this component's props.
 */
import { Pill } from './index';

export default function StatusBadge({ tone = 'default', icon, label, title, compact = false }) {
  return (
    <Pill tone={tone} title={title || label}>
      <span className={`status-icon status-icon--${tone}`}>
        {icon}
        {!compact && <span>{label}</span>}
      </span>
    </Pill>
  );
}

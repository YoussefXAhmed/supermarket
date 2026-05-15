import { Badge } from '../../../components/ui';
import { VARIANCE_APPROVAL_THRESHOLD, VARIANCE_WARNING_THRESHOLD } from '../../../utils/shiftCalculations';

export default function VarianceBanner({ variance, severity, expected, actual }) {
  if (variance == null) return null;

  const color = severity === 'approval_required' ? 'red' : severity === 'warning' ? 'amber' : 'green';
  const label =
    severity === 'approval_required'
      ? 'Manager approval required'
      : severity === 'warning'
        ? 'Variance warning'
        : 'Balanced';

  return (
    <div className={`shift-variance shift-variance--${severity}`}>
      <div className="shift-variance__head">
        <Badge color={color}>{label}</Badge>
        <strong className="mono">EGP {Number(variance).toFixed(2)}</strong>
      </div>
      <p className="page-header__sub">
        Expected cash EGP {Number(expected).toFixed(2)} · Counted EGP {Number(actual).toFixed(2)}
      </p>
      <p className="page-header__sub">
        Warning from EGP {VARIANCE_WARNING_THRESHOLD} · Approval from EGP {VARIANCE_APPROVAL_THRESHOLD}
      </p>
    </div>
  );
}

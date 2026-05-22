import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui';
import { VARIANCE_APPROVAL_THRESHOLD, VARIANCE_WARNING_THRESHOLD } from '../../../utils/shiftCalculations';

export default function VarianceBanner({ variance, severity, expected, actual }) {
  const { t } = useTranslation();
  if (variance == null) return null;

  const color = severity === 'approval_required' ? 'red' : severity === 'warning' ? 'amber' : 'green';
  const label =
    severity === 'approval_required'
      ? t('shifts.variance.managerRequired')
      : severity === 'warning'
        ? t('shifts.variance.warning')
        : t('shifts.variance.balanced');

  return (
    <div className={`shift-variance shift-variance--${severity}`}>
      <div className="shift-variance__head">
        <Badge color={color}>{label}</Badge>
        <strong className="mono">EGP {Number(variance).toFixed(2)}</strong>
      </div>
      <p className="page-header__sub">
        {t('shifts.variance.expectedCash')} EGP {Number(expected).toFixed(2)} · {t('shifts.variance.counted')} EGP {Number(actual).toFixed(2)}
      </p>
      <p className="page-header__sub">
        {t('shifts.variance.warningFrom')} {VARIANCE_WARNING_THRESHOLD} · {t('shifts.variance.approvalFrom')} {VARIANCE_APPROVAL_THRESHOLD}
      </p>
    </div>
  );
}

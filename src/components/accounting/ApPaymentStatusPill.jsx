import { useTranslation } from 'react-i18next';
import { erpStatusLabel } from '../../utils/erpLabelMapper';
import { payStatusTone, normalizePayStatus } from '../../utils/apPaymentStatus';

export default function ApPaymentStatusPill({ status, paidPct }) {
  const { t } = useTranslation();
  const key = normalizePayStatus(status);
  const text = erpStatusLabel(key, t);
  const tone = payStatusTone(key);
  const pct =
    paidPct != null && Number.isFinite(Number(paidPct)) ? `${Math.round(Number(paidPct))}%` : null;

  return (
    <span className={`ap-pill ${tone}`} title={pct ? `${text} (${pct} paid)` : text}>
      {text}
      {pct && key !== 'paid' && key !== 'draft' ? (
        <span className="ap-pill__pct">{pct}</span>
      ) : null}
    </span>
  );
}

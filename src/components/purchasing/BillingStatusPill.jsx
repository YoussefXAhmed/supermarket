import { billingStatusLabel, billingStatusTone, normalizeBillingStatus } from '../../utils/billingStatus';

export default function BillingStatusPill({ status, label, billedPct }) {
  const key = normalizeBillingStatus(status);
  const text = label || billingStatusLabel(key);
  const tone = billingStatusTone(key);
  const pct =
    billedPct != null && Number.isFinite(Number(billedPct))
      ? `${Math.round(Number(billedPct))}%`
      : null;

  return (
    <span className={`billing-pill ${tone}`} title={pct ? `${text} (${pct} billed)` : text}>
      {text}
      {pct && key !== 'unbilled' && key !== 'fully_billed' ? (
        <span className="billing-pill__pct">{pct}</span>
      ) : null}
    </span>
  );
}

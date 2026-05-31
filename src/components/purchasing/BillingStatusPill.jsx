/**
 * Billing status pill — thin domain wrapper over the shared <Pill> primitive
 * in components/ui. Maps billing lifecycle states to tones via
 * `billingStatusTone` (now returns generic tone keys).
 */
import { Pill } from '../ui';
import { billingStatusLabel, billingStatusTone, normalizeBillingStatus } from '../../utils/billingStatus';

export default function BillingStatusPill({ status, label, billedPct }) {
  const key = normalizeBillingStatus(status);
  const text = label || billingStatusLabel(key);
  const tone = billingStatusTone(key);
  const pct =
    billedPct != null && Number.isFinite(Number(billedPct))
      ? `${Math.round(Number(billedPct))}%`
      : null;
  const hint = pct && key !== 'unbilled' && key !== 'fully_billed' ? pct : null;
  return (
    <Pill tone={tone} title={hint ? `${text} (${pct} billed)` : text}>
      {text}
      {hint && <span className="pill__hint">{hint}</span>}
    </Pill>
  );
}

/**
 * AP payment status pill — thin domain wrapper over the shared <Pill>
 * primitive in components/ui. Maps payment lifecycle states to tones via
 * `payStatusTone` (now returns generic tone keys). The `%` paid hint is
 * appended as a child node so it inherits the pill chrome.
 */
import { Pill } from '../ui';
import { payStatusLabel, payStatusTone, normalizePayStatus } from '../../utils/apPaymentStatus';

export default function ApPaymentStatusPill({ status, paidPct }) {
  const key = normalizePayStatus(status);
  const text = payStatusLabel(key);
  const tone = payStatusTone(key);
  const pct =
    paidPct != null && Number.isFinite(Number(paidPct)) ? `${Math.round(Number(paidPct))}%` : null;
  const hint = pct && key !== 'paid' && key !== 'draft' ? pct : null;
  return (
    <Pill tone={tone} title={hint ? `${text} (${pct} paid)` : text}>
      {text}
      {hint && <span className="pill__hint">{hint}</span>}
    </Pill>
  );
}

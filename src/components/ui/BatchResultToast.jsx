/**
 * <BatchResultToast> — compact-but-expandable result summary rendered
 * inside a notification toast after a batch operation completes.
 *
 *   notify.success(
 *     <BatchResultToast
 *       total={result.total}
 *       succeeded={result.succeeded}
 *       failed={result.failed}
 *       errors={result.results.filter(r => !r.ok).map(r => ({ id: r.name, message: r.error }))}
 *       headline={t('batch.approve.headline')}
 *     />,
 *     { duration: 8000 }
 *   );
 *
 * The headline + counters are always visible. The error list is
 * collapsed by default and revealed via a "View details" toggle so a
 * 200-row failure doesn't blow up the toast region. The toggle is
 * keyboard-operable (Enter / Space) and uses `aria-expanded` for SR
 * users.
 *
 * Note: this component is layout-only. It does NOT call
 * NotificationContext itself — the call-site decides toast type and
 * duration. Phase 4.b–4.e pages will pass `success` or `warning` based
 * on whether the batch had any failures.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * @param {{
 *   total: number,
 *   succeeded: number,
 *   failed: number,
 *   errors?: Array<{ id: string, message: string }>,
 *   headline?: string,
 *   initiallyOpen?: boolean,
 * }} props
 */
export default function BatchResultToast({
  total = 0,
  succeeded = 0,
  failed = 0,
  errors = [],
  headline,
  initiallyOpen = false,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);

  const summary = headline || t('batch.result.summary', {
    defaultValue: '{{succeeded}} of {{total}} succeeded',
    succeeded,
    total,
  });

  const failedLabel = t('batch.result.failed', {
    defaultValue: '{{failed}} failed',
    failed,
  });

  const detailToggleLabel = open
    ? t('batch.result.hideDetails', { defaultValue: 'Hide details' })
    : t('batch.result.viewDetails', { defaultValue: 'View details' });

  const onToggle = () => setOpen((p) => !p);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div className="batch-result-toast">
      <div className="batch-result-toast__row">
        <span className="batch-result-toast__summary">{summary}</span>
        {failed > 0 && (
          <span className="batch-result-toast__failed" aria-label={failedLabel}>
            · {failedLabel}
          </span>
        )}
        {errors.length > 0 && (
          <button
            type="button"
            className="batch-result-toast__toggle"
            onClick={onToggle}
            onKeyDown={onKey}
            aria-expanded={open}
          >
            {detailToggleLabel}
          </button>
        )}
      </div>
      {open && errors.length > 0 && (
        <ul className="batch-result-toast__errors" role="list">
          {errors.map((err) => (
            <li key={err.id} className="batch-result-toast__error">
              <span className="batch-result-toast__error-id">{err.id}</span>
              <span className="batch-result-toast__error-msg">{err.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

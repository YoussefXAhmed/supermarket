import { useTranslation } from 'react-i18next';
import { fmtCurrency, fmtDateTime } from '../../../utils/format';
import { canManagerActOnSession } from '../../../utils/shiftSessions';
import ShiftStatusBadge from './ShiftStatusBadge';

function Metric({ label, value, mono }) {
  return (
    <div className="shift-session-card__metric">
      <span className="shift-session-card__metric-label">{label}</span>
      <span className={`shift-session-card__metric-value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ShiftSessionCard({
  session,
  user,
  canApprove,
  onSelect,
  onApprove,
  onReject,
}) {
  const { t } = useTranslation();
  const varianceClass =
    session.varianceSeverity === 'approval_required'
      ? 'shift-session-card__variance--high'
      : session.varianceSeverity === 'warning'
        ? 'shift-session-card__variance--warn'
        : '';

  const showManagerActions = canManagerActOnSession(session, user, canApprove);

  return (
    <article
      className={`shift-session-card card ${session.awaitingSubmission ? 'shift-session-card--review' : ''}`}
    >
      <header className="shift-session-card__head">
        <div>
          <p className="shift-session-card__register">{session.register}</p>
          <p className="shift-session-card__cashier">{session.cashier}</p>
          {session.sessionInvalid && (
            <p className="shift-session-card__invalid">{session.sessionInvalidMessage}</p>
          )}
        </div>
        <ShiftStatusBadge session={session} />
      </header>

      <div className="shift-session-card__grid">
        <Metric label={t('shifts.card.opened')} value={fmtDateTime(session.openedAt)} />
        <Metric label={t('shifts.card.closed')} value={session.closedAt ? fmtDateTime(session.closedAt) : '—'} />
        <Metric label={t('shifts.card.invoices')} value={session.invoicesCount ?? 0} mono />
        <Metric label={t('shifts.card.sales')} value={fmtCurrency(session.salesTotal)} mono />
        <Metric label={t('shifts.card.expectedCash')} value={fmtCurrency(session.expectedCash)} mono />
        <Metric label={t('shifts.card.countedCash')} value={session.countedCash != null ? fmtCurrency(session.countedCash) : '—'} mono />
        <Metric
          label={t('shifts.card.variance')}
          value={session.closing ? fmtCurrency(session.variance) : '—'}
          mono
        />
      </div>

      {session.closing && (
        <p className={`shift-session-card__variance ${varianceClass}`}>
          {session.openingName && (
            <span className="mono shift-session-card__doc">{session.openingName}</span>
          )}
          {session.closingName && (
            <span className="mono shift-session-card__doc"> → {session.closingName}</span>
          )}
        </p>
      )}

      <footer className="shift-session-card__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onSelect(session)}>
          {t('shifts.card.viewDetails')}
        </button>
        {showManagerActions && onApprove && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onApprove(session)}
          >
            {t('shifts.card.approveAndSubmit')}
          </button>
        )}
        {showManagerActions && onReject && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => onReject(session)}
          >
            {t('shifts.card.reject')}
          </button>
        )}
      </footer>
    </article>
  );
}

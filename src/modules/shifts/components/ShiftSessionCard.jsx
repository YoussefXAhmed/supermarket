import { fmtCurrency, fmtDateTime } from '../../../utils/format';
import { canActOnShiftSession } from '../../../utils/shiftSessions';
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
  const varianceClass =
    session.varianceSeverity === 'approval_required'
      ? 'shift-session-card__variance--high'
      : session.varianceSeverity === 'warning'
        ? 'shift-session-card__variance--warn'
        : '';

  const showManagerActions = canActOnShiftSession(session, user, canApprove);

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
        <Metric label="Opened" value={fmtDateTime(session.openedAt)} />
        <Metric label="Closed" value={session.closedAt ? fmtDateTime(session.closedAt) : '—'} />
        <Metric label="Invoices" value={session.invoicesCount ?? 0} mono />
        <Metric label="Sales" value={fmtCurrency(session.salesTotal)} mono />
        <Metric label="Expected cash" value={fmtCurrency(session.expectedCash)} mono />
        <Metric label="Counted cash" value={session.countedCash != null ? fmtCurrency(session.countedCash) : '—'} mono />
        <Metric
          label="Variance"
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
          View details
        </button>
        {showManagerActions && onApprove && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onApprove(session)}
          >
            Approve &amp; submit
          </button>
        )}
        {showManagerActions && onReject && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => onReject(session)}
          >
            Reject
          </button>
        )}
      </footer>
    </article>
  );
}

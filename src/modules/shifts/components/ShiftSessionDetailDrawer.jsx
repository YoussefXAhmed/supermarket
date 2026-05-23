import { Btn } from '../../../components/ui';
import { fmtCurrency, fmtDateTime } from '../../../utils/format';
import { canActOnShiftSession } from '../../../utils/shiftSessions';
import ShiftStatusBadge from './ShiftStatusBadge';

function DetailRow({ label, value, mono }) {
  return (
    <div className="shift-detail-row">
      <span className="shift-detail-row__label">{label}</span>
      <span className={`shift-detail-row__value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ShiftSessionDetailDrawer({
  session,
  user,
  onClose,
  onApprove,
  onReject,
  canApprove,
}) {
  if (!session) return null;

  const audit = session.audit;
  const showManagerActions = canActOnShiftSession(session, user, canApprove);
  const timeline = session.timeline || [];

  return (
    <div className="shift-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="shift-drawer card"
        role="dialog"
        aria-labelledby="shift-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shift-drawer__head">
          <div>
            <h2 id="shift-drawer-title" className="shift-drawer__title">
              Shift session
            </h2>
            <p className="shift-drawer__sub">
              {session.register} · {session.cashier}
            </p>
          </div>
          <button type="button" className="shift-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="shift-drawer__status">
          <ShiftStatusBadge session={session} />
        </div>

        {timeline.length > 0 && (
          <section className="shift-drawer__section shift-drawer__timeline">
            <h3>Approval timeline</h3>
            <ol className="shift-timeline">
              {timeline.map((ev) => (
                <li key={ev.key} className={`shift-timeline__item shift-timeline__item--${ev.key}`}>
                  <p className="shift-timeline__label">{ev.label}</p>
                  <p className="shift-timeline__actor">{ev.actor}</p>
                  <p className="shift-timeline__time">{ev.at ? fmtDateTime(ev.at) : '—'}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="shift-drawer__section">
          <h3>Timing</h3>
          <DetailRow label="Opened at" value={fmtDateTime(session.openedAt)} />
          <DetailRow label="Closed at" value={session.closedAt ? fmtDateTime(session.closedAt) : 'Still open'} />
          <DetailRow label="Period start" value={session.periodStart || '—'} />
          <DetailRow label="Period end" value={session.periodEnd || '—'} />
        </section>

        <section className="shift-drawer__section">
          <h3>Sales</h3>
          <DetailRow label="Invoice count" value={session.invoicesCount ?? 0} mono />
          <DetailRow label="Sales total" value={fmtCurrency(session.salesTotal)} mono />
          {audit?.returns_count != null && (
            <DetailRow label="Returns" value={audit.returns_count} mono />
          )}
          {audit?.void_count != null && (
            <DetailRow label="Voids" value={audit.void_count} mono />
          )}
        </section>

        <section className="shift-drawer__section">
          <h3>Cash reconciliation</h3>
          <DetailRow label="Expected cash" value={fmtCurrency(session.expectedCash)} mono />
          <DetailRow
            label="Counted cash"
            value={session.countedCash != null ? fmtCurrency(session.countedCash) : '—'}
            mono
          />
          <DetailRow
            label="Variance"
            value={session.closing ? fmtCurrency(session.variance) : '—'}
            mono
          />
          <DetailRow label="Severity" value={session.varianceSeverity || '—'} />
        </section>

        <section className="shift-drawer__section">
          <h3>ERP documents</h3>
          <DetailRow label="Opening entry" value={session.openingName || '—'} mono />
          <DetailRow label="Closing entry" value={session.closingName || '—'} mono />
          {audit?.notes && (
            <div className="shift-detail-row shift-detail-row--block">
              <span className="shift-detail-row__label">Notes</span>
              <p className="shift-detail-row__notes">{audit.notes}</p>
            </div>
          )}
        </section>

        <footer className="shift-drawer__footer">
          {showManagerActions && onApprove && (
            <Btn variant="primary" onClick={() => onApprove(session)}>
              Approve &amp; submit
            </Btn>
          )}
          {showManagerActions && onReject && (
            <Btn variant="danger" onClick={() => onReject(session)}>
              Reject
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>
            Close
          </Btn>
        </footer>
      </aside>
    </div>
  );
}

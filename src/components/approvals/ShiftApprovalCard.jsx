import { Link } from 'react-router-dom';
import { Btn } from '../ui';
import { fmtCurrency } from '../../utils/format';
import StatusPill from './StatusPill';
import ApprovalAuditPanel from './ApprovalAuditPanel';
import { ApprovalStatus, shiftSessionApprovalStatus } from '../../utils/approvalStatuses';
import { canManagerActOnSession } from '../../utils/shiftSessions';

export default function ShiftApprovalCard({
  session,
  user,
  canApprove,
  busy = false,
  onApprove,
  onReject,
  compact = false,
}) {
  const status = shiftSessionApprovalStatus(session);
  const canAct = canManagerActOnSession(session, user, canApprove);
  const notes = session.audit?.close_notes || session.closing?.remarks || '';

  return (
    <article className={`approval-card approval-card--shift ${compact ? 'approval-card--compact' : ''}`}>
      <header className="approval-card__head">
        <div className="approval-card__meta">
          <strong>{session.cashier || session.opening?.user || '—'}</strong>
          <StatusPill status={status} />
          <span className="approval-card__level">{session.posProfile || session.opening?.pos_profile}</span>
        </div>
        <span className="approval-card__owner">{session.register || session.opening?.name}</span>
      </header>

      <div className="approval-card__metrics">
        <span>Expected {fmtCurrency(session.expectedCash)}</span>
        <span>Counted {fmtCurrency(session.countedCash)}</span>
        <span className={session.variance !== 0 ? 'approval-card__var' : ''}>
          Variance {fmtCurrency(session.variance)}
        </span>
        <span>Sales {fmtCurrency(session.salesTotal)}</span>
      </div>

      {notes && <p className="approval-card__notes">Cashier notes: {notes}</p>}

      <ApprovalAuditPanel
        events={session.timeline}
        variancePct={session.expectedCash ? Math.round((Math.abs(session.variance) / session.expectedCash) * 10000) / 100 : null}
        approvedBy={session.audit?.approved_by}
        approvedAt={session.audit?.approved_at}
        rejectedBy={session.audit?.rejected_by}
        rejectedAt={session.audit?.rejected_at}
        pendingApprover={status === ApprovalStatus.PENDING ? 'Manager / Accountant' : undefined}
      />

      <footer className="approval-card__foot">
        {!compact && (
          <Link to="/admin/shifts/history" className="btn btn--ghost btn--sm">
            Full history
          </Link>
        )}
        {canAct && (
          <div className="approval-card__actions">
            <Btn variant="primary" size="sm" loading={busy} disabled={busy} onClick={() => onApprove?.(session)}>
              Approve &amp; submit
            </Btn>
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => onReject?.(session)}>
              Reject
            </Btn>
          </div>
        )}
      </footer>
    </article>
  );
}

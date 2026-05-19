/**
 * Approval audit metadata (who/when/variance/pending approver).
 */
export default function ApprovalAuditPanel({
  events = [],
  approvedBy,
  approvedAt,
  rejectedBy,
  rejectedAt,
  reason,
  variancePct,
  pendingApprover,
}) {
  const rows = [
    pendingApprover && { label: 'Pending approver', value: pendingApprover },
    variancePct != null && { label: 'Variance', value: `${variancePct}%` },
    approvedBy && { label: 'Approved by', value: approvedBy },
    approvedAt && { label: 'Approved at', value: formatTs(approvedAt) },
    rejectedBy && { label: 'Rejected by', value: rejectedBy },
    rejectedAt && { label: 'Rejected at', value: formatTs(rejectedAt) },
    reason && { label: 'Reason / notes', value: reason },
  ].filter(Boolean);

  if (!rows.length && !events.length) return null;

  return (
    <div className="approval-audit">
      <p className="approval-audit__title">Approval audit</p>
      <div className="approval-audit__grid">
        {rows.map((row) => (
          <div key={row.label} className="approval-audit__row">
            <span className="approval-audit__label">{row.label}</span>
            <span className="approval-audit__value">{row.value}</span>
          </div>
        ))}
      </div>
      {events.length > 0 && (
        <ul className="approval-audit__timeline">
          {events.map((ev, i) => (
            <li key={ev.key || i}>
              <strong>{ev.label || ev.action}</strong>
              {ev.actor && <span> — {ev.actor}</span>}
              {ev.at && <time>{formatTs(ev.at)}</time>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTs(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

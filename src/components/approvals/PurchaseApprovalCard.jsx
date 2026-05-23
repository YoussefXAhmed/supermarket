import { useTranslation } from 'react-i18next';
import { Btn } from '../ui';
import { fmtCurrency } from '../../utils/format';
import { approvalLevelLabel } from '../../utils/purchasingApproval';
import {
  purchaseReceiptApprovalStatus,
  purchaseReceiptStatusLabel,
  purchaseApprovalActionState,
  isPendingPurchaseStatus,
} from '../../utils/approvalStatuses';
import StatusPill from './StatusPill';
import ApprovalAuditPanel from './ApprovalAuditPanel';
import WarehouseScopeBar from './WarehouseScopeBar';

export function canActOnPurchaseReceipt(caps) {
  return Boolean(caps?.canExecutePurchaseApproval || caps?.canManageSystem);
}

export default function PurchaseApprovalCard({
  doc,
  capabilities,
  user,
  notes = '',
  busy = false,
  readOnly = false,
  onApprove,
  onReject,
}) {
  const statusDoc = {
    docstatus: doc.docstatus,
    pending_purchase_approval: doc.pending_purchase_approval ?? 1,
    approval_status: doc.approval_status,
    approval_level: doc.approval_level,
    purchase_approval_level: doc.purchase_approval_level,
  };
  const status = purchaseReceiptApprovalStatus(statusDoc);
  const statusLabel = purchaseReceiptStatusLabel(statusDoc);
  const { canAct, reason: blockedReason } = purchaseApprovalActionState(doc, capabilities, user);
  const { t } = useTranslation();
  const showActions = !readOnly && isPendingPurchaseStatus(status);
  const maxVar = doc.max_variance_pct ?? Math.max(...(doc.lines || []).map((l) => l.variance_pct || 0), 0);

  return (
    <article className="approval-card approval-card--purchase">
      <header className="approval-card__head">
        <div className="approval-card__meta">
          <strong>{doc.name}</strong>
          <StatusPill status={status} label={statusLabel} />
          <span className="approval-card__level">{approvalLevelLabel(doc.approval_level)}</span>
        </div>
        <span className="approval-card__owner">{t('approvals.requestedBy')} {doc.requested_by || '—'}</span>
      </header>

      <WarehouseScopeBar warehouse={doc.warehouse} />

      <div className="approval-card__table-wrap">
        <table className="approval-table">
          <thead>
            <tr>
              <th>{t('approvals.table.item')}</th>
              <th>{t('approvals.table.qty')}</th>
              <th>{t('approvals.table.expected')}</th>
              <th>{t('approvals.table.entered')}</th>
              <th>{t('approvals.table.varPct')}</th>
              <th className="approval-table__num">{t('approvals.table.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {(doc.lines || []).map((line) => (
              <tr key={`${doc.name}-${line.item_code}`}>
                <td>{line.item_code}</td>
                <td>{line.qty}</td>
                <td>{fmtCurrency(line.expected_rate)}</td>
                <td>{fmtCurrency(line.rate)}</td>
                <td>{line.variance_pct ?? '—'}%</td>
                <td className="approval-table__num">{fmtCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ApprovalAuditPanel
        variancePct={maxVar}
        pendingApprover={isPendingPurchaseStatus(status) ? blockedReason || statusLabel : undefined}
        approvedBy={doc.approved_by}
        approvedAt={doc.approved_at}
        rejectedBy={doc.rejected_by}
        rejectedAt={doc.rejected_at}
        reason={doc.reject_notes || notes}
      />

      <footer className="approval-card__foot">
        <span className="approval-card__total">{t('approvals.total')} {fmtCurrency(doc.grand_total)}</span>
        {showActions && canAct && (
          <div className="approval-card__actions">
            <Btn
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => onApprove?.(doc.name)}
            >
              {t('approvals.approveAndSubmit')}
            </Btn>
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => onReject?.(doc.name)}>
              {t('approvals.reject')}
            </Btn>
          </div>
        )}
        {showActions && !canAct && blockedReason && (
          <p className="approval-card__readonly-hint" role="status">
            {blockedReason}
          </p>
        )}
        {readOnly && isPendingPurchaseStatus(status) && (
          <span className="approval-card__readonly-hint">{t('approvals.viewOnly')}</span>
        )}
      </footer>
    </article>
  );
}

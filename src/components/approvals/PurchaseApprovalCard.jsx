import { useTranslation } from 'react-i18next';
import { Btn, RowCheckbox } from '../ui';
import { fmtCurrency, fmtDateTime } from '../../utils/format';
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
  return Boolean(caps?.canExecutePurchaseApproval);
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
  // Phase 4.b — optional selection slot. Renders a RowCheckbox in the
  // card header when `selectable` is true. When unset, the card looks
  // identical to its pre-4.b form so single-row consumers (history
  // detail modal, drill-down views) keep working unchanged.
  selectable = false,
  selected = false,
  onToggleSelect,
  selectionDisabled = false,
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

  const lineSubtotal = (doc.lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const netTotal = Number.isFinite(doc.net_total) ? Number(doc.net_total) : lineSubtotal;
  const taxes = Array.isArray(doc.taxes) ? doc.taxes : [];
  const totalTaxes = Number.isFinite(doc.total_taxes_and_charges)
    ? Number(doc.total_taxes_and_charges)
    : taxes.reduce((s, tx) => s + (Number(tx.tax_amount) || 0), 0);
  const discount = Number(doc.discount_amount) || 0;
  const grandTotal = Number(doc.grand_total) || (netTotal + totalTaxes - discount);
  const hasBreakdown = taxes.length > 0 || totalTaxes !== 0 || discount !== 0;

  return (
    <article className="approval-card approval-card--purchase">
      <header className="approval-card__head">
        <div className="approval-card__meta">
          {selectable && (
            <RowCheckbox
              checked={selected}
              disabled={selectionDisabled || busy}
              onChange={() => onToggleSelect?.(doc.name)}
              ariaLabel={t('approvals.selectReceipt', { defaultValue: 'Select {{name}}', name: doc.name })}
              className="approval-card__select"
            />
          )}
          <strong>{doc.name}</strong>
          <StatusPill status={status} label={statusLabel} />
          <span className="approval-card__level">{approvalLevelLabel(doc.approval_level)}</span>
        </div>
        <div className="approval-card__head-right">
          <span className="approval-card__owner">
            {t('approvals.requestedBy')} {doc.requested_by || '—'}
          </span>
          {(doc.requested_at || doc.creation) && (
            <time
              className="approval-card__time"
              dateTime={doc.requested_at || doc.creation}
              title={doc.requested_at || doc.creation}
            >
              {fmtDateTime(doc.requested_at || doc.creation)}
            </time>
          )}
        </div>
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

      {hasBreakdown && (
        <dl className="approval-card__totals">
          <div className="approval-card__totals-row">
            <dt>{t('approvals.subtotal', { defaultValue: 'Subtotal' })}</dt>
            <dd>{fmtCurrency(netTotal)}</dd>
          </div>
          {taxes.map((tx, i) => (
            <div className="approval-card__totals-row" key={`${tx.account_head || tx.description || 'tax'}-${i}`}>
              <dt>
                {tx.description || tx.account_head || t('approvals.tax', { defaultValue: 'Tax' })}
                {tx.rate ? <span className="approval-card__totals-rate"> ({tx.rate}%)</span> : null}
              </dt>
              <dd>{tx.add_deduct === 'Deduct' ? '−' : ''}{fmtCurrency(Math.abs(Number(tx.tax_amount) || 0))}</dd>
            </div>
          ))}
          {discount > 0 && (
            <div className="approval-card__totals-row">
              <dt>{t('approvals.discount', { defaultValue: 'Discount' })}</dt>
              <dd>−{fmtCurrency(discount)}</dd>
            </div>
          )}
        </dl>
      )}

      <footer className="approval-card__foot">
        <span className="approval-card__total">{t('approvals.total')} {fmtCurrency(grandTotal)}</span>
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

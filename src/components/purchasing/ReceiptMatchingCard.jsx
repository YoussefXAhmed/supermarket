import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '../ui';
import BillingStatusPill from './BillingStatusPill';
import ApPaymentStatusPill from '../accounting/ApPaymentStatusPill';
import InvoiceMatchSelector from './InvoiceMatchSelector';
import { fmtCurrency } from '../../utils/format';
import { canLinkReceipt, normalizeBillingStatus, BILLING_STATUS } from '../../utils/billingStatus';
import { AP_STAGE_LABELS } from '../../utils/apPaymentStatus';

export default function ReceiptMatchingCard({
  row,
  linking,
  onLink,
  onRefreshLine,
}) {
  const [expanded, setExpanded] = useState(false);
  const status = normalizeBillingStatus(row.billing_status);
  const linkable = canLinkReceipt(row);

  const handleLink = async (invoiceName) => {
    await onLink(row.receipt, invoiceName);
  };

  return (
    <article className="receipt-matching-card">
      <header className="receipt-matching-card__head">
        <div className="receipt-matching-card__id">
          <span className="mono receipt-matching-card__receipt">{row.receipt}</span>
          <span className="receipt-matching-card__supplier">{row.supplier}</span>
          <span className="receipt-matching-card__date">{row.posting_date}</span>
        </div>
        <BillingStatusPill status={row.billing_status} billedPct={row.billed_pct} />
      </header>

      {row.ap_stage && (
        <p className="receipt-matching-card__lifecycle" role="status">
          <span className="ap-lifecycle-pill">{AP_STAGE_LABELS[row.ap_stage] || row.ap_stage}</span>
          {row.lifecycle_hint}
          {row.ap_stage === 'payment_pending' && (
            <>
              {' '}
              <Link to="/admin/accounting/payments">Record payment →</Link>
            </>
          )}
        </p>
      )}

      <div className="receipt-matching-card__amounts">
        <div>
          <span className="receipt-matching-card__label">Receipt total</span>
          <strong>{fmtCurrency(row.grand_total)}</strong>
        </div>
        <div>
          <span className="receipt-matching-card__label">Billed</span>
          <strong>{fmtCurrency(row.billed_amount)}</strong>
        </div>
        <div>
          <span className="receipt-matching-card__label">Remaining</span>
          <strong>{fmtCurrency(row.remaining_amount)}</strong>
        </div>
        <div>
          <span className="receipt-matching-card__label">Billed %</span>
          <strong>{row.billed_pct != null ? `${row.billed_pct}%` : '—'}</strong>
        </div>
      </div>

      {row.linked_invoices?.length > 0 && (
        <div className="receipt-matching-card__history">
          <span className="receipt-matching-card__label">Linked invoices</span>
          <ul>
            {row.linked_invoices.map((inv) => (
              <li key={inv.name}>
                <span className="mono">{inv.name}</span>
                <span>
                  {fmtCurrency(inv.grand_total)} · {inv.posting_date}
                  {inv.docstatus === 0 ? ' (draft)' : ''}
                </span>
                {inv.payment_status && (
                  <ApPaymentStatusPill status={inv.payment_status} paidPct={inv.paid_pct} />
                )}
                {inv.outstanding_amount > 0 && (
                  <span className="receipt-matching-card__outstanding">
                    {fmtCurrency(inv.outstanding_amount)} outstanding
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === BILLING_STATUS.VARIANCE_DETECTED && (
        <p className="receipt-matching-card__warn" role="status">
          Rate variance detected between receipt and linked invoice lines. Review in ERP before
          submitting the invoice.
        </p>
      )}

      {linkable && (
        <InvoiceMatchSelector
          receiptName={row.receipt}
          suggested={row.suggested_invoices}
          disabled={!linkable}
          linking={linking === row.receipt}
          onSelect={handleLink}
        />
      )}

      <footer className="receipt-matching-card__foot">
        <Btn variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide lines' : 'Line details'}
        </Btn>
        {onRefreshLine && (
          <Btn variant="ghost" size="sm" onClick={() => onRefreshLine(row.receipt)}>
            Refresh
          </Btn>
        )}
      </footer>

      {expanded && row.lines?.length > 0 && (
        <table className="receipt-matching-card__lines">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Billed</th>
              <th>Remaining</th>
              <th>Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {row.lines.map((line) => (
              <tr key={line.name} className={line.variance ? 'receipt-matching-card__line--variance' : ''}>
                <td className="mono">{line.item_code}</td>
                <td>{line.qty}</td>
                <td>{line.billed_qty}</td>
                <td>{line.remaining_qty}</td>
                <td>{fmtCurrency(line.rate)}</td>
                <td>
                  {line.variance ? (
                    <span className="billing-pill billing-pill--variance">Variance</span>
                  ) : line.remaining_qty > 0 ? (
                    <span className="billing-pill billing-pill--partial">Open</span>
                  ) : (
                    <span className="billing-pill billing-pill--billed">Closed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {expanded && row.audit_events?.length > 0 && (
        <details className="receipt-matching-card__audit">
          <summary>Matching audit ({row.audit_events.length})</summary>
          <ul>
            {[...row.audit_events].reverse().map((ev, i) => (
              <li key={`${ev.at}-${i}`}>
                <span className="mono">{ev.action}</span> — {ev.invoice || '—'} by {ev.user} at{' '}
                {ev.at}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

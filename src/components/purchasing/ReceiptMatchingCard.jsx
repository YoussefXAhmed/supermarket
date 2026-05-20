import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '../ui';
import BillingStatusPill from './BillingStatusPill';
import ApPaymentStatusPill from '../accounting/ApPaymentStatusPill';
import InvoiceMatchSelector from './InvoiceMatchSelector';
import { fmtCurrency } from '../../utils/format';
import { canLinkReceipt, normalizeBillingStatus, BILLING_STATUS } from '../../utils/billingStatus';
import { AP_STAGE_LABELS } from '../../utils/apPaymentStatus';
import {
  createPurchaseInvoiceFromReceipt,
  retryAutoPayableForReceipt,
} from '../../services/invoiceMatchingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { openERPDesk } from '../../utils/erpLinks';

export default function ReceiptMatchingCard({
  row,
  linking,
  creating,
  onLink,
  onRefreshLine,
  onInvoiceCreated,
}) {
  const [expanded, setExpanded] = useState(false);
  const [localErr, setLocalErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const status = normalizeBillingStatus(row.billing_status);
  const exceptional = Boolean(row.show_manual_billing);
  const linkable = exceptional && canLinkReceipt(row);
  const showPaymentActions =
    row.auto_invoiced ||
    row.ap_stage === 'payment_pending' ||
    row.ap_stage === 'partially_paid' ||
    Boolean(row.primary_invoice);

  const handleLink = async (invoiceName) => {
    await onLink(row.receipt, invoiceName);
  };

  const handleCreatePayable = async () => {
    setLocalErr('');
    try {
      const result = await createPurchaseInvoiceFromReceipt(row.receipt, { submit: true });
      onInvoiceCreated?.({ workspace: result.workspace, receipt: row.receipt, result });
      if (!result?.workspace) {
        await onRefreshLine?.(row.receipt);
      }
    } catch (e) {
      setLocalErr(getUserFriendlyMessage(e));
    }
  };

  const handleRetryAutoPayable = async () => {
    setLocalErr('');
    setRetrying(true);
    try {
      const result = await retryAutoPayableForReceipt(row.receipt);
      onInvoiceCreated?.({ workspace: result.workspace, receipt: row.receipt, result });
      if (!result?.workspace) {
        await onRefreshLine?.(row.receipt);
      }
    } catch (e) {
      setLocalErr(getUserFriendlyMessage(e));
    } finally {
      setRetrying(false);
    }
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
          <span className={`ap-lifecycle-pill ap-lifecycle-pill--${row.ap_stage}`}>
            {AP_STAGE_LABELS[row.ap_stage] || row.ap_stage}
          </span>
          {row.lifecycle_hint}
          {(row.ap_stage === 'payment_pending' || row.ap_stage === 'partially_paid') && (
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

      {showPaymentActions && row.primary_invoice && (
        <div className="receipt-matching-card__payable">
          <span className="receipt-matching-card__label">Supplier bill (ERP)</span>
          <div className="receipt-matching-card__payable-row">
            <button
              type="button"
              className="mono receipt-matching-card__invoice-link"
              onClick={() => openERPDesk(`purchase-invoice/${row.primary_invoice}`)}
            >
              {row.primary_invoice}
            </button>
            {row.primary_invoice_payment_status && (
              <ApPaymentStatusPill status={row.primary_invoice_payment_status} />
            )}
            {row.primary_invoice_outstanding > 0.009 && (
              <span className="receipt-matching-card__outstanding">
                {fmtCurrency(row.primary_invoice_outstanding)} outstanding
              </span>
            )}
          </div>
        </div>
      )}

      {row.linked_invoices?.length > 0 && (
        <div className="receipt-matching-card__history">
          <span className="receipt-matching-card__label">Linked invoices</span>
          <ul>
            {row.linked_invoices.map((inv) => (
              <li key={inv.name}>
                <span className="mono">{inv.name}</span>
                <span>
                  {fmtCurrency(inv.grand_total)} · {inv.posting_date}
                  {inv.docstatus === 1 ? ' · Submitted' : ''}
                </span>
                {inv.payment_status && (
                  <ApPaymentStatusPill status={inv.payment_status} paidPct={inv.paid_pct} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === BILLING_STATUS.VARIANCE_DETECTED && (
        <p className="receipt-matching-card__warn" role="status">
          Rate variance — use manual line matching below or review in ERP.
        </p>
      )}

      {localErr && <p className="inv-error">{localErr}</p>}

      {row.can_retry_auto_invoice && (
        <div className="receipt-matching-card__create">
          <Btn
            variant="primary"
            size="sm"
            loading={retrying}
            onClick={handleRetryAutoPayable}
          >
            Retry create payable
          </Btn>
          <span className="page-header__sub">
            Payable auto-creation failed after approval — retry or contact support.
          </span>
        </div>
      )}

      {exceptional && row.can_create_invoice && (
        <div className="receipt-matching-card__create">
          <Btn
            variant="primary"
            size="sm"
            loading={creating === row.receipt}
            onClick={handleCreatePayable}
          >
            Create &amp; submit invoice (exceptional)
          </Btn>
          <span className="page-header__sub">
            Exceptional billing only — normal receipts are invoiced automatically on approval.
          </span>
        </div>
      )}

      {exceptional && linkable && (
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
    </article>
  );
}

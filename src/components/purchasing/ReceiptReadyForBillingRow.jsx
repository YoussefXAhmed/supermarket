import { Btn } from '../ui';
import BillingStatusPill from './BillingStatusPill';
import { fmtCurrency } from '../../utils/format';

/**
 * Exceptional billing rows only (variance / partial).
 */
export default function ReceiptReadyForBillingRow({ row, creating, onCreate }) {
  const state = row.action_state || 'exceptional_review';

  return (
    <li className="pi-from-receipt__row">
      <div className="pi-from-receipt__main">
        <div className="pi-from-receipt__id">
          <span className="mono pi-from-receipt__receipt">{row.receipt}</span>
          <span className="pi-from-receipt__supplier">{row.supplier}</span>
          <span className="pi-from-receipt__date">{row.posting_date}</span>
        </div>
        <BillingStatusPill status={row.billing_status} billedPct={row.billed_pct} />
        <span className={`pi-from-receipt__state pi-from-receipt__state--${state}`}>
          {row.action_label || 'Exceptional billing'}
        </span>
      </div>

      <div className="pi-from-receipt__amounts">
        <div>
          <span className="pi-from-receipt__label">Receipt total</span>
          <strong>{fmtCurrency(row.grand_total)}</strong>
        </div>
        <div>
          <span className="pi-from-receipt__label">Remaining</span>
          <strong>{fmtCurrency(row.remaining_amount)}</strong>
        </div>
        <div>
          <span className="pi-from-receipt__label">Billed %</span>
          <strong>{row.billed_pct != null ? `${row.billed_pct}%` : '—'}</strong>
        </div>
      </div>

      <div className="pi-from-receipt__actions">
        {state === 'exceptional' && row.can_create_invoice && (
          <Btn
            variant="primary"
            size="sm"
            loading={creating}
            onClick={() => onCreate(row.receipt)}
          >
            Create &amp; submit invoice
          </Btn>
        )}
        {state === 'exceptional_review' && (
          <span className="pi-from-receipt__status-msg">
            Review variance or partial billing in Invoice matching
          </span>
        )}
        {state === 'settled' && (
          <span className="pi-from-receipt__status-msg pi-from-receipt__status-msg--muted">
            Settled
          </span>
        )}
      </div>
    </li>
  );
}

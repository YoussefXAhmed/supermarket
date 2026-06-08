import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Modal, Btn, ApiErrorCard, Spinner } from '../ui';
import ApPaymentStatusPill from './ApPaymentStatusPill';
import { fetchApInvoiceDetail } from '../../services/accountsPayableService';
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { printErpFormat, PRINT_FORMATS } from '../../utils/printErpFormat';

/**
 * Detail view for a single Supplier Invoice. Loaded lazily when opened.
 * Provides:
 *   - Invoice header (number, supplier, linked Goods Receipt, dates, status)
 *   - Line items
 *   - Payment summary (Total, Paid, Outstanding, Paid %)
 *   - Payment timeline (per Payment Entry)
 *   - Print + Download PDF (window.print on a hidden print-only iframe-like region)
 *
 * All copy uses i18n keys; falls back to defaultValue strings if missing.
 */
export default function SupplierInvoiceDetailModal({ open, invoiceName, onClose }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !invoiceName) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    fetchApInvoiceDetail(invoiceName)
      .then((res) => {
        if (!cancelled) setData(res || null);
      })
      .catch((e) => {
        if (!cancelled) setError(getUserFriendlyMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, invoiceName]);

  const invoice = data?.invoice;
  const payments = data?.payments || [];
  const currency = invoice?.currency || 'EGP';

  const dueLabel = (() => {
    if (!invoice) return null;
    if (!invoice.due_date) return null;
    if (invoice.days_overdue > 0) {
      return (
        <span className="invoice-detail__due invoice-detail__due--overdue">
          {t('finance.payments.daysOverdue', { count: invoice.days_overdue })}
        </span>
      );
    }
    if (invoice.days_remaining === 0) {
      return <span className="invoice-detail__due">{t('finance.payments.dueToday')}</span>;
    }
    return (
      <span className="invoice-detail__due">
        {t('finance.payments.daysRemaining', { count: invoice.days_remaining })}
      </span>
    );
  })();

  // Server-rendered PDF via the unified ERPNext Supplier Invoice print
  // format. Same call serves both the Print and Download PDF buttons —
  // the browser decides inline-view vs save.
  const handlePrint = () => {
    if (!invoiceName) return;
    printErpFormat({ ...PRINT_FORMATS.SUPPLIER_INVOICE, name: invoiceName });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice ? `${t('finance.payments.viewInvoice')} — ${invoice.name}` : t('finance.payments.viewInvoice')}
      size="lg"
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {t('common.close')}
          </Btn>
          {invoice && (
            <>
              <Btn variant="ghost" size="md" onClick={handlePrint}>
                {t('finance.payments.printInvoice')}
              </Btn>
              <Btn variant="primary" size="md" onClick={handlePrint}>
                {t('finance.payments.downloadPdf')}
              </Btn>
            </>
          )}
        </>
      }
    >
      {loading && (
        <div className="invoice-detail__loading"><Spinner /></div>
      )}
      {error && !loading && <ApiErrorCard message={error} />}
      {invoice && !loading && (
        <div ref={printRef} className="invoice-detail">
          <header className="invoice-detail__header meta">
            <div>
              <h1>{invoice.name}</h1>
              <dl>
                <dt>{t('purchasing.table.supplier', { defaultValue: 'Supplier' })}</dt>
                <dd>{invoice.supplier_name || invoice.supplier}</dd>
                {invoice.purchase_receipt && (
                  <>
                    <dt>{t('finance.payments.linkedReceipt')}</dt>
                    <dd>
                      <Link to={`/purchasing/history?name=${encodeURIComponent(invoice.purchase_receipt)}`}>
                        {invoice.purchase_receipt}
                      </Link>
                    </dd>
                  </>
                )}
                <dt>{t('finance.table.date')}</dt>
                <dd>{fmtDate(invoice.posting_date)}</dd>
                <dt>{t('finance.table.due')}</dt>
                <dd>
                  {invoice.due_date ? fmtDate(invoice.due_date) : '—'}
                  {dueLabel && <> · {dueLabel}</>}
                </dd>
              </dl>
            </div>
            <div className="invoice-detail__status">
              <ApPaymentStatusPill status={invoice.payment_status} paidPct={invoice.paid_pct} />
            </div>
          </header>

          <table>
            <thead>
              <tr>
                <th>{t('approvals.table.item', { defaultValue: 'Item' })}</th>
                <th className="num">{t('approvals.table.qty', { defaultValue: 'Qty' })}</th>
                <th className="num">{t('purchasing.rate', { defaultValue: 'Rate' })}</th>
                <th className="num">{t('approvals.table.amount', { defaultValue: 'Amount' })}</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((it, i) => (
                <tr key={`${it.item_code}-${i}`}>
                  <td>
                    <div><strong>{it.item_code}</strong></div>
                    {it.item_name && it.item_name !== it.item_code && (
                      <div style={{ color: '#666', fontSize: '0.82rem' }}>{it.item_name}</div>
                    )}
                  </td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{fmtCurrency(it.rate, { currency })}</td>
                  <td className="num">{fmtCurrency(it.amount, { currency })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">{t('approvals.subtotal', { defaultValue: 'Subtotal' })}</td>
                <td className="num">{fmtCurrency(invoice.net_total ?? invoice.grand_total, { currency })}</td>
              </tr>
              {Number(invoice.total_taxes_and_charges) > 0 && (
                <tr>
                  <td colSpan={3} className="num">{t('approvals.tax', { defaultValue: 'Tax' })}</td>
                  <td className="num">{fmtCurrency(invoice.total_taxes_and_charges, { currency })}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="num"><strong>{t('approvals.total', { defaultValue: 'Total' })}</strong></td>
                <td className="num"><strong>{fmtCurrency(invoice.grand_total, { currency })}</strong></td>
              </tr>
            </tfoot>
          </table>

          <div className="totals">
            <dl>
              <dt>{t('finance.payments.totalPaid')}</dt>
              <dd>{fmtCurrency(invoice.paid_amount, { currency })}</dd>
              <dt>{t('finance.payments.outstanding')}</dt>
              <dd>{fmtCurrency(invoice.outstanding_amount, { currency })}</dd>
              <dt>{t('finance.table.paidPct')}</dt>
              <dd>{invoice.paid_pct != null ? `${Math.round(invoice.paid_pct)}%` : '—'}</dd>
            </dl>
          </div>

          <h3 className="invoice-detail__history-title">
            {t('finance.payments.paymentHistory')}
          </h3>
          {payments.length === 0 ? (
            <p className="page-header__sub">{t('finance.payments.noPaymentsRecorded')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('finance.table.date')}</th>
                  <th>{t('finance.table.invoice', { defaultValue: 'Payment #' })}</th>
                  <th>{t('finance.payments.paidFrom', { defaultValue: 'Paid from' })}</th>
                  <th className="num">{t('approvals.table.amount', { defaultValue: 'Amount' })}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={`${p.payment_entry}-${i}`}>
                    <td>{fmtDateTime(p.posting_date)}</td>
                    <td><strong>{p.payment_entry}</strong></td>
                    <td>{p.paid_from || '—'}</td>
                    <td className="num">{fmtCurrency(p.allocated_amount, { currency })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}

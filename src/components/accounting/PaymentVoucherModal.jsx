/**
 * Payment Voucher — printable summary of a submitted Payment Entry.
 *
 * Opens automatically after CreateSupplierPaymentPanel finishes, so the
 * accountant can hand a printed voucher to the supplier or file it. Also
 * reachable from Payment History (view voucher button).
 *
 * The voucher is a "snapshot" — once the underlying Payment Entry is
 * submitted, the invoice it referenced is genuinely paid (ERPNext updates
 * outstanding_amount during submit). The voucher only renders information.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Btn, ApiErrorCard, Spinner } from '../ui';
import { fetchPaymentVoucher } from '../../services/accountsPayableService';
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { PrintIcon, DownloadIcon } from '../icons';
import { printErpFormat, PRINT_FORMATS } from '../../utils/printErpFormat';

export default function PaymentVoucherModal({ open, paymentEntryName, onClose }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !paymentEntryName) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    fetchPaymentVoucher(paymentEntryName)
      .then((d) => { if (!cancelled) setData(d || null); })
      .catch((e) => { if (!cancelled) setError(getUserFriendlyMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, paymentEntryName]);

  // Server-rendered PDF via the unified ERPNext print format. Replaces the
  // old browser-print fallback. The same call handles both Print and
  // Download — the user's browser chooses inline-view vs save.
  const handlePrint = () => {
    if (!paymentEntryName) return;
    printErpFormat({ ...PRINT_FORMATS.PAYMENT_VOUCHER, name: paymentEntryName });
  };

  const voucherTone = (data?.docstatus === 1)
    ? t('finance.voucher.statusSubmitted', { defaultValue: 'Submitted' })
    : t('finance.voucher.statusDraft', { defaultValue: 'Draft' });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={data ? `${t('finance.voucher.title', { defaultValue: 'Payment Voucher' })} — ${data.name}` : t('finance.voucher.title', { defaultValue: 'Payment Voucher' })}
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </Btn>
          {data && (
            <>
              <Btn variant="ghost" size="md" onClick={handlePrint}>
                <PrintIcon size={16} /> <span style={{ marginInlineStart: 6 }}>{t('finance.voucher.print', { defaultValue: 'Print voucher' })}</span>
              </Btn>
              <Btn variant="primary" size="md" onClick={handlePrint}>
                <DownloadIcon size={16} /> <span style={{ marginInlineStart: 6 }}>{t('finance.voucher.download', { defaultValue: 'Download PDF' })}</span>
              </Btn>
            </>
          )}
        </>
      }
    >
      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>}
      {error && !loading && <ApiErrorCard message={error} />}
      {data && !loading && (
        <div ref={printRef} className="voucher">
          <div className="voucher__header header">
            <div>
              <h1>{t('finance.voucher.title', { defaultValue: 'Payment Voucher' })}</h1>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)' }}>{data.name}</p>
            </div>
            <span className="pill">{voucherTone}</span>
          </div>

          <dl>
            <dt>{t('finance.voucher.supplier', { defaultValue: 'Supplier' })}</dt>
            <dd>{data.supplier_name || data.supplier}</dd>
            <dt>{t('finance.voucher.date', { defaultValue: 'Date' })}</dt>
            <dd>{fmtDate(data.posting_date)}</dd>
            <dt>{t('finance.voucher.paymentMethod', { defaultValue: 'Payment method' })}</dt>
            <dd>{data.mode_of_payment || t('finance.voucher.unspecified', { defaultValue: 'Unspecified' })}</dd>
            <dt>{t('finance.voucher.paidFrom', { defaultValue: 'Paid from' })}</dt>
            <dd>{data.paid_from || '—'}</dd>
            {data.reference_no && (
              <>
                <dt>{t('finance.voucher.referenceNo', { defaultValue: 'Reference no.' })}</dt>
                <dd>{data.reference_no}</dd>
              </>
            )}
            <dt>{t('finance.voucher.createdBy', { defaultValue: 'Created by' })}</dt>
            <dd>{data.created_by}</dd>
            <dt>{t('finance.voucher.createdAt', { defaultValue: 'Created at' })}</dt>
            <dd>{fmtDateTime(data.creation)}</dd>
            {data.remarks && (
              <>
                <dt>{t('finance.voucher.notes', { defaultValue: 'Notes' })}</dt>
                <dd>{data.remarks}</dd>
              </>
            )}
          </dl>

          <table>
            <thead>
              <tr>
                <th>{t('finance.voucher.relatedInvoice', { defaultValue: 'Related invoice' })}</th>
                <th className="num">{t('finance.voucher.invoiceTotal', { defaultValue: 'Invoice total' })}</th>
                <th className="num">{t('finance.voucher.outstanding', { defaultValue: 'Outstanding' })}</th>
                <th className="num">{t('finance.voucher.allocated', { defaultValue: 'Allocated' })}</th>
              </tr>
            </thead>
            <tbody>
              {(data.references || []).map((r, i) => (
                <tr key={`${r.reference_name}-${i}`}>
                  <td><strong>{r.reference_name}</strong></td>
                  <td className="num">{fmtCurrency(r.total_amount)}</td>
                  <td className="num">{fmtCurrency(r.outstanding_amount)}</td>
                  <td className="num">{fmtCurrency(r.allocated_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">{t('finance.voucher.totalPaid', { defaultValue: 'Total paid' })}</td>
                <td className="num">{fmtCurrency(data.paid_amount)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="signature-row">
            <div>{t('finance.voucher.preparedBy', { defaultValue: 'Prepared by' })}</div>
            <div>{t('finance.voucher.receivedBy', { defaultValue: 'Received by' })}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

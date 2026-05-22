import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn } from '../ui';
import { getERPPrintviewUrl } from '../../utils/erpLinks';

const fmt = (n) => `EGP ${Number(n || 0).toFixed(2)}`;
const ARABIC_TEXT_RE = /[\u0600-\u06FF]/;
const hasArabicText = (value) => ARABIC_TEXT_RE.test(String(value || ''));

export default function POSThermalReceipt({ invoice, companyName = 'Elmahdi Supermarket', onClose }) {
  const { t } = useTranslation();
  const printRef = useRef(null);

  if (!invoice) return null;

  const lines = invoice.items || [];
  const total = Number(invoice.grand_total || invoice.total || 0);
  const paid = invoice.payments || [];
  const date = invoice.posting_date || new Date().toISOString().slice(0, 10);
  const time = invoice.posting_time?.slice(0, 8) || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const hasArabicContent = [
    companyName,
    invoice.customer,
    ...lines.flatMap((line) => [line.item_name, line.item_code]),
    ...paid.map((payment) => payment.mode_of_payment),
  ].some(hasArabicText);
  const appDir = typeof document !== 'undefined' ? document.documentElement.dir : 'ltr';
  const receiptDir = hasArabicContent || appDir === 'rtl' ? 'rtl' : 'ltr';

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html><html dir="${receiptDir}" lang="${receiptDir === 'rtl' ? 'ar' : 'en'}"><head>
        <title>Receipt ${invoice.name}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, Arial, 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.45;
            margin: 0;
            color: #000;
            direction: ${receiptDir};
            unicode-bidi: plaintext;
          }
          .center { text-align: center; }
          .pos-receipt__line, .line { border-top: 1px dashed #000; margin: 8px 0; }
          .pos-receipt__meta p, .pos-receipt__payments p, .pos-receipt__total {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 4px 0;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 3px 0; vertical-align: top; }
          th:first-child, td:first-child { text-align: start; }
          .right, .pos-receipt__num {
            direction: ltr;
            unicode-bidi: isolate;
            text-align: end;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .pos-receipt__item-name, .pos-receipt__text { unicode-bidi: isolate; overflow-wrap: anywhere; }
          .pos-receipt__item-code { direction: ltr; unicode-bidi: isolate; font-size: 10px; color: #444; }
          .bold { font-weight: bold; }
          .pos-receipt__brand { font-size: 14px; font-weight: bold; margin: 0; }
          .pos-receipt__tag, .pos-receipt__muted { font-size: 10px; }
          .pos-receipt__ltr { direction: ltr; unicode-bidi: isolate; }
          .pos-receipt__footer { margin-top: 12px; }
        </style>
      </head><body dir="${receiptDir}" class="pos-receipt-print">${node.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="pos-receipt-wrap">
      <div className="pos-receipt-actions no-print">
        <Btn variant="primary" size="sm" onClick={handlePrint}>{t('pos.printReceipt')}</Btn>
        {invoice.name && (
          <a
            className="btn btn--ghost btn--sm"
            href={getERPPrintviewUrl({ doctype: 'POS Invoice', name: invoice.name })}
            target="_blank"
            rel="noreferrer"
          >
            {t('pos.erpPrint')}
          </a>
        )}
        {onClose && (
          <Btn variant="ghost" size="sm" onClick={onClose}>{t('common.close')}</Btn>
        )}
      </div>

      <article ref={printRef} className="pos-receipt thermal-receipt" dir={receiptDir}>
        <header className="pos-receipt__header center">
          <p className="pos-receipt__brand"><bdi dir="auto">{companyName}</bdi></p>
          <p className="pos-receipt__tag pos-receipt__ltr">{t('pos.taxInvoice')}</p>
        </header>

        <div className="pos-receipt__meta">
          <p><span>{t('pos.receiptInvoice')}</span> <strong className="pos-receipt__num">{invoice.name}</strong></p>
          <p><span>{t('pos.receiptDate')}</span> <span className="pos-receipt__num">{date} {time}</span></p>
          <p><span>{t('pos.receiptCustomer')}</span> <bdi className="pos-receipt__text" dir="auto">{invoice.customer || t('pos.walkInCustomer')}</bdi></p>
          {invoice.pos_profile && <p><span>POS</span> <bdi className="pos-receipt__text" dir="auto">{invoice.pos_profile}</bdi></p>}
        </div>

        <div className="pos-receipt__line" />

        <table className="pos-receipt__table">
          <thead>
            <tr>
              <th>{t('pos.receiptItem')}</th>
              <th className="right">{t('pos.receiptQty')}</th>
              <th className="right">{t('pos.receiptAmt')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const qty = Number(line.qty || 0);
              const amount = Number(line.amount ?? qty * Number(line.rate || 0));
              return (
                <tr key={`${line.item_code}-${idx}`}>
                  <td>
                    <bdi className="pos-receipt__item-name" dir="auto">{line.item_name || line.item_code}</bdi>
                    <div className="pos-receipt__item-code">{line.item_code}</div>
                  </td>
                  <td className="right pos-receipt__num">{qty}</td>
                  <td className="right pos-receipt__num">{amount.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pos-receipt__line" />

        <div className="pos-receipt__total">
          <span>{t('pos.receiptTotal')}</span>
          <strong className="pos-receipt__num">{fmt(total)}</strong>
        </div>

        {paid.length > 0 && (
          <>
            <div className="pos-receipt__line" />
            <div className="pos-receipt__payments">
              {paid.map((p, i) => (
                <p key={i}>
                  <bdi className="pos-receipt__text" dir="auto">{p.mode_of_payment}</bdi>
                  <span className="right pos-receipt__num">{fmt(p.amount)}</span>
                </p>
              ))}
            </div>
          </>
        )}

        <footer className="pos-receipt__footer center">
          <p className="pos-receipt__ltr">{t('pos.thankYou')}</p>
          <p className="pos-receipt__muted pos-receipt__ltr">{t('pos.keepReceipt')}</p>
        </footer>
      </article>
    </div>
  );
}

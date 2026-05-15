import { useRef } from 'react';
import { Btn } from '../ui';
import { getERPPrintviewUrl } from '../../utils/erpLinks';

const fmt = (n) => `EGP ${Number(n || 0).toFixed(2)}`;

export default function POSThermalReceipt({ invoice, companyName = 'Elmahdi Supermarket', onClose }) {
  const printRef = useRef(null);

  if (!invoice) return null;

  const lines = invoice.items || [];
  const total = Number(invoice.grand_total || invoice.total || 0);
  const paid = invoice.payments || [];
  const date = invoice.posting_date || new Date().toISOString().slice(0, 10);
  const time = invoice.posting_time?.slice(0, 8) || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html><html><head>
        <title>Receipt ${invoice.name}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 8px; color: #000; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; vertical-align: top; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
        </style>
      </head><body>${node.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="pos-receipt-wrap">
      <div className="pos-receipt-actions no-print">
        <Btn variant="primary" size="sm" onClick={handlePrint}>Print receipt</Btn>
        {invoice.name && (
          <a
            className="btn btn--ghost btn--sm"
            href={getERPPrintviewUrl({ doctype: 'POS Invoice', name: invoice.name })}
            target="_blank"
            rel="noreferrer"
          >
            ERP print
          </a>
        )}
        {onClose && (
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        )}
      </div>

      <article ref={printRef} className="pos-receipt thermal-receipt">
        <header className="pos-receipt__header center">
          <p className="pos-receipt__brand">{companyName}</p>
          <p className="pos-receipt__tag">Tax Invoice / Receipt</p>
        </header>

        <div className="pos-receipt__meta">
          <p><span>Invoice</span> <strong>{invoice.name}</strong></p>
          <p><span>Date</span> {date} {time}</p>
          <p><span>Customer</span> {invoice.customer || 'Walk-in Customer'}</p>
          {invoice.pos_profile && <p><span>POS</span> {invoice.pos_profile}</p>}
        </div>

        <div className="pos-receipt__line" />

        <table className="pos-receipt__table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="right">Qty</th>
              <th className="right">Amt</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const qty = Number(line.qty || 0);
              const amount = Number(line.amount ?? qty * Number(line.rate || 0));
              return (
                <tr key={`${line.item_code}-${idx}`}>
                  <td>
                    <div className="pos-receipt__item-name">{line.item_name || line.item_code}</div>
                    <div className="pos-receipt__item-code">{line.item_code}</div>
                  </td>
                  <td className="right">{qty}</td>
                  <td className="right">{amount.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pos-receipt__line" />

        <div className="pos-receipt__total">
          <span>TOTAL</span>
          <strong>{fmt(total)}</strong>
        </div>

        {paid.length > 0 && (
          <>
            <div className="pos-receipt__line" />
            <div className="pos-receipt__payments">
              {paid.map((p, i) => (
                <p key={i}>
                  <span>{p.mode_of_payment}</span>
                  <span className="right">{fmt(p.amount)}</span>
                </p>
              ))}
            </div>
          </>
        )}

        <footer className="pos-receipt__footer center">
          <p>Thank you for shopping!</p>
          <p className="pos-receipt__muted">Please keep this receipt</p>
        </footer>
      </article>
    </div>
  );
}

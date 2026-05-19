import { useEffect, useMemo, useState } from 'react';
import { Btn } from '../ui';
import { fmtCurrency } from '../../utils/format';
import {
  createSupplierPayment,
  listApInvoices,
  listPaymentAccounts,
} from '../../services/accountsPayableService';
import { listSuppliers } from '../../services/purchasingApi';
import { getCompanies } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function CreateSupplierPaymentPanel({ onSuccess, onCancel, preselectSupplier = '' }) {
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState(preselectSupplier);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paidFrom, setPaidFrom] = useState('');
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [openInvoices, setOpenInvoices] = useState([]);
  const [selected, setSelected] = useState({});
  const [amounts, setAmounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getCompanies({ limit: 1 }).then((r) => setCompany(r?.data?.data?.[0]?.name || ''));
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
  }, []);

  useEffect(() => {
    if (!company) return;
    listPaymentAccounts(company).then((rows) => {
      setAccounts(rows || []);
      if (rows?.[0]) setPaidFrom(rows[0].name);
    });
  }, [company]);

  useEffect(() => {
    if (!supplier || !company) {
      setOpenInvoices([]);
      return;
    }
    setLoading(true);
    listApInvoices({ supplier, company, status: 'all', limit: 100 })
      .then((rows) => {
        const open = (rows || []).filter((r) => Number(r.outstanding_amount) > 0.009);
        setOpenInvoices(open);
        const sel = {};
        const amt = {};
        open.forEach((inv) => {
          sel[inv.name] = false;
          amt[inv.name] = String(inv.outstanding_amount);
        });
        setSelected(sel);
        setAmounts(amt);
      })
      .finally(() => setLoading(false));
  }, [supplier, company]);

  const totalPay = useMemo(() => {
    return Object.entries(selected).reduce((sum, [name, on]) => {
      if (!on) return sum;
      return sum + (Number(amounts[name]) || 0);
    }, 0);
  }, [selected, amounts]);

  const toggle = (name) => {
    setSelected((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const payAllOutstanding = () => {
    const next = {};
    openInvoices.forEach((inv) => {
      next[inv.name] = true;
    });
    setSelected(next);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    const allocations = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([invoice, ]) => ({
        invoice,
        amount: Number(amounts[invoice]),
      }))
      .filter((row) => row.amount > 0);

    if (!allocations.length) {
      setErr('Select at least one invoice and enter a payment amount.');
      return;
    }

    setSaving(true);
    try {
      const result = await createSupplierPayment({
        supplier,
        company,
        paid_from: paidFrom,
        posting_date: postingDate,
        reference_no: referenceNo,
        remarks,
        allocations,
      });
      onSuccess?.(result);
    } catch (e2) {
      setErr(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="ap-payment-form" onSubmit={onSubmit}>
      <p className="ap-payment-form__intro">
        Creates a real ERPNext Payment Entry. GL entries, payables, and invoice outstanding are
        updated by ERP when submitted.
      </p>

      <div className="ap-payment-form__grid">
        <label>
          Supplier
          <select
            className="input"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            required
          >
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.name} value={s.name}>
                {s.supplier_name || s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pay from (cash / bank)
          <select
            className="input"
            value={paidFrom}
            onChange={(e) => setPaidFrom(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a.name} value={a.name}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Posting date
          <input
            className="input"
            type="date"
            value={postingDate}
            onChange={(e) => setPostingDate(e.target.value)}
            required
          />
        </label>
        <label>
          Reference no.
          <input
            className="input"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="Cheque / transfer ref"
          />
        </label>
      </div>
      <label>
        Remarks
        <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </label>

      <div className="ap-payment-form__invoices-head">
        <span className="section-title">Allocate to invoices</span>
        <Btn type="button" variant="ghost" size="sm" onClick={payAllOutstanding}>
          Select all open
        </Btn>
      </div>

      {loading ? (
        <p className="page-header__sub">Loading open invoices…</p>
      ) : !supplier ? (
        <p className="page-header__sub">Select a supplier to see unpaid invoices.</p>
      ) : openInvoices.length === 0 ? (
        <p className="page-header__sub">No outstanding invoices for this supplier.</p>
      ) : (
        <ul className="ap-payment-form__invoice-list">
          {openInvoices.map((inv) => (
            <li key={inv.name} className="ap-payment-form__invoice-row">
              <label className="ap-payment-form__check">
                <input
                  type="checkbox"
                  checked={Boolean(selected[inv.name])}
                  onChange={() => toggle(inv.name)}
                />
                <span className="mono">{inv.name}</span>
              </label>
              <span>{inv.due_date || inv.posting_date}</span>
              <span>{fmtCurrency(inv.outstanding_amount)} due</span>
              <input
                className="input ap-payment-form__amount"
                type="number"
                min="0.01"
                step="0.01"
                max={inv.outstanding_amount}
                disabled={!selected[inv.name]}
                value={amounts[inv.name] ?? ''}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [inv.name]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="ap-payment-form__total">
        Payment total: <strong>{fmtCurrency(totalPay)}</strong>
      </p>

      {err && <p className="inv-error" role="alert">{err}</p>}

      <div className="ap-payment-form__actions">
        <Btn type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        <Btn type="submit" variant="primary" loading={saving} disabled={totalPay <= 0}>
          Submit payment
        </Btn>
      </div>
    </form>
  );
}

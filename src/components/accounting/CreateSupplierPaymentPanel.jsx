import { useEffect, useMemo, useState } from 'react';
import { Btn } from '../ui';
import { fmtCurrency } from '../../utils/format';
import {
  createSupplierPayment,
  fetchSupplierApSummary,
  listApInvoices,
  listPaymentAccounts,
} from '../../services/accountsPayableService';
import { listSuppliers } from '../../services/purchasingApi';
import { getCompanies } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useAuth } from '../../hooks/useAuth';
import { invoiceMatchingPath } from '../../utils/workspacePaths';

export default function CreateSupplierPaymentPanel({ onSuccess, onCancel, preselectSupplier = '' }) {
  const { capabilities } = useAuth();
  const matchingTo = invoiceMatchingPath(capabilities);
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState(preselectSupplier);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paidFrom, setPaidFrom] = useState('');
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNo, setReferenceNo] = useState('');
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [openInvoices, setOpenInvoices] = useState([]);
  const [selected, setSelected] = useState({});
  const [amounts, setAmounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [allocationHint, setAllocationHint] = useState(null);

  const selectedAccount = useMemo(() => accounts.find((a) => a.name === paidFrom) || null, [accounts, paidFrom]);
  const accountType = selectedAccount?.account_type || '';
  const isBankPayment = accountType === 'Bank';
  const isCashPayment = accountType === 'Cash';

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
      setAllocationHint(null);
      return;
    }
    setLoading(true);
    Promise.all([
      listApInvoices({ supplier, company, status: 'all', limit: 100 }),
      fetchSupplierApSummary(supplier, company),
    ])
      .then(([rows, summary]) => {
        const open = (rows || []).filter((r) => Number(r.outstanding_amount) > 0.009);
        setOpenInvoices(open);
        setAllocationHint(summary);
        const sel = {};
        const amt = {};
        open.forEach((inv) => {
          sel[inv.name] = false;
          amt[inv.name] = String(inv.outstanding_amount);
        });
        setSelected(sel);
        setAmounts(amt);
      })
      .catch(() => setAllocationHint(null))
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

    if (isBankPayment) {
      if (!String(referenceNo || '').trim()) {
        setErr('Reference No is required for Bank payments.');
        return;
      }
      if (!String(referenceDate || '').trim()) {
        setErr('Reference Date is required for Bank payments.');
        return;
      }
    }

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
        reference_date: isBankPayment ? referenceDate : undefined,
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
        Creates a supplier payment. Accounting entries, supplier balance, and bill outstanding are
        updated when approved.
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
          {isBankPayment && (
            <span className="inv-hint">Bank payments require transfer/cheque reference and date.</span>
          )}
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
          Reference no.{isBankPayment ? ' *' : ''}
          <input
            className="input"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="Cheque / transfer ref"
            required={isBankPayment}
          />
        </label>
        <label>
          Reference date{isBankPayment ? ' *' : ''}
          <input
            className="input"
            type="date"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
            required={isBankPayment}
            disabled={isCashPayment}
            title={isCashPayment ? 'Optional for Cash payments' : 'Required for Bank payments'}
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
        <div className="ap-payment-form__empty-invoices">
          <p className="page-header__sub">
            No submitted purchase invoices with an outstanding balance for this supplier.
          </p>
          {allocationHint?.awaiting_payable_count > 0 && (
            <p className="page-header__sub">
              {allocationHint.awaiting_payable_count} approved receipt(s) are waiting for a
              submitted payable (auto-created on manager approval). Check{' '}
              <a href={matchingTo}>Invoice matching</a> and use <strong>Retry create payable</strong>{' '}
              if needed.
            </p>
          )}
          {allocationHint?.paid_invoice_count > 0 && (
            <p className="page-header__sub">
              {allocationHint.paid_invoice_count} submitted invoice(s) are already fully paid
              {allocationHint.paid_invoice_names?.length
                ? ` (e.g. ${allocationHint.paid_invoice_names.join(', ')})`
                : ''}
              .
            </p>
          )}
          {!allocationHint?.awaiting_payable_count &&
            !allocationHint?.paid_invoice_count &&
            !allocationHint?.invoice_count && (
              <p className="page-header__sub">
                No purchase invoices exist for this supplier yet.
              </p>
            )}
        </div>
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

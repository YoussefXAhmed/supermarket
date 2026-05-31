import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '../ui';
import {
  createPurchaseInvoiceFromReceipt,
  getReceiptsReadyForBilling,
} from '../../services/invoiceMatchingService';
import { getCompanies } from '../../services/api';
import { listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useAuth } from '../../hooks/useAuth';
import { invoiceMatchingPath } from '../../utils/workspacePaths';
import { openERPDesk } from '../../utils/erpLinks';
import ReceiptReadyForBillingRow from './ReceiptReadyForBillingRow';

export default function CreateInvoiceFromReceiptPanel({ onSuccess }) {
  const { capabilities } = useAuth();
  const matchingTo = invoiceMatchingPath(capabilities);
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState('');
  const [submitOnCreate, setSubmitOnCreate] = useState(true);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(null);

  const loadReceipts = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    setErr('');
    try {
      const rows = await getReceiptsReadyForBilling({
        company,
        supplier: supplier || undefined,
        limit: 50,
      });
      setReceipts(rows || []);
    } catch (e) {
      setReceipts([]);
      setErr(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [company, supplier]);

  useEffect(() => {
    getCompanies({ limit: 1 }).then((r) => setCompany(r?.data?.data?.[0]?.name || ''));
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const handleCreate = async (receiptName) => {
    setCreating(receiptName);
    setErr('');
    setSuccess(null);
    try {
      const result = await createPurchaseInvoiceFromReceipt(receiptName, { submit: submitOnCreate });
      setSuccess({
        receipt: receiptName,
        name: result.name,
        submitted: result.submitted,
        message: result.message,
        outstanding_amount: result.outstanding_amount,
        billed_pct: result.billed_pct,
      });
      onSuccess?.(result);
      await loadReceipts();
    } catch (e) {
      setErr(getUserFriendlyMessage(e));
    } finally {
      setCreating('');
    }
  };

  return (
    <div className="pi-from-receipt">
      <p className="pi-from-receipt__intro">
        <strong>Exceptional billing only.</strong> Normal receipts create and submit a supplier
        payable automatically when a store manager approves the purchase receipt. Use this screen
        only for variance or partial-billing cases — see also{' '}
        <Link to={matchingTo}>Invoice matching</Link>.
      </p>

      <div className="pi-from-receipt__filters">
        <label>
          Supplier (optional)
          <select
            className="input"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.name} value={s.name}>
                {s.supplier_name || s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pi-from-receipt__submit-flag">
          <input
            type="checkbox"
            checked={submitOnCreate}
            onChange={(e) => setSubmitOnCreate(e.target.checked)}
          />
          Submit immediately after create
        </label>
        <Btn variant="ghost" size="sm" onClick={loadReceipts} disabled={loading}>
          Refresh
        </Btn>
      </div>

      {success && (
        <div className="pi-from-receipt__success" role="status">
          <p className="pi-from-receipt__success-title">
            {success.submitted ? 'Invoice submitted successfully' : 'Purchase invoice created'}
          </p>
          <p className="pi-from-receipt__success-detail">
            <span className="mono">{success.name}</span>
            {success.billed_pct != null ? ` · Receipt billed ${success.billed_pct}%` : ''}
            {success.outstanding_amount != null && success.submitted
              ? ` · Outstanding ${success.outstanding_amount}`
              : ''}
          </p>
          <div className="pi-from-receipt__success-actions">
            {/* "Open invoice" jumps to ERPNext Desk; restrict to System Manager
                so finance users stay in the SPA matching workflow instead of
                editing the invoice doc directly. */}
            {capabilities?.canManageSystem && (
              <Btn variant="primary" size="sm" onClick={() => openERPDesk(`purchase-invoice/${success.name}`)}>
                Open invoice
              </Btn>
            )}
            <Btn variant="ghost" size="sm" onClick={() => setSuccess(null)}>
              Dismiss
            </Btn>
          </div>
        </div>
      )}

      {loading ? (
        <p className="pi-from-receipt__empty">Loading exceptional receipts…</p>
      ) : receipts.length === 0 ? (
        <p className="pi-from-receipt__empty">
          No exceptional receipts need manual billing. Approved receipts appear in Finance →
          Supplier payments automatically.
        </p>
      ) : (
        <ul className="pi-from-receipt__list">
          {receipts.map((row) => (
            <ReceiptReadyForBillingRow
              key={row.receipt}
              row={row}
              creating={creating === row.receipt}
              onCreate={handleCreate}
            />
          ))}
        </ul>
      )}

      {err && <p className="inv-error">{err}</p>}
    </div>
  );
}

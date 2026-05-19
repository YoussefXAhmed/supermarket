import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiErrorCard, Btn, EmptyState, PageHeader, PageLoading, PartialDataBanner } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import ReceiptMatchingCard from '../../components/purchasing/ReceiptMatchingCard';
import {
  fetchInvoiceMatchingWorkspace,
  linkReceiptToInvoice,
  fetchReceiptMatchingDetail,
} from '../../services/invoiceMatchingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useOperationalRefresh } from '../../services/operationalRefresh';
import { normalizeBillingStatus, BILLING_STATUS } from '../../utils/billingStatus';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: BILLING_STATUS.UNBILLED, label: 'Unbilled' },
  { id: BILLING_STATUS.PARTIALLY_BILLED, label: 'Partial' },
  { id: BILLING_STATUS.FULLY_BILLED, label: 'Fully billed' },
  { id: BILLING_STATUS.VARIANCE_DETECTED, label: 'Variance' },
  { id: BILLING_STATUS.OVERBILLED, label: 'Overbilled' },
];

export default function InvoiceMatchingPage() {
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchInvoiceMatchingWorkspace();
      setRows(data || []);
      setWarnings([]);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useOperationalRefresh(load, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => normalizeBillingStatus(r.billing_status) === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) {
      const k = normalizeBillingStatus(r.billing_status);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [rows]);

  const handleLink = async (receiptName, invoiceName) => {
    setLinking(receiptName);
    setError('');
    try {
      const result = await linkReceiptToInvoice(receiptName, invoiceName);
      if (result?.workspace) {
        setRows((prev) =>
          prev.map((r) => (r.receipt === receiptName ? result.workspace : r)),
        );
      } else {
        await load();
      }
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLinking('');
    }
  };

  const refreshReceipt = async (receiptName) => {
    try {
      const detail = await fetchReceiptMatchingDetail(receiptName);
      setRows((prev) => prev.map((r) => (r.receipt === receiptName ? detail : r)));
    } catch {
      await load();
    }
  };

  return (
    <TablePageLayout className="page-layout--list-page invoice-matching-page">
      <PageHeader
        title="Invoice matching"
        subtitle="Link submitted purchase receipts to draft supplier invoices — validated on ERP"
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load}>
            Refresh
          </Btn>
        }
      />
      <PartialDataBanner warnings={warnings} />

      <div className="ap-workflow-banner" role="note">
        <strong>Operational flow:</strong> (1) Receive stock → Purchase Receipt · (2) Match supplier
        invoice here · (3){' '}
        <Link to="/admin/accounting/payments">Pay supplier</Link> via ERP Payment Entry. Billing %
        and paid % come from ERP only.
      </div>

      <div className="invoice-matching-filters" role="tablist" aria-label="Billing status filter">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={statusFilter === f.id}
            className={`invoice-matching-filters__btn${
              statusFilter === f.id ? ' invoice-matching-filters__btn--active' : ''
            }`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
            <span className="invoice-matching-filters__count">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoading size={26} />
      ) : error && !rows.length ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No receipts in this view"
          desc={
            statusFilter === 'all'
              ? 'Submitted purchase receipts will appear here for invoice matching.'
              : 'Try another filter or receive stock first.'
          }
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          {error && (
            <p className="inv-error" role="alert" style={{ padding: '0.75rem 1rem' }}>
              {error}
            </p>
          )}
          <div className="invoice-matching-list">
            {filtered.map((row) => (
              <ReceiptMatchingCard
                key={row.receipt}
                row={row}
                linking={linking}
                onLink={handleLink}
                onRefreshLine={refreshReceipt}
              />
            ))}
          </div>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

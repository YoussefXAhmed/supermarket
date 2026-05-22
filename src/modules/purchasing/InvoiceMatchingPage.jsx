import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

export default function InvoiceMatchingPage() {
  const { t } = useTranslation();

  const STATUS_FILTERS = [
    { id: 'all', label: t('purchasing.invoiceMatching.statusAll') },
    { id: BILLING_STATUS.UNBILLED, label: t('purchasing.invoiceMatching.statusUnbilled') },
    { id: BILLING_STATUS.PARTIALLY_BILLED, label: t('purchasing.invoiceMatching.statusPartial') },
    { id: BILLING_STATUS.FULLY_BILLED, label: t('purchasing.invoiceMatching.statusFullyBilled') },
    { id: BILLING_STATUS.VARIANCE_DETECTED, label: t('purchasing.invoiceMatching.statusVariance') },
    { id: BILLING_STATUS.OVERBILLED, label: t('purchasing.invoiceMatching.statusOverbilled') },
  ];

  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState('');
  const [creating, setCreating] = useState('');
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

  const applyWorkspaceUpdate = (result) => {
    const ws = result?.workspace;
    const receipt = result?.receipt || ws?.receipt;
    if (ws && receipt) {
      setRows((prev) => prev.map((r) => (r.receipt === receipt ? ws : r)));
    } else if (receipt) {
      refreshReceipt(receipt);
    } else {
      load();
    }
  };

  const handleInvoiceCreated = async (result) => {
    setCreating(result?.receipt || '');
    try {
      applyWorkspaceUpdate(result);
    } finally {
      setCreating('');
    }
  };

  return (
    <TablePageLayout className="page-layout--list-page invoice-matching-page">
      <PageHeader
        title={t('purchasing.invoiceMatching.title')}
        subtitle={t('purchasing.invoiceMatching.subtitle')}
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load}>
            {t('common.refresh')}
          </Btn>
        }
      />
      <PartialDataBanner warnings={warnings} />

      <div className="ap-workflow-banner" role="note">
        <strong>{t('purchasing.invoiceMatching.operationalFlow')}:</strong> (1) {t('purchasing.receiveStock')} → Purchase Receipt · (2) {' '}
        {t('approvals.managersDesc')} · (3){' '}
        <Link to="/admin/accounting/payments">{t('approvals.recordPayment')}</Link> {t('nav.finance')}.
      </div>

      <div className="invoice-matching-filters" role="tablist" aria-label={t('purchasing.invoiceMatching.billingFilter')}>
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
          title={t('purchasing.invoiceMatching.noReceipts')}
          desc={
            statusFilter === 'all'
              ? t('purchasing.invoiceMatching.noReceiptsAll')
              : t('purchasing.invoiceMatching.tryFilter')
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
                creating={creating}
                onLink={handleLink}
                onRefreshLine={refreshReceipt}
                onInvoiceCreated={handleInvoiceCreated}
              />
            ))}
          </div>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fmtCurrency } from '../../utils/format';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import PurchaseApprovalCard from '../../components/approvals/PurchaseApprovalCard';
import {
  approvePurchaseReceipt,
  listPendingPurchaseApprovals,
  rejectPurchaseReceipt,
} from '../../services/purchasingApprovalApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function PurchaseApprovalsPage() {
  const { t } = useTranslation();
  const { capabilities, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');
  const [actionError, setActionError] = useState('');
  const [approveSuccess, setApproveSuccess] = useState(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPendingPurchaseApprovals();
      setRows(data);
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

  const onApprove = async (name) => {
    setActionId(name);
    setActionError('');
    try {
      const result = await approvePurchaseReceipt(name, { notes });
      setApproveSuccess(result);
      setNotes('');
      await load();
    } catch (e) {
      setActionError(getUserFriendlyMessage(e));
    } finally {
      setActionId('');
    }
  };

  const onReject = async (name) => {
    if (!window.confirm(t('approvals.rejectConfirm', { name }))) return;
    setActionId(name);
    setActionError('');
    try {
      await rejectPurchaseReceipt(name, { notes });
      setNotes('');
      await load();
    } catch (e) {
      setActionError(getUserFriendlyMessage(e));
    } finally {
      setActionId('');
    }
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('finance.purchaseApprovals')}
        subtitle={t('approvals.managersDesc')}
        dense
        actions={
          capabilities.canViewApprovalsDashboard ? (
            <Link to="/admin/approvals" className="btn btn--ghost btn--sm">
              {t('approvals.allApprovals')}
            </Link>
          ) : null
        }
      />
      <LayoutSection variant="raised">
        <label className="approval-notes-field">
          {t('approvals.notes')}
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('approvals.notesPlaceholder')}
          />
        </label>
        {approveSuccess?.purchase_invoice && (
          <div className="inv-success" role="status">
            {t('approvals.submitted')} {' '}
            <span className="mono">{approveSuccess.purchase_invoice}</span>
            {approveSuccess.purchase_invoice_outstanding != null && (
              <> · {fmtCurrency(approveSuccess.purchase_invoice_outstanding)} {t('approvals.outstanding')}</>
            )}
            .{' '}
            <Link to="/admin/accounting/payments">{t('approvals.recordPayment')}</Link>
          </div>
        )}
        {approveSuccess && !approveSuccess.purchase_invoice && approveSuccess.purchase_invoice_message && (
          <p className="inv-error" role="alert">
            {t('approvals.approvedNoPayable')}: {approveSuccess.purchase_invoice_message}.{' '}
            <Link to="/admin/purchasing/matching">{t('nav.invoiceMatching')}</Link>
          </p>
        )}
        {loading && <PageLoading />}
        {!loading && error && <ApiErrorCard title={t('approvals.couldNotLoad')} message={error} />}
        {!loading && actionError && (
          <ApiErrorCard title={t('approvals.couldNotComplete')} message={actionError} />
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState icon="✓" title={t('approvals.noPendingApprovals')} desc={t('approvals.noPendingApprovalsDesc')} />
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="approval-list">
            {rows.map((doc) => (
              <PurchaseApprovalCard
                key={doc.name}
                doc={doc}
                capabilities={capabilities}
                user={user}
                notes={notes}
                busy={actionId === doc.name}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </div>
        )}
      </LayoutSection>
    </TablePageLayout>
  );
}

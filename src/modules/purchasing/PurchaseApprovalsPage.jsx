import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCurrency } from '../../utils/format';
import { approvalsHubPath } from '../../utils/workspacePaths';
import AccessibleLink from '../../components/auth/AccessibleLink';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { canExecutePurchaseApproval } from '../../auth/capabilities';
import PurchaseApprovalCard from '../../components/approvals/PurchaseApprovalCard';
import RejectPurchaseModal from '../../components/approvals/RejectPurchaseModal';
import {
  approvePurchaseReceipt,
  listPendingPurchaseApprovals,
  rejectPurchaseReceipt,
} from '../../services/purchasingApprovalApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useNotify } from '../../context/NotificationContext';

export default function PurchaseApprovalsPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities, user } = useAuth();
  const canExecutePurchase = canExecutePurchaseApproval(capabilities);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');
  const [actionError, setActionError] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPendingPurchaseApprovals();
      // Defensive sort — backend already orders by creation desc, but this
      // guarantees newest-first even if the response is reordered upstream
      // or comes from a different source.
      const sorted = [...(data || [])].sort((a, b) => {
        const ta = new Date(a.requested_at || a.creation || 0).getTime();
        const tb = new Date(b.requested_at || b.creation || 0).getTime();
        return tb - ta;
      });
      setRows(sorted);
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
    if (!canExecutePurchase) return;
    setActionId(name);
    setActionError('');
    try {
      const result = await approvePurchaseReceipt(name, { notes });
      if (result?.purchase_invoice) {
        notify.success(
          t('approvals.receiptSubmitted', { invoice: result.purchase_invoice })
            + (result.purchase_invoice_outstanding != null
              ? ` · ${t('approvals.outstanding')} ${fmtCurrency(result.purchase_invoice_outstanding)}`
              : ''),
        );
      } else if (result?.purchase_invoice_message) {
        notify.warning(
          t('approvals.receiptApprovedNoPayable', { message: result.purchase_invoice_message }),
        );
      } else {
        notify.success(`Goods receipt ${name} approved.`);
      }
      setNotes('');
      await load();
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setActionError(msg);
      notify.error(msg);
    } finally {
      setActionId('');
    }
  };

  const onReject = (name) => {
    if (!canExecutePurchase) return;
    setRejectTarget(name);
  };

  const onConfirmReject = async (reason) => {
    const name = rejectTarget;
    if (!name) return;
    setActionId(name);
    setActionError('');
    try {
      await rejectPurchaseReceipt(name, { notes: reason });
      notify.info(t('approvals.receiptRejected', { defaultValue: 'Goods receipt {{name}} rejected.', name }));
      setNotes('');
      setRejectTarget(null);
      await load();
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setActionError(msg);
      notify.error(msg);
    } finally {
      setActionId('');
    }
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('purchasing.purchaseApprovals')}
        subtitle={t('purchasing.purchaseApprovalsSubtitle')}
        dense
        actions={
          capabilities.canViewApprovalsDashboard ? (
            <AccessibleLink to={approvalsHubPath(capabilities)} className="btn btn--ghost btn--sm">
              {t('approvals.allApprovals')}
            </AccessibleLink>
          ) : null
        }
      />
      <LayoutSection variant="raised">
        {canExecutePurchase && (
          <label className="approval-notes-field">
            {t('approvals.approvalNotes')}
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('approvals.reasonPlaceholder')}
            />
          </label>
        )}
        {loading && <PageLoading />}
        {!loading && error && <ApiErrorCard title={t('approvals.couldNotLoad')} message={error} />}
        {!loading && actionError && (
          <ApiErrorCard title={t('approvals.couldNotComplete')} message={actionError} />
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState icon="✓" title={t('approvals.noPendingPurchases')} desc={t('approvals.noPendingPurchasesDesc')} />
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
                readOnly={!canExecutePurchase}
                onApprove={canExecutePurchase ? onApprove : undefined}
                onReject={canExecutePurchase ? onReject : undefined}
              />
            ))}
          </div>
        )}
      </LayoutSection>
      <RejectPurchaseModal
        open={!!rejectTarget}
        docName={rejectTarget}
        loading={actionId === rejectTarget && !!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onSubmit={onConfirmReject}
      />
    </TablePageLayout>
  );
}

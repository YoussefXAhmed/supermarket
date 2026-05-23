import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
  StatCard,
} from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import PurchaseApprovalCard from '../../../components/approvals/PurchaseApprovalCard';
import ShiftApprovalCard from '../../../components/approvals/ShiftApprovalCard';
import { useApprovalQueues } from '../hooks/useApprovalQueues';
import {
  approvePurchaseReceipt,
  rejectPurchaseReceipt,
} from '../../../services/purchasingApprovalApi';
import {
  approveShiftClosing,
  rejectShiftClosing,
} from '../../../services/shiftsService';
import ShiftRejectConfirmModal from '../../shifts/components/ShiftRejectConfirmModal';
import ShiftApprovalConfirmModal from '../../shifts/components/ShiftApprovalConfirmModal';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { purchaseApprovalsPath, shiftHistoryPath } from '../../../utils/workspacePaths';

export default function ApprovalsDashboardPage() {
  const { t } = useTranslation();
  const { user, capabilities, canApproveShift } = useAuth();
  const { loading, error, reload, purchases, pendingShifts, rejectedShifts, highVarianceShifts, historyShifts, counts } =
    useApprovalQueues();
  const [notes, setNotes] = useState('');
  const [purchaseBusy, setPurchaseBusy] = useState('');
  const [shiftApprove, setShiftApprove] = useState(null);
  const [shiftReject, setShiftReject] = useState(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [purchaseErr, setPurchaseErr] = useState('');

  const onPurchaseApprove = async (name) => {
    setPurchaseBusy(name);
    setPurchaseErr('');
    try {
      await approvePurchaseReceipt(name, { notes });
      await reload();
    } catch (e) {
      setPurchaseErr(getUserFriendlyMessage(e));
    } finally {
      setPurchaseBusy('');
    }
  };

  const onPurchaseReject = async (name) => {
    if (!window.confirm(t('approvals.rejectPurchaseConfirm', { name }))) return;
    setPurchaseBusy(name);
    try {
      await rejectPurchaseReceipt(name, { notes });
      await reload();
    } catch (e) {
      setPurchaseErr(getUserFriendlyMessage(e));
    } finally {
      setPurchaseBusy('');
    }
  };

  const confirmShiftApprove = async () => {
    if (!shiftApprove) return;
    setShiftBusy(true);
    try {
      await approveShiftClosing({
        closingEntryName: shiftApprove.closingName || shiftApprove.closing?.name,
        approver: user?.email || user?.name,
        opener: shiftApprove.audit?.operator || shiftApprove.cashier,
        canApprove: canApproveShift,
        notes,
      });
      setShiftApprove(null);
      await reload();
    } catch (e) {
      setPurchaseErr(getUserFriendlyMessage(e));
    } finally {
      setShiftBusy(false);
    }
  };

  const confirmShiftReject = async (reason) => {
    if (!shiftReject) return;
    setShiftBusy(true);
    try {
      await rejectShiftClosing({
        closingEntryName: shiftReject.closingName || shiftReject.closing?.name,
        approver: user?.email || user?.name,
        opener: shiftReject.audit?.operator || shiftReject.cashier,
        canApprove: canApproveShift,
        reason,
      });
      setShiftReject(null);
      await reload();
    } catch (e) {
      setPurchaseErr(getUserFriendlyMessage(e));
    } finally {
      setShiftBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title={t('approvals.dashboardTitle')}
        subtitle={t('approvals.dashboardSubtitle')}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={reload}>{t('common.refresh')}</Btn>}
      />

      <section className="layout-grid layout-grid--kpi" aria-label={t('approvals.approvalCounts')}>
        <StatCard label={t('approvals.purchasePending')} value={counts.purchases} icon="🛍️" color="amber" compact />
        <StatCard label={t('approvals.shiftPending')} value={counts.shifts} icon="◷" color="blue" compact />
        <StatCard label={t('finance.highVariance')} value={counts.highVariance} icon="⚠" color="red" compact />
        <StatCard label={t('approvals.rejectedShifts')} value={counts.rejected} icon="✕" color="default" compact />
      </section>

      <LayoutSection variant="flat">
        <label className="approval-notes-field">
          {t('approvals.approvalNotes')}
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('approvals.reasonPlaceholder')} />
        </label>
      </LayoutSection>

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('approvals.couldNotLoad')} message={error} onRetry={reload} />}
      {!loading && purchaseErr && (
        <ApiErrorCard title={t('approvals.couldNotComplete')} message={purchaseErr} />
      )}

      {!loading && !error && (
        <>
          <LayoutSection title={t('approvals.pendingPurchaseApprovals')} variant="raised">
            {purchases.length === 0 ? (
              <EmptyState icon="✓" title={t('approvals.noPendingPurchases')} desc={t('approvals.noPendingPurchasesDesc')} />
            ) : (
              <div className="approval-list">
                {purchases.map((doc) => (
                  <PurchaseApprovalCard
                    key={doc.name}
                    doc={doc}
                    capabilities={capabilities}
                    user={user}
                    notes={notes}
                    busy={purchaseBusy === doc.name}
                    onApprove={onPurchaseApprove}
                    onReject={onPurchaseReject}
                  />
                ))}
              </div>
            )}
            <p className="approval-section-link">
              <Link to={purchaseApprovalsPath(capabilities)}>{t('approvals.openPurchaseApprovals')}</Link>
            </p>
          </LayoutSection>

          <LayoutSection title={t('approvals.pendingShiftClosings')} variant="raised">
            {pendingShifts.length === 0 ? (
              <EmptyState icon="✓" title={t('approvals.noPendingShifts')} desc={t('approvals.noPendingShiftsDesc')} />
            ) : (
              <div className="approval-list">
                {pendingShifts.map((session) => (
                  <ShiftApprovalCard
                    key={session.id || session.closing?.name}
                    session={session}
                    user={user}
                    canApprove={canApproveShift}
                    compact
                    onApprove={setShiftApprove}
                    onReject={setShiftReject}
                  />
                ))}
              </div>
            )}
            <p className="approval-section-link">
              <Link to={shiftHistoryPath(capabilities)}>{t('approvals.openShiftHistory')}</Link>
            </p>
          </LayoutSection>

          {highVarianceShifts.length > 0 && (
            <LayoutSection title={t('approvals.highVarianceAlerts')} variant="raised">
              <div className="approval-list">
                {highVarianceShifts.map((session) => (
                  <ShiftApprovalCard
                    key={`hv-${session.id}`}
                    session={session}
                    user={user}
                    canApprove={canApproveShift}
                    compact
                    onApprove={setShiftApprove}
                    onReject={setShiftReject}
                  />
                ))}
              </div>
            </LayoutSection>
          )}

          {rejectedShifts.length > 0 && (
            <LayoutSection title={t('approvals.rejectedOperations')} variant="raised">
              <div className="approval-list">
                {rejectedShifts.map((session) => (
                  <ShiftApprovalCard key={`rej-${session.id}`} session={session} user={user} canApprove={false} compact />
                ))}
              </div>
            </LayoutSection>
          )}

          <LayoutSection title={t('approvals.recentHistory')} variant="flat">
            {historyShifts.length === 0 ? (
              <p className="page-header__sub">{t('approvals.noRecentShifts')}</p>
            ) : (
              <ul className="approval-history-list">
                {historyShifts.map((s) => (
                  <li key={s.id}>
                    <strong>{s.cashier}</strong> — {t('approvals.submitted')}
                    {s.audit?.approved_by && <span> · {t('approvals.approvedBy')} {s.audit.approved_by}</span>}
                  </li>
                ))}
              </ul>
            )}
          </LayoutSection>
        </>
      )}

      <ShiftApprovalConfirmModal
        session={shiftApprove}
        loading={shiftBusy}
        onConfirm={confirmShiftApprove}
        onCancel={() => setShiftApprove(null)}
      />
      <ShiftRejectConfirmModal
        session={shiftReject}
        loading={shiftBusy}
        onConfirm={confirmShiftReject}
        onCancel={() => setShiftReject(null)}
      />
    </DashboardLayout>
  );
}

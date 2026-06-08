import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import {
  ApiErrorCard,
  BatchResultToast,
  Btn,
  BulkActionBar,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PageLoading,
  StatCard,
} from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { useNotify } from '../../../context/NotificationContext';
import { useSelection } from '../../../hooks/useSelection';
import {
  canExecutePurchaseApproval,
  canExecuteShiftClosingApproval,
} from '../../../auth/capabilities';
import PurchaseApprovalCard from '../../../components/approvals/PurchaseApprovalCard';
import RejectPurchaseModal from '../../../components/approvals/RejectPurchaseModal';
import ShiftApprovalCard from '../../../components/approvals/ShiftApprovalCard';
import PurchaseHistoryInline from '../../../components/approvals/PurchaseHistoryInline';
import { useApprovalQueues } from '../hooks/useApprovalQueues';
import {
  approvePurchaseReceipt,
  rejectPurchaseReceipt,
  batchApprovePurchaseReceipts,
  batchRejectPurchaseReceipts,
} from '../../../services/purchasingApprovalApi';
import {
  approveShiftClosing,
  rejectShiftClosing,
} from '../../../services/shiftsService';
import ShiftRejectConfirmModal from '../../shifts/components/ShiftRejectConfirmModal';
import ShiftApprovalConfirmModal from '../../shifts/components/ShiftApprovalConfirmModal';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { resolveShiftApprovalError } from '../../../utils/shiftApprovalErrors';
import { purchaseApprovalsPath, shiftHistoryPath } from '../../../utils/workspacePaths';

/** @param {string} pathname */
function resolveApprovalsWorkspace(pathname) {
  if (pathname.startsWith('/manager/approvals')) return 'manager';
  if (pathname.startsWith('/finance/approvals')) return 'finance';
  return 'admin';
}

export default function ApprovalsDashboardPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user, capabilities } = useAuth();
  const notify = useNotify();
  const workspace = resolveApprovalsWorkspace(pathname);
  const canExecuteShiftApproval = canExecuteShiftClosingApproval(capabilities);
  const canExecutePurchase = canExecutePurchaseApproval(capabilities);

  const showPurchaseSection = workspace === 'manager' || workspace === 'admin';
  const showShiftSection = workspace === 'finance' || workspace === 'admin';

  const { loading, error, reload, purchases, pendingShifts, rejectedShifts, highVarianceShifts, historyShifts, counts } =
    useApprovalQueues();
  const [notes, setNotes] = useState('');
  const [purchaseBusy, setPurchaseBusy] = useState('');
  const [purchaseRejectTarget, setPurchaseRejectTarget] = useState(null);
  const [shiftApprove, setShiftApprove] = useState(null);
  const [shiftReject, setShiftReject] = useState(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [purchaseErr, setPurchaseErr] = useState('');
  // Phase 4.b — batch selection state for purchase approvals.
  // Identity-stable across queue refetches via the receipt name.
  const purchaseSelection = useSelection({
    items: purchases,
    getId: (doc) => doc?.name,
  });
  const [batchInFlight, setBatchInFlight] = useState(false);
  const [batchApproveConfirm, setBatchApproveConfirm] = useState(false);
  const [batchRejectConfirm, setBatchRejectConfirm] = useState(false);

  const kpiCards = useMemo(() => {
    if (workspace === 'manager') {
      return [
        { key: 'purchases', label: t('approvals.purchasePending'), value: counts.purchases, icon: '🛍️', color: 'amber' },
      ];
    }
    if (workspace === 'finance') {
      return [
        { key: 'shifts', label: t('approvals.shiftPending'), value: counts.shifts, icon: '◷', color: 'blue' },
        { key: 'variance', label: t('finance.highVariance'), value: counts.highVariance, icon: '⚠', color: 'red' },
        { key: 'rejected', label: t('approvals.rejectedShifts'), value: counts.rejected, icon: '✕', color: 'default' },
      ];
    }
    return [
      { key: 'purchases', label: t('approvals.purchasePending'), value: counts.purchases, icon: '🛍️', color: 'amber' },
      { key: 'shifts', label: t('approvals.shiftPending'), value: counts.shifts, icon: '◷', color: 'blue' },
      { key: 'variance', label: t('finance.highVariance'), value: counts.highVariance, icon: '⚠', color: 'red' },
      { key: 'rejected', label: t('approvals.rejectedShifts'), value: counts.rejected, icon: '✕', color: 'default' },
    ];
  }, [workspace, counts, t]);

  const onPurchaseApprove = async (name) => {
    if (!canExecutePurchase) return;
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

  const onPurchaseReject = (name) => {
    if (!canExecutePurchase) return;
    setPurchaseRejectTarget(name);
  };

  const onConfirmPurchaseReject = async (reason) => {
    const name = purchaseRejectTarget;
    if (!name) return;
    setPurchaseBusy(name);
    setPurchaseErr('');
    try {
      await rejectPurchaseReceipt(name, { notes: reason });
      notify.info(t('approvals.receiptRejected', { defaultValue: 'Goods receipt {{name}} rejected.', name }));
      setPurchaseRejectTarget(null);
      await reload();
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setPurchaseErr(msg);
      notify.error(msg);
    } finally {
      setPurchaseBusy('');
    }
  };

  // ── Phase 4.b — batch handlers (purchase approvals) ──────────────────
  //
  // Both flows share the same shape:
  //   1. Snapshot the selected IDs (so we can render the result toast
  //      and the audit log even after reload() clears the queue).
  //   2. Call the batch endpoint with current selection + notes.
  //   3. Surface result via BatchResultToast — success toast if all
  //      rows succeeded, warning toast (still informational) if some
  //      failed. The toast lists per-row errors expanding on demand.
  //   4. Clear selection + reload queue. Failed rows reappear in the
  //      queue (the backend left them untouched), so the user can
  //      retry them individually after fixing the underlying issue.
  //
  // We deliberately DO NOT do optimistic UI here because approval has
  // financial side-effects (Purchase Invoice auto-creation). Wait for
  // server confirmation — the brief spinner is acceptable cost.

  const reportBatchResult = (result, isApprove) => {
    if (!result) return;
    const errors = (result.results || [])
      .filter((r) => !r.ok)
      .map((r) => ({ id: r.name, message: r.error || t('common.unknownError', { defaultValue: 'Unknown error' }) }));
    const headline = isApprove
      ? t('approvals.batchApproveHeadline', {
          defaultValue: '{{succeeded}} of {{total}} approved',
          succeeded: result.succeeded,
          total: result.total,
        })
      : t('approvals.batchRejectHeadline', {
          defaultValue: '{{succeeded}} of {{total}} rejected',
          succeeded: result.succeeded,
          total: result.total,
        });
    const toast = (
      <BatchResultToast
        total={result.total}
        succeeded={result.succeeded}
        failed={result.failed}
        errors={errors}
        headline={headline}
        initiallyOpen={result.failed > 0 && result.failed <= 3}
      />
    );
    if (result.failed > 0) {
      notify.warning(toast, { duration: 9000 });
    } else {
      notify.success(toast, { duration: 5000 });
    }
  };

  const onBatchApprove = async () => {
    setBatchApproveConfirm(false);
    const ids = purchaseSelection.selectedIds;
    if (!ids.length || batchInFlight) return;
    setBatchInFlight(true);
    setPurchaseErr('');
    try {
      const result = await batchApprovePurchaseReceipts(ids, { notes });
      reportBatchResult(result, true);
      purchaseSelection.clear();
      await reload();
    } catch (e) {
      // Envelope-level failure (size cap, list shape, role gate) — no
      // per-row results. Surface a single error toast and leave the
      // selection intact so the user can adjust and retry.
      const msg = getUserFriendlyMessage(e);
      setPurchaseErr(msg);
      notify.error(msg);
    } finally {
      setBatchInFlight(false);
    }
  };

  const onBatchReject = async (reason) => {
    setBatchRejectConfirm(false);
    const ids = purchaseSelection.selectedIds;
    if (!ids.length || batchInFlight) return;
    // The notes field on the page is the canonical reason; the modal
    // doesn't capture a separate one so the policy lives in one place.
    const noteText = (reason ?? notes ?? '').trim();
    if (!noteText) {
      const msg = t('approvals.rejectReasonRequired', {
        defaultValue: 'Enter a rejection reason in the Approval notes field above.',
      });
      setPurchaseErr(msg);
      notify.warning(msg);
      return;
    }
    setBatchInFlight(true);
    setPurchaseErr('');
    try {
      const result = await batchRejectPurchaseReceipts(ids, { notes: noteText });
      reportBatchResult(result, false);
      purchaseSelection.clear();
      await reload();
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setPurchaseErr(msg);
      notify.error(msg);
    } finally {
      setBatchInFlight(false);
    }
  };

  const confirmShiftApprove = async () => {
    if (!shiftApprove || !canExecuteShiftApproval) return;
    setShiftBusy(true);
    setPurchaseErr('');
    try {
      await approveShiftClosing({
        closingEntryName: shiftApprove.closingName || shiftApprove.closing?.name,
        approver: user?.email || user?.name,
        opener: shiftApprove.audit?.operator || shiftApprove.cashier,
        canApprove: canExecuteShiftApproval,
        notes,
      });
      setShiftApprove(null);
      await reload();
    } catch (e) {
      setShiftApprove(null);
      setShiftReject(null);
      notify.error(resolveShiftApprovalError(e));
    } finally {
      setShiftBusy(false);
    }
  };

  const confirmShiftReject = async (reason) => {
    if (!shiftReject || !canExecuteShiftApproval) return;
    setShiftBusy(true);
    setPurchaseErr('');
    try {
      await rejectShiftClosing({
        closingEntryName: shiftReject.closingName || shiftReject.closing?.name,
        approver: user?.email || user?.name,
        opener: shiftReject.audit?.operator || shiftReject.cashier,
        canApprove: canExecuteShiftApproval,
        reason,
      });
      setShiftReject(null);
      await reload();
    } catch (e) {
      setShiftApprove(null);
      setShiftReject(null);
      notify.error(resolveShiftApprovalError(e));
    } finally {
      setShiftBusy(false);
    }
  };

  const showActionNotes = (showPurchaseSection && canExecutePurchase)
    || (showShiftSection && canExecuteShiftApproval);

  const historyHref = workspace === 'admin' ? '/admin/approvals/history' : '/manager/approvals/history';
  const showHistoryLink = (workspace === 'manager' || workspace === 'admin')
    && Boolean(capabilities?.canViewPurchaseApprovals || capabilities?.canManageSystem);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('approvals.dashboardTitle')}
        subtitle={t('approvals.dashboardSubtitle')}
        dense
        actions={(
          <Btn variant="ghost" size="sm" onClick={reload}>{t('common.refresh')}</Btn>
        )}
      />

      <section className="layout-grid layout-grid--kpi" aria-label={t('approvals.approvalCounts')}>
        {kpiCards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={card.value}
            icon={card.icon}
            color={card.color}
            compact
          />
        ))}
      </section>

      {showActionNotes && (
        <LayoutSection variant="flat">
          <label className="approval-notes-field">
            {t('approvals.approvalNotes')}
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('approvals.reasonPlaceholder')} />
          </label>
        </LayoutSection>
      )}

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('approvals.couldNotLoad')} message={error} onRetry={reload} />}
      {!loading && purchaseErr && (
        <ApiErrorCard title={t('approvals.couldNotComplete')} message={purchaseErr} />
      )}

      {!loading && !error && (
        <>
          {showPurchaseSection && (
            <LayoutSection title={t('approvals.pendingPurchaseApprovals')} variant="raised">
              {purchases.length === 0 ? (
                <EmptyState icon="✓" title={t('approvals.noPendingPurchases')} desc={t('approvals.noPendingPurchasesDesc')} />
              ) : (
                <>
                  {canExecutePurchase && purchases.length > 1 && (
                    <div className="approval-list__select-all">
                      <label className="approval-list__select-all-label">
                        <input
                          type="checkbox"
                          className="row-checkbox"
                          checked={purchaseSelection.allSelected}
                          ref={(el) => { if (el) el.indeterminate = purchaseSelection.someSelected; }}
                          onChange={purchaseSelection.toggleAll}
                          aria-label={t('approvals.selectAllReceipts', { defaultValue: 'Select all pending receipts' })}
                        />
                        <span>
                          {purchaseSelection.allSelected
                            ? t('approvals.deselectAll', { defaultValue: 'Deselect all' })
                            : t('approvals.selectAll', { defaultValue: 'Select all' })}
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="approval-list">
                    {purchases.map((doc) => (
                      <PurchaseApprovalCard
                        key={doc.name}
                        doc={doc}
                        capabilities={capabilities}
                        user={user}
                        notes={notes}
                        busy={purchaseBusy === doc.name || batchInFlight}
                        readOnly={!canExecutePurchase}
                        onApprove={canExecutePurchase ? onPurchaseApprove : undefined}
                        onReject={canExecutePurchase ? onPurchaseReject : undefined}
                        selectable={canExecutePurchase}
                        selected={purchaseSelection.isSelected(doc.name)}
                        onToggleSelect={purchaseSelection.toggle}
                        selectionDisabled={batchInFlight}
                      />
                    ))}
                  </div>
                </>
              )}
              <p className="approval-section-link">
                <Link to={purchaseApprovalsPath(capabilities)}>{t('approvals.openPurchaseApprovals')}</Link>
              </p>
            </LayoutSection>
          )}

          {/* Inline purchase approval history — same page, just below.
              Gated on `canViewPurchaseApprovals` so it doesn't surface
              for users who shouldn't see decided receipts. */}
          {showPurchaseSection && showHistoryLink && (
            <PurchaseHistoryInline historyHref={historyHref} limit={10} />
          )}

          {showShiftSection && (
            <>
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
                        canApprove={canExecuteShiftApproval}
                        compact
                        onApprove={canExecuteShiftApproval ? setShiftApprove : undefined}
                        onReject={canExecuteShiftApproval ? setShiftReject : undefined}
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
                        canApprove={canExecuteShiftApproval}
                        compact
                        onApprove={canExecuteShiftApproval ? setShiftApprove : undefined}
                        onReject={canExecuteShiftApproval ? setShiftReject : undefined}
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
        </>
      )}

      {canExecuteShiftApproval && (
        <>
          <ShiftApprovalConfirmModal
            session={shiftApprove}
            loading={shiftBusy}
            onConfirm={confirmShiftApprove}
            onCancel={() => !shiftBusy && setShiftApprove(null)}
          />
          <ShiftRejectConfirmModal
            session={shiftReject}
            loading={shiftBusy}
            onConfirm={confirmShiftReject}
            onCancel={() => !shiftBusy && setShiftReject(null)}
          />
        </>
      )}
      {canExecutePurchase && (
        <RejectPurchaseModal
          open={!!purchaseRejectTarget}
          docName={purchaseRejectTarget}
          loading={purchaseBusy === purchaseRejectTarget && !!purchaseRejectTarget}
          onCancel={() => setPurchaseRejectTarget(null)}
          onSubmit={onConfirmPurchaseReject}
        />
      )}

      {/* Phase 4.b — sticky-bottom batch actions. Renders only when at
          least one receipt is selected; pure CSS collapse otherwise. */}
      {canExecutePurchase && showPurchaseSection && (
        <BulkActionBar
          selectedCount={purchaseSelection.count}
          onClear={purchaseSelection.clear}
          countLabel={t('approvals.batchSelected', {
            defaultValue: '{{count}} receipts selected',
            count: purchaseSelection.count,
          })}
        >
          <Btn
            variant="success"
            size="sm"
            loading={batchInFlight}
            disabled={batchInFlight}
            onClick={() => setBatchApproveConfirm(true)}
          >
            {t('approvals.batchApprove', {
              defaultValue: 'Approve {{count}}',
              count: purchaseSelection.count,
            })}
          </Btn>
          <Btn
            variant="danger"
            size="sm"
            loading={batchInFlight}
            disabled={batchInFlight}
            onClick={() => setBatchRejectConfirm(true)}
          >
            {t('approvals.batchReject', {
              defaultValue: 'Reject {{count}}',
              count: purchaseSelection.count,
            })}
          </Btn>
        </BulkActionBar>
      )}

      <ConfirmDialog
        open={batchApproveConfirm}
        title={t('approvals.batchApproveConfirmTitle', {
          defaultValue: 'Approve {{count}} purchase receipts?',
          count: purchaseSelection.count,
        })}
        message={t('approvals.batchApproveConfirmMsg', {
          defaultValue:
            'Each receipt will be submitted and a Purchase Invoice will be auto-created. Rows you are not authorised to approve will fail individually — the rest will proceed.',
        })}
        confirmLabel={t('approvals.batchApproveConfirmBtn', {
          defaultValue: 'Approve {{count}}',
          count: purchaseSelection.count,
        })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        variant="primary"
        loading={batchInFlight}
        onConfirm={onBatchApprove}
        onCancel={() => setBatchApproveConfirm(false)}
      />

      <ConfirmDialog
        open={batchRejectConfirm}
        title={t('approvals.batchRejectConfirmTitle', {
          defaultValue: 'Reject {{count}} purchase receipts?',
          count: purchaseSelection.count,
        })}
        message={t('approvals.batchRejectConfirmMsg', {
          defaultValue:
            'The reason from the Approval notes field above will be applied to every selected receipt. Rejected receipts can be re-submitted from the source documents.',
        })}
        confirmLabel={t('approvals.batchRejectConfirmBtn', {
          defaultValue: 'Reject {{count}}',
          count: purchaseSelection.count,
        })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        variant="danger"
        loading={batchInFlight}
        onConfirm={() => onBatchReject(notes)}
        onCancel={() => setBatchRejectConfirm(false)}
      />
    </DashboardLayout>
  );
}

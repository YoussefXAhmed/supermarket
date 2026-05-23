import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
  StatCard,
} from '../../../components/ui';
import { TablePageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { useNotify } from '../../../context/NotificationContext';
import { canExecuteShiftClosingApproval } from '../../../auth/capabilities';
import {
  listShiftSessions,
  approveShiftClosing,
  rejectShiftClosing,
} from '../../../services/shiftsService';
import { resolveShiftApprovalError } from '../../../utils/shiftApprovalErrors';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { fmtCurrency } from '../../../utils/format';
import {
  collectFilterOptions,
  computeShiftHistoryKpis,
  filterShiftSessions,
  isAwaitingSubmission,
} from '../../../utils/shiftSessions';
import { canAccessShiftHistory, isOwnShiftHistoryOnly } from '../../../auth/navigationConfig';
import ShiftHistoryFilters from '../components/ShiftHistoryFilters';
import ShiftSessionCard from '../components/ShiftSessionCard';
import ShiftSessionDetailDrawer from '../components/ShiftSessionDetailDrawer';
import ShiftApprovalConfirmModal from '../components/ShiftApprovalConfirmModal';
import ShiftRejectConfirmModal from '../components/ShiftRejectConfirmModal';

const DEFAULT_FILTERS = { cashier: '', register: '', status: 'all', date: '' };

export default function ShiftHistoryPage() {
  const { user, capabilities, canViewShiftReports } = useAuth();
  const notify = useNotify();
  const canExecuteShiftApproval = canExecuteShiftClosingApproval(capabilities);
  const ownOnly = isOwnShiftHistoryOnly(capabilities);
  const canView = canAccessShiftHistory(capabilities);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [detailSession, setDetailSession] = useState(null);
  const [approveSession, setApproveSession] = useState(null);
  const [rejectSession, setRejectSession] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listShiftSessions({
        user: ownOnly || !canViewShiftReports ? user?.name : undefined,
        limit: 100,
      });
      setSessions(rows);
    } catch (e) {
      setSessions([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [ownOnly, canViewShiftReports, user?.name]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const filterOptions = useMemo(() => collectFilterOptions(sessions), [sessions]);
  const filtered = useMemo(
    () => filterShiftSessions(sessions, filters),
    [sessions, filters],
  );
  const kpis = useMemo(() => computeShiftHistoryKpis(sessions), [sessions]);
  const pendingSessions = useMemo(
    () => filtered.filter((s) => isAwaitingSubmission(s)),
    [filtered],
  );
  const historySessions = useMemo(
    () => filtered.filter((s) => !isAwaitingSubmission(s)),
    [filtered],
  );

  const cardProps = {
    user,
    canApprove: canExecuteShiftApproval,
    onSelect: setDetailSession,
    onApprove: canExecuteShiftApproval ? setApproveSession : undefined,
    onReject: canExecuteShiftApproval ? setRejectSession : undefined,
  };

  const runApprove = async () => {
    if (!approveSession?.closingName || !canExecuteShiftApproval || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      await approveShiftClosing({
        closingEntryName: approveSession.closingName,
        approver: user?.email || user?.name,
        opener: approveSession.audit?.operator || approveSession.cashier,
        canApprove: canExecuteShiftApproval,
        notes: approveSession.audit?.notes,
      });
      setApproveSession(null);
      setDetailSession(null);
      await load();
    } catch (e) {
      setApproveSession(null);
      setRejectSession(null);
      notify.error(resolveShiftApprovalError(e));
    } finally {
      setActionLoading(false);
    }
  };

  const runReject = async (reason) => {
    if (!rejectSession?.closingName || !canExecuteShiftApproval || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      await rejectShiftClosing({
        closingEntryName: rejectSession.closingName,
        approver: user?.email || user?.name,
        opener: rejectSession.audit?.operator || rejectSession.cashier,
        canApprove: canExecuteShiftApproval,
        reason,
      });
      setRejectSession(null);
      setDetailSession(null);
      await load();
    } catch (e) {
      setApproveSession(null);
      setRejectSession(null);
      notify.error(resolveShiftApprovalError(e));
    } finally {
      setActionLoading(false);
    }
  };

  if (!canView) {
    return (
      <TablePageLayout>
        <PageHeader title="Shift history" subtitle="Access denied" dense />
        <ApiErrorCard message="You do not have permission to view shift history." />
      </TablePageLayout>
    );
  }

  return (
    <TablePageLayout className="page-layout--list-page shift-history-page">
      <PageHeader
        title={ownOnly ? 'My shifts' : 'Shift history'}
        subtitle={
          ownOnly
            ? 'Your shift sessions from POS Opening & Closing entries'
            : 'Shift sessions · POS Opening & Closing entries from ERPNext'
        }
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Btn>
        }
      />

      {!ownOnly && (
        <div className="kpi-grid shift-history-kpis">
          <StatCard label="Open shifts" value={kpis.openShifts} icon="◷" color="blue" compact />
          <StatCard
            label="Pending approvals"
            value={kpis.pendingApprovals}
            icon="⏳"
            color="amber"
            compact
          />
          <StatCard
            label="Sales today"
            value={fmtCurrency(kpis.totalSalesToday)}
            icon="💰"
            color="accent"
            compact
          />
          <StatCard
            label="Variance today"
            value={fmtCurrency(kpis.totalVariance)}
            icon="⚖"
            color="red"
            compact
          />
        </div>
      )}

      {!ownOnly && (
        <ShiftHistoryFilters
          filters={filters}
          onChange={setFilters}
          cashiers={filterOptions.cashiers}
          registers={filterOptions.registers}
        />
      )}

      {error && !loading && <ApiErrorCard message={error} onRetry={load} />}

      {loading ? (
        <PageLoading size={26} />
      ) : (
        <>
          {!ownOnly && pendingSessions.length > 0 && (
            <LayoutSection
              variant="raised"
              title="Pending approval"
              subtitle={
                canExecuteShiftApproval
                  ? 'Draft closings awaiting accountant submit in ERPNext'
                  : 'Draft closings awaiting accountant review'
              }
            >
              <div className="shift-session-list">
                {pendingSessions.map((session) => (
                  <ShiftSessionCard key={session.id} session={session} {...cardProps} />
                ))}
              </div>
            </LayoutSection>
          )}

          <LayoutSection
            variant="raised"
            title={ownOnly ? 'My shift sessions' : 'All shift sessions'}
            subtitle={`${historySessions.length} session${historySessions.length === 1 ? '' : 's'}`}
            flushHead
          >
            {historySessions.length === 0 ? (
              <EmptyState
                icon="◷"
                title={ownOnly ? 'No shifts yet' : 'No shift sessions'}
                desc={
                  ownOnly
                    ? 'Your shifts appear here after you open and close a register'
                    : filters.status !== 'all' || filters.cashier || filters.register || filters.date
                      ? 'Try adjusting filters'
                      : 'Shifts appear here after cashiers open and close registers in ERP'
                }
              />
            ) : (
              <div className="shift-session-list">
                {historySessions.map((session) => (
                  <ShiftSessionCard key={session.id} session={session} {...cardProps} />
                ))}
              </div>
            )}
          </LayoutSection>
        </>
      )}

      <ShiftSessionDetailDrawer
        session={detailSession}
        user={user}
        onClose={() => setDetailSession(null)}
        canApprove={canExecuteShiftApproval}
        onApprove={
          canExecuteShiftApproval
            ? (s) => {
              setDetailSession(null);
              setApproveSession(s);
            }
            : undefined
        }
        onReject={
          canExecuteShiftApproval
            ? (s) => {
              setDetailSession(null);
              setRejectSession(s);
            }
            : undefined
        }
      />

      {canExecuteShiftApproval && (
        <>
          <ShiftApprovalConfirmModal
            session={approveSession}
            loading={actionLoading}
            onConfirm={runApprove}
            onCancel={() => !actionLoading && setApproveSession(null)}
          />

          <ShiftRejectConfirmModal
            session={rejectSession}
            loading={actionLoading}
            onConfirm={runReject}
            onCancel={() => !actionLoading && setRejectSession(null)}
          />
        </>
      )}
    </TablePageLayout>
  );
}

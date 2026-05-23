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
import {
  listShiftSessions,
  approveShiftClosing,
  rejectShiftClosing,
} from '../../../services/shiftsService';
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
  const { user, capabilities, canViewShiftReports, canApproveShift } = useAuth();
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
    canApprove: canApproveShift,
    onSelect: setDetailSession,
    onApprove: canApproveShift ? setApproveSession : undefined,
    onReject: canApproveShift ? setRejectSession : undefined,
  };

  const runApprove = async () => {
    if (!approveSession?.closingName || !canApproveShift || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      await approveShiftClosing({
        closingEntryName: approveSession.closingName,
        approver: user?.email || user?.name,
        opener: approveSession.audit?.operator || approveSession.cashier,
        canApprove: canApproveShift,
        notes: approveSession.audit?.notes,
      });
      setApproveSession(null);
      setDetailSession(null);
      await load();
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setActionLoading(false);
    }
  };

  const runReject = async (reason) => {
    if (!rejectSession?.closingName || !canApproveShift || actionLoading) return;
    setActionLoading(true);
    setError('');
    try {
      await rejectShiftClosing({
        closingEntryName: rejectSession.closingName,
        approver: user?.email || user?.name,
        opener: rejectSession.audit?.operator || rejectSession.cashier,
        canApprove: canApproveShift,
        reason,
      });
      setRejectSession(null);
      setDetailSession(null);
      await load();
    } catch (e) {
      setError(getUserFriendlyMessage(e));
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
          {canApproveShift && !ownOnly && pendingSessions.length > 0 && (
            <LayoutSection
              variant="raised"
              title="Pending approval"
              subtitle="Draft closings awaiting manager submit in ERPNext"
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
        canApprove={canApproveShift}
        onApprove={(s) => {
          setDetailSession(null);
          setApproveSession(s);
        }}
        onReject={(s) => {
          setDetailSession(null);
          setRejectSession(s);
        }}
      />

      <ShiftApprovalConfirmModal
        session={approveSession}
        loading={actionLoading}
        onConfirm={runApprove}
        onCancel={() => setApproveSession(null)}
      />

      <ShiftRejectConfirmModal
        session={rejectSession}
        loading={actionLoading}
        onConfirm={runReject}
        onCancel={() => setRejectSession(null)}
      />
    </TablePageLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import ShiftHistoryFilters from '../components/ShiftHistoryFilters';
import ShiftSessionCard from '../components/ShiftSessionCard';
import ShiftSessionDetailDrawer from '../components/ShiftSessionDetailDrawer';
import ShiftApprovalConfirmModal from '../components/ShiftApprovalConfirmModal';
import ShiftRejectConfirmModal from '../components/ShiftRejectConfirmModal';

const DEFAULT_FILTERS = { cashier: '', register: '', status: 'all', date: '' };

export default function ShiftHistoryPage() {
  const { t } = useTranslation();
  const { user, canViewShiftReports, canApproveShift } = useAuth();
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
        user: canViewShiftReports ? undefined : user?.name,
        limit: 100,
      });
      setSessions(rows);
    } catch (e) {
      setSessions([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [canViewShiftReports, user?.name]);

  useEffect(() => {
    if (canViewShiftReports) load();
  }, [canViewShiftReports, load]);

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

  if (!canViewShiftReports) {
    return (
      <TablePageLayout>
        <PageHeader title={t('nav.history')} subtitle={t('shifts.accessDenied')} dense />
        <ApiErrorCard message={t('shifts.historyPermission')} />
      </TablePageLayout>
    );
  }

  return (
    <TablePageLayout className="page-layout--list-page shift-history-page">
      <PageHeader
        title={t('nav.history')}
        subtitle={t('shifts.historySubtitle')}
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
            {t('common.refresh')}
          </Btn>
        }
      />

      <div className="kpi-grid shift-history-kpis">
        <StatCard label={t('shifts.openShifts')} value={kpis.openShifts} icon="◷" color="blue" compact />
        <StatCard
          label={t('shifts.pendingApprovals')}
          value={kpis.pendingApprovals}
          icon="⏳"
          color="amber"
          compact
        />
        <StatCard
          label={t('shifts.salesToday')}
          value={fmtCurrency(kpis.totalSalesToday)}
          icon="💰"
          color="accent"
          compact
        />
        <StatCard
          label={t('shifts.varianceToday')}
          value={fmtCurrency(kpis.totalVariance)}
          icon="⚖"
          color="red"
          compact
        />
      </div>

      <ShiftHistoryFilters
        filters={filters}
        onChange={setFilters}
        cashiers={filterOptions.cashiers}
        registers={filterOptions.registers}
      />

      {error && !loading && <ApiErrorCard message={error} onRetry={load} />}

      {loading ? (
        <PageLoading size={26} />
      ) : (
        <>
          {canApproveShift && pendingSessions.length > 0 && (
            <LayoutSection
              variant="raised"
              title={t('shifts.pendingApprovalSection')}
              subtitle={t('shifts.pendingApprovalDesc')}
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
            title={t('shifts.allSessions')}
            subtitle={`${historySessions.length} session${historySessions.length === 1 ? '' : 's'}`}
            flushHead
          >
            {historySessions.length === 0 ? (
              <EmptyState
                icon="◷"
                title={t('shifts.noSessions')}
                desc={
                  filters.status !== 'all' || filters.cashier || filters.register || filters.date
                    ? t('shifts.tryFilters')
                    : t('shifts.shiftsAppearHere')
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

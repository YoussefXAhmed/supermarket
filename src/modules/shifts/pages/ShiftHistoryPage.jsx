import { useCallback, useEffect, useState } from 'react';
import { ApiErrorCard, Btn, PageHeader, PageLoading } from '../../../components/ui';
import { TablePageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import {
  listShiftHistory,
  getPendingShiftClosings,
  approveShiftClosing,
} from '../../../services/shiftsService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import ShiftActivityTable from '../components/ShiftActivityTable';

export default function ShiftHistoryPage() {
  const { user, canViewShiftReports, canApproveShift } = useAuth();
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [history, pend] = await Promise.all([
        listShiftHistory({
          user: canViewShiftReports ? undefined : user?.name,
          limit: 80,
          includeAudit: true,
        }),
        canApproveShift ? getPendingShiftClosings() : Promise.resolve([]),
      ]);
      setRows(history);
      setPending(pend);
    } catch (e) {
      setRows([]);
      setPending([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [canViewShiftReports, canApproveShift, user?.name]);

  useEffect(() => {
    if (canViewShiftReports) load();
  }, [canViewShiftReports, load]);

  const onApprove = async (closingName, opener) => {
    if (!canApproveShift || approving) return;
    setApproving(closingName);
    setError('');
    try {
      await approveShiftClosing({
        closingEntryName: closingName,
        approver: user?.email || user?.name,
        opener,
        canApprove: canApproveShift,
      });
      await load();
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setApproving('');
    }
  };

  if (!canViewShiftReports) {
    return (
      <TablePageLayout>
        <PageHeader title="Shift history" subtitle="Access denied" dense />
        <ApiErrorCard message="You do not have permission to view shift reports." />
      </TablePageLayout>
    );
  }

  return (
    <TablePageLayout className="page-layout--list-page">
      <PageHeader
        title="Shift history"
        subtitle="POS Opening/Closing entries and variances"
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load}>
            Refresh
          </Btn>
        }
      />

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <>
          {canApproveShift && pending.length > 0 && (
            <LayoutSection variant="raised" title="Pending approval" subtitle="Variance exceptions">
              <ul className="shift-pending-list">
                {pending.map((row) => (
                  <li key={row.name} className="shift-pending-list__item">
                    <span className="mono">{row.name}</span>
                    <span>
                      Variance EGP {Number(row.variance).toFixed(2)} · {row.audit?.operator || row.owner}
                    </span>
                    <Btn
                      size="sm"
                      variant="primary"
                      loading={approving === row.name}
                      onClick={() => onApprove(row.name, row.audit?.operator || row.owner)}
                    >
                      Approve & submit
                    </Btn>
                  </li>
                ))}
              </ul>
            </LayoutSection>
          )}

          <LayoutSection variant="raised" title="All shifts" flushHead>
            <ShiftActivityTable rows={rows} />
          </LayoutSection>
        </>
      )}
    </TablePageLayout>
  );
}

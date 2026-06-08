import { useCallback, useEffect, useMemo, useState } from 'react';
import { listPendingPurchaseApprovals } from '../../../services/purchasingApprovalApi';
import { listShiftSessions } from '../../../services/shiftsService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import {
  isAwaitingSubmission,
  buildApprovalTimeline,
} from '../../../utils/shiftSessions';
import { ApprovalStatus, shiftSessionApprovalStatus } from '../../../utils/approvalStatuses';

export function useApprovalQueues({ enabled = true } = {}) {
  const [purchases, setPurchases] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const [purchaseRows, shiftRows] = await Promise.all([
        listPendingPurchaseApprovals().catch(() => []),
        listShiftSessions({ limit: 80 }).catch(() => []),
      ]);
      // Sort newest-first by requested_at / creation. Backend already orders
      // this way but the safety net keeps the UI stable if a row arrives
      // without a sort key or from a stale cache.
      const sortedPurchases = [...(purchaseRows || [])].sort((a, b) => {
        const ta = new Date(a.requested_at || a.creation || 0).getTime();
        const tb = new Date(b.requested_at || b.creation || 0).getTime();
        return tb - ta;
      });
      setPurchases(sortedPurchases);
      setShifts(shiftRows || []);
    } catch (e) {
      setPurchases([]);
      setShifts([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingShifts = useMemo(
    () => shifts.filter((s) => isAwaitingSubmission(s)),
    [shifts],
  );

  const rejectedShifts = useMemo(
    () => shifts.filter((s) => shiftSessionApprovalStatus(s) === ApprovalStatus.REJECTED),
    [shifts],
  );

  const highVarianceShifts = useMemo(
    () =>
      shifts.filter(
        (s) =>
          isAwaitingSubmission(s) &&
          (s.varianceSeverity === 'approval_required' || Math.abs(s.variance || 0) > 50),
      ),
    [shifts],
  );

  const historyShifts = useMemo(
    () =>
      shifts
        .filter((s) => shiftSessionApprovalStatus(s) === ApprovalStatus.SUBMITTED)
        .slice(0, 12),
    [shifts],
  );

  const enrichShift = useCallback(
    (session) => ({
      ...session,
      timeline: buildApprovalTimeline(session),
      status: shiftSessionApprovalStatus(session),
    }),
    [],
  );

  return {
    loading,
    error,
    reload: load,
    purchases,
    pendingShifts: pendingShifts.map(enrichShift),
    rejectedShifts: rejectedShifts.map(enrichShift),
    highVarianceShifts: highVarianceShifts.map(enrichShift),
    historyShifts: historyShifts.map(enrichShift),
    counts: {
      purchases: purchases.length,
      shifts: pendingShifts.length,
      rejected: rejectedShifts.length,
      highVariance: highVarianceShifts.length,
    },
  };
}

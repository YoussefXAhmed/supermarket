/**
 * useOptimisticMutation — light wrapper around TanStack `useMutation`
 * that codifies the optimistic-update-with-rollback pattern used by
 * every Phase 4 batch operation.
 *
 *   const m = useOptimisticMutation({
 *     mutationFn: ({ items }) => batchApproveReceipts(items),
 *     onSnapshot: ({ items }) => snapshotRows(items),    // capture pre-state
 *     onApply:    ({ items }) => optimisticallyMarkApproved(items),
 *     onRollback: (snapshot, error) => restoreRows(snapshot),
 *     onSuccess:  (result) => reconcileFromServer(result),
 *   });
 *   m.mutate({ items: selectedIds });
 *
 * Why this layer (vs. raw TanStack `useMutation`)?
 *   - Frames the three-step optimistic dance (snapshot → apply →
 *     rollback) as named callbacks instead of nested `onMutate`/`onError`
 *     handlers — easier to read at the call-site, easier to test in
 *     isolation.
 *   - Captures the snapshot in a ref so `onRollback` always sees the
 *     correct pre-mutation state, even if React batches updates around
 *     the failure.
 *   - Surfaces `lastResult` and `lastError` directly so consumers don't
 *     need to thread their own state when they only need the latest
 *     outcome.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

/**
 * @template TVars, TResult, TSnapshot
 * @param {{
 *   mutationFn: (vars: TVars) => Promise<TResult>,
 *   onSnapshot?: (vars: TVars) => TSnapshot,
 *   onApply?: (vars: TVars, snapshot: TSnapshot) => void,
 *   onRollback?: (snapshot: TSnapshot, error: unknown, vars: TVars) => void,
 *   onSuccess?: (result: TResult, vars: TVars, snapshot: TSnapshot) => void,
 *   onSettled?: (result: TResult | undefined, error: unknown, vars: TVars, snapshot: TSnapshot) => void,
 * }} options
 */
export function useOptimisticMutation(options) {
  const {
    mutationFn,
    onSnapshot,
    onApply,
    onRollback,
    onSuccess,
    onSettled,
  } = options;

  const snapshotRef = useRef(undefined);

  const wrapped = useCallback(
    async (vars) => {
      const snapshot = onSnapshot ? onSnapshot(vars) : undefined;
      snapshotRef.current = snapshot;
      try {
        onApply?.(vars, snapshot);
      } catch {
        // Apply-phase failure shouldn't block the network call; the
        // optimistic UI may be partially applied — `onRollback` will
        // restore the snapshot if the mutation also fails.
      }
      try {
        const result = await mutationFn(vars);
        onSuccess?.(result, vars, snapshot);
        onSettled?.(result, null, vars, snapshot);
        return result;
      } catch (error) {
        try {
          onRollback?.(snapshot, error, vars);
        } catch {
          // A rollback that itself throws is a bug, but we must not
          // mask the original mutation error.
        }
        onSettled?.(undefined, error, vars, snapshot);
        throw error;
      }
    },
    [mutationFn, onSnapshot, onApply, onRollback, onSuccess, onSettled]
  );

  const m = useMutation({ mutationFn: wrapped });

  return useMemo(
    () => ({
      mutate: m.mutate,
      mutateAsync: m.mutateAsync,
      isPending: m.isPending,
      lastError: m.error ?? null,
      lastResult: m.data ?? null,
      reset: m.reset,
    }),
    [m.mutate, m.mutateAsync, m.isPending, m.error, m.data, m.reset]
  );
}

export default useOptimisticMutation;

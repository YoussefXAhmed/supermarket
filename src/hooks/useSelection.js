/**
 * useSelection — shared row-selection state for batch operations.
 *
 * Pairs with the canonical Table `selectable` API and BulkActionBar:
 *
 *   const sel = useSelection({ items, getId: (row) => row.name });
 *   <Table
 *     selectable
 *     selectedIds={sel.selectedIds}
 *     onSelectionChange={sel.setSelectedIds}
 *     ...
 *   />
 *   <BulkActionBar selectedCount={sel.count} onClear={sel.clear}>
 *     <Btn onClick={() => approveMany(sel.selectedIds)}>Approve {sel.count}</Btn>
 *   </BulkActionBar>
 *
 * Selection is identity-stable across data refreshes — when a poll
 * refetch replaces `items`, rows whose IDs still appear stay selected;
 * rows that have disappeared are pruned automatically. This is what
 * makes batch operations feel right when a queue keeps moving.
 *
 * `getId` is required: never assume `row.id` or `row.name` because
 * Frappe doctypes vary. Pass an explicit accessor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * @typedef {Object} UseSelectionApi
 * @property {Array<string>} selectedIds
 * @property {(id: string) => boolean} isSelected
 * @property {(id: string) => void} toggle
 * @property {() => void} toggleAll
 * @property {() => void} clear
 * @property {(ids: Array<string>) => void} setSelectedIds
 * @property {number} count
 * @property {boolean} allSelected
 * @property {boolean} someSelected
 */

/**
 * @template T
 * @param {{ items: ReadonlyArray<T>, getId: (row: T, index: number) => string }} args
 * @returns {UseSelectionApi}
 */
export function useSelection({ items = [], getId }) {
  if (typeof getId !== 'function') {
    throw new Error('useSelection: `getId` is required and must be a function.');
  }

  // Internal storage is a Set for O(1) toggle + lookup. We expose the
  // selection as an Array because that's what the canonical Table API
  // expects, but we materialize the array lazily.
  const [selected, setSelected] = useState(() => new Set());

  // Memoize the current item-id list so we can prune missing ids when
  // the items array changes (e.g. after a refetch). Using a stable
  // reference avoids re-running the prune effect on every parent
  // render.
  const visibleIdsRef = useRef([]);
  const visibleIds = useMemo(() => {
    const out = [];
    for (let i = 0; i < items.length; i += 1) {
      const id = getId(items[i], i);
      if (id != null) out.push(String(id));
    }
    visibleIdsRef.current = out;
    return out;
  }, [items, getId]);

  // Prune: drop selected ids that are no longer in the visible set.
  // Skip the work when the selection is already empty.
  useEffect(() => {
    if (selected.size === 0) return;
    const visibleSet = new Set(visibleIds);
    let changed = false;
    const next = new Set();
    for (const id of selected) {
      if (visibleSet.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
  }, [visibleIds, selected]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const count = selected.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = count > 0 && !allSelected;

  const isSelected = useCallback((id) => selected.has(String(id)), [selected]);

  const toggle = useCallback((id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const all = visibleIdsRef.current;
      const allOn = all.length > 0 && all.every((id) => prev.has(id));
      if (allOn) {
        // Clear only the visible subset; preserve any off-screen
        // selections that other consumers may have set.
        const next = new Set(prev);
        for (const id of all) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of all) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const setSelectedIds = useCallback((ids) => {
    setSelected(new Set((ids || []).map(String)));
  }, []);

  return {
    selectedIds,
    isSelected,
    toggle,
    toggleAll,
    clear,
    setSelectedIds,
    count,
    allSelected,
    someSelected,
  };
}

export default useSelection;

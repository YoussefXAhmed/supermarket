/**
 * <BulkActionBar> — sticky action bar that surfaces when a Table has
 * selected rows.
 *
 * Pairs with the Phase 2 Table `selectable` API:
 *   <Table selectable selectedIds={ids} onSelectionChange={setIds} ... />
 *   <BulkActionBar selectedCount={ids.length} onClear={() => setIds([])}>
 *     <Btn variant="success" onClick={approveAll}>Approve {ids.length}</Btn>
 *     <Btn variant="danger"  onClick={rejectAll}>Reject {ids.length}</Btn>
 *   </BulkActionBar>
 *
 * When `selectedCount === 0` the bar collapses (returns null) so it
 * costs nothing when no selection is active.
 *
 * Visual position is sticky-bottom of the page by default; pass
 * `inline` to render inline (for sub-cards / nested contexts).
 */
import { useTranslation } from 'react-i18next';

export default function BulkActionBar({
  selectedCount = 0,
  onClear,
  children,
  countLabel,
  inline = false,
  className = '',
}) {
  const { t } = useTranslation();
  if (!selectedCount) return null;

  const cls = [
    'bulk-action-bar',
    inline ? 'bulk-action-bar--inline' : 'bulk-action-bar--sticky',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} role="status" aria-live="polite">
      <div className="bulk-action-bar__count">
        {countLabel ?? t('ui.bulkActions.selectedN', {
          defaultValue: '{{count}} selected',
          count: selectedCount,
        })}
      </div>
      <div className="bulk-action-bar__actions">{children}</div>
      {onClear && (
        <button
          type="button"
          className="bulk-action-bar__clear"
          onClick={onClear}
          aria-label={t('ui.bulkActions.clearSelection', { defaultValue: 'Clear selection' })}
        >
          ✕
        </button>
      )}
    </div>
  );
}

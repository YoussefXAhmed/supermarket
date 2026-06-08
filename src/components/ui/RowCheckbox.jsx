/**
 * <RowCheckbox> — accessible checkbox primitive used by selectable
 * tables and bulk-action surfaces.
 *
 * Why a wrapper around `<input type="checkbox">`?
 *   - Indeterminate state isn't reachable via HTML attribute alone —
 *     React doesn't pass it through the DOM. We have to set it on the
 *     element after mount via a ref. Centralizing that here means
 *     consumers don't have to remember to do it.
 *   - Keyboard ergonomics: Space toggles, Enter does NOT submit any
 *     surrounding form (a common foot-gun on selectable table rows).
 *   - Stops click propagation by default so clicking the checkbox
 *     doesn't also trigger an `onClick` on the table row.
 *
 * Pairs with the canonical `<Table selectable>` API and
 * `<BulkActionBar>`.
 */
import { useEffect, useRef } from 'react';

export default function RowCheckbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
  stopPropagation = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const handleClick = (e) => {
    if (stopPropagation) e.stopPropagation();
  };

  const handleKeyDown = (e) => {
    // Disable Enter inside selectable cells — it would otherwise
    // submit the nearest form or trigger row navigation.
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const handleChange = (e) => {
    onChange?.(e.target.checked, e);
  };

  const cls = ['row-checkbox', className].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cls}
      checked={checked}
      onChange={handleChange}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : Boolean(checked)}
    />
  );
}

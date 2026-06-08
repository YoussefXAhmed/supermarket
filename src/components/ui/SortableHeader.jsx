/**
 * <SortableHeader> — internal Table primitive.
 *
 * Renders a <th> with a sortable button + ARIA `aria-sort` announcement.
 *
 * Phase 2 introduces this for tables with `column.sortable: true`. Pages
 * stay on the simple Table API; sortability is opt-in per column.
 *
 * Controlled API:
 *   sort = { key, dir }     dir is 'asc' | 'desc'
 *   onChange(key)           caller toggles direction state
 */
import { useTranslation } from 'react-i18next';

export default function SortableHeader({
  column,
  active = false,
  direction = null,
  onSort,
  align = 'left',
}) {
  const { t } = useTranslation();
  const ariaSort = active
    ? (direction === 'desc' ? 'descending' : 'ascending')
    : 'none';

  // Visual arrow indicator. Two muted glyphs unless sorted, then strong
  // glyph in the active direction.
  const arrow = !active
    ? <span className="th-sort__arrows" aria-hidden="true">⇅</span>
    : direction === 'desc'
      ? <span className="th-sort__arrow th-sort__arrow--desc" aria-hidden="true">▼</span>
      : <span className="th-sort__arrow th-sort__arrow--asc" aria-hidden="true">▲</span>;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`th th--sortable th--${align} ${active ? 'th--sorted' : ''}`.trim()}
    >
      <button
        type="button"
        className="th-sort"
        onClick={() => onSort?.(column.key)}
        aria-label={t('ui.table.sortBy', {
          defaultValue: 'Sort by {{col}}',
          col: column.label,
        })}
      >
        <span className="th-sort__label">{column.label}</span>
        {arrow}
      </button>
    </th>
  );
}

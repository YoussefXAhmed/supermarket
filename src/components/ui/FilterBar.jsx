/**
 * <FilterBar> — standardised filter container for list / report pages.
 *
 * Pre-Phase-2, every page hand-rolls:
 *   <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 *     <input ...><select ...><Btn ...>
 *   </div>
 *
 * That's at least 12 of the 281 inline-style violations from the audit.
 * This primitive replaces it with a consistent container, tokenized gap,
 * and a logical slot model.
 *
 * Usage:
 *   <FilterBar
 *     onApply={refresh}
 *     onClear={resetState}
 *     leadingActions={<Btn variant="ghost" size="sm">Save view</Btn>}
 *     trailingActions={<Btn variant="primary" size="sm">Export</Btn>}
 *   >
 *     <DateInput value={from} onChange={setFrom} label="From" />
 *     <DateInput value={to}   onChange={setTo}   label="To" />
 *     <Select ...>
 *     <SearchInput ...>
 *   </FilterBar>
 *
 * Density: `compact` → smaller gap (--space-1-5), `default` → --space-2.
 */
import { useTranslation } from 'react-i18next';
import { Btn } from './index';

export default function FilterBar({
  children,
  leadingActions,
  trailingActions,
  onApply,
  onClear,
  density = 'default',
  showApply = false,
  className = '',
}) {
  const { t } = useTranslation();
  const cls = [
    'filter-bar',
    `filter-bar--${density}`,
    className,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} role="search">
      {leadingActions && (
        <div className="filter-bar__leading">{leadingActions}</div>
      )}
      <div className="filter-bar__fields">{children}</div>
      <div className="filter-bar__trailing">
        {showApply && onApply && (
          <Btn variant="primary" size="sm" onClick={onApply}>
            {t('ui.filterBar.apply', { defaultValue: 'Apply' })}
          </Btn>
        )}
        {onClear && (
          <Btn variant="ghost" size="sm" onClick={onClear}>
            {t('ui.filterBar.clear', { defaultValue: 'Clear' })}
          </Btn>
        )}
        {trailingActions}
      </div>
    </div>
  );
}

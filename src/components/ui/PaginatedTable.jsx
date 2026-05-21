import { useMemo, useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

function TableEmpty({ title }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <span className="empty-state__icon">📭</span>
      <p className="empty-state__title">{title || t('ui.table.noData')}</p>
    </div>
  );
}

function PaginatedTableInner({ columns, data = [], pageSize = 25, emptyMsg, rowKey, compact = false, className = '' }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const slice = useMemo(
    () => data.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [data, safePage, pageSize]
  );

  const go = useCallback(
    (next) => setPage(Math.max(0, Math.min(pageCount - 1, next))),
    [pageCount]
  );

  if (!data.length) return <TableEmpty title={emptyMsg} />;

  return (
    <>
      <div className={`table-wrap ${compact ? 'table-wrap--compact' : ''} ${className}`.trim()}>
        <table className={`table ${compact ? 'table--compact' : ''}`}>
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={rowKey ? rowKey(row, i) : `${safePage}-${i}`}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > pageSize && (
        <div className="pagination">
          <span>
            {t('ui.pagination.range', {
              start: safePage * pageSize + 1,
              end: Math.min((safePage + 1) * pageSize, data.length),
              total: data.length,
            })}
          </span>
          <div className="pagination__controls">
            <button type="button" className="btn btn--ghost btn--sm" disabled={safePage === 0} onClick={() => go(safePage - 1)}>
              {t('ui.pagination.previous')}
            </button>
            <span>
              {t('ui.pagination.page', { page: safePage + 1, pageCount })}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={safePage >= pageCount - 1} onClick={() => go(safePage + 1)}>
              {t('ui.pagination.next')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const PaginatedTable = memo(PaginatedTableInner);
export default PaginatedTable;

/* ════════════════════════════════════
   Shared UI primitives
════════════════════════════════════ */

/* ── Button ── */
export function Btn({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'btn';
  return (
    <button className={`${base} btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner size={14} /> : children}
    </button>
  );
}

/* ── Spinner ── */
export function Spinner({ size = 20, color = 'var(--accent)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="30 14" />
    </svg>
  );
}

/* ── Badge ── */
export function Badge({ children, color = 'default' }) {
  return <span className={`badge badge--${color}`}>{children}</span>;
}

/* ── Card ── */
export function Card({ children, className = '', ...props }) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

/* ── PageLoading ── */
export function PageLoading({ size = 28, className = '' }) {
  return (
    <div className={`content-loading ${className}`.trim()}>
      <Spinner size={size} />
    </div>
  );
}

/* ── ApiErrorCard ── */
export function ApiErrorCard({
  title = 'Could not load data',
  message,
  onRetry,
  retryLabel = 'Try again',
}) {
  if (!message) return null;
  return (
    <div className="card api-error-card" role="alert">
      <p className="api-error-card__title">{title}</p>
      <p className="api-error-card__message">{message}</p>
      {onRetry && (
        <Btn variant="ghost" size="sm" onClick={onRetry} style={{ marginTop: 12 }}>
          {retryLabel}
        </Btn>
      )}
    </div>
  );
}

/* ── EmptyState ── */
export function EmptyState({ icon = '📭', title = 'Nothing here', desc = '' }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">{icon}</span>
      <p className="empty-state__title">{title}</p>
      {desc && <p className="empty-state__desc">{desc}</p>}
    </div>
  );
}

/* ── Toast ── */
export function Toast({ message, type = 'info', onClose }) {
  return (
    <div className={`toast toast--${type}`}>
      <span>{message}</span>
      <button onClick={onClose} className="toast__close">✕</button>
    </div>
  );
}

/* ── PageHeader ── */
export function PageHeader({ title, subtitle, actions, dense = false }) {
  return (
    <div className={`page-header ${dense ? 'page-header--dense' : ''}`}>
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/* ── StatCard ── */
export function StatCard({ label, value, icon, color = 'accent', trend, compact = false }) {
  return (
    <div className={`stat-card stat-card--${color} ${compact ? 'stat-card--compact' : ''}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        {trend !== undefined && (
          <p className={`stat-card__trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Table ── */
export function Table({ columns, data, emptyMsg = 'No data', compact = false, className = '' }) {
  if (!data?.length) return <EmptyState title={emptyMsg} />;
  return (
    <div className={`table-wrap ${compact ? 'table-wrap--compact' : ''} ${className}`.trim()}>
      <table className={`table ${compact ? 'table--compact' : ''}`}>
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── SearchInput ── */
/* ── Partial data warning (degraded ERP queries) ── */
export function PartialDataBanner({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="card panel partial-data-banner" role="status" style={{ marginBottom: 16, borderColor: 'var(--amber)' }}>
      <p className="inv-warn" style={{ margin: 0 }}>Some data could not be loaded. Showing partial results.</p>
      <ul className="partial-data-banner__list">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export { default as TrendChart } from './TrendChart';
export { default as PaginatedTable } from './PaginatedTable';
export { default as ExportToolbar } from './ExportToolbar';
export { default as RoleBadge } from './RoleBadge';

export function SearchInput({ value, onChange, placeholder, inputRef, autoFocus }) {
  return (
    <div className="search-input-wrap">
      <svg className="search-input-wrap__icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {value && <button className="search-input-wrap__clear" onClick={() => onChange('')}>✕</button>}
    </div>
  );
}

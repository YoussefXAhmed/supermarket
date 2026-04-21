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
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/* ── StatCard ── */
export function StatCard({ label, value, icon, color = 'accent', trend }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
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
export function Table({ columns, data, emptyMsg = 'No data' }) {
  if (!data?.length) return <EmptyState title={emptyMsg} />;
  return (
    <div className="table-wrap">
      <table className="table">
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

/* ════════════════════════════════════
   Shared UI primitives
════════════════════════════════════ */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

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

/* ── Pill ──
   Generic status pill — single visual primitive backing the three domain
   pills (approvals, AP payment, billing). Each domain wrapper imports
   `Pill`, maps its own state vocabulary → tone, and delegates the chrome
   here. Tones are aliased so domain words ('approved', 'pending', 'rejected')
   work alongside generic ones ('success', 'warning', 'danger', 'info'). */
const PILL_TONES = new Set([
  'default', 'draft',
  'pending', 'warning',
  'approved', 'success',
  'rejected', 'danger',
  'submitted', 'info',
]);
export function Pill({ tone = 'default', title, children, className = '' }) {
  const safe = PILL_TONES.has(tone) ? tone : 'default';
  return (
    <span className={`pill pill--${safe} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
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
  title,
  message,
  onRetry,
  retryLabel,
}) {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <div className="card api-error-card" role="alert">
      <p className="api-error-card__title">{title || t('ui.error.couldNotLoad')}</p>
      <p className="api-error-card__message">{message}</p>
      {onRetry && (
        <Btn variant="ghost" size="sm" onClick={onRetry} style={{ marginTop: 12 }}>
          {retryLabel || t('ui.error.tryAgain')}
        </Btn>
      )}
    </div>
  );
}

/* ── EmptyState ──
   icon may be a string (emoji) or a React node (svg/jsx).
   compact: shrink padding for inline contexts (dropdowns, small panels). */
export function EmptyState({ icon = '📭', title, desc = '', action, compact = false }) {
  const { t } = useTranslation();
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`.trim()} role="status">
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <p className="empty-state__title">{title || t('ui.empty.nothingHere')}</p>
      {desc && <p className="empty-state__desc">{desc}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

/* ── Toast ── */
export function Toast({ message, type = 'info', onClose }) {
  const { t } = useTranslation();
  return (
    <div className={`toast toast--${type}`}>
      <span>{message}</span>
      <button onClick={onClose} className="toast__close" aria-label={t('ui.toast.close')}>✕</button>
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
export function Table({ columns, data, emptyMsg, compact = false, className = '' }) {
  const { t } = useTranslation();
  if (!data?.length) return <EmptyState title={emptyMsg || t('ui.table.noData')} />;
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
  const { t } = useTranslation();
  if (!warnings?.length) return null;
  return (
    <div className="card panel partial-data-banner" role="status" style={{ marginBottom: 16, borderColor: 'var(--amber)' }}>
      <p className="inv-warn" style={{ margin: 0 }}>{t('ui.partialData')}</p>
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
export { default as UserAvatar } from './UserAvatar';

/* ── Skeleton ──
   Use as a placeholder while data loads. `variant` controls shape; `count`
   repeats it for stacked lines. */
export function Skeleton({ variant = 'text', width, height, count = 1, className = '', style }) {
  const items = Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className={`skeleton skeleton--${variant} ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
    >
      &nbsp;
    </span>
  ));
  if (count === 1) return items[0];
  return <div className="skeleton-stack">{items}</div>;
}

/* Convenience: skeleton row for tables (n columns) */
export function SkeletonTableRows({ rows = 5, columns = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r}>
      {Array.from({ length: columns }, (_, c) => (
        <td key={c}><Skeleton variant="line" /></td>
      ))}
    </tr>
  ));
}

/* ── Modal ──
   Single shared dialog primitive. Adds: portal, role="dialog", aria-modal,
   focus auto-set to first focusable, Esc + backdrop close, body scroll-lock,
   size variants ('sm' 360px, 'md' 480px, 'lg' 640px, 'xl' 880px). */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideClose = false,
  footer,
  children,
  className = '',
}) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);

    // Focus the first focusable element inside the dialog (or the dialog itself).
    requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelector(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (focusable || node).focus();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop) onClose?.();
  };

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={handleBackdrop} role="presentation">
      <div
        ref={dialogRef}
        className={`ui-modal ui-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {(title || !hideClose) && (
          <header className="ui-modal__head">
            <div>
              {title && <h2 id={titleId} className="ui-modal__title">{title}</h2>}
              {description && <p id={descId} className="ui-modal__desc">{description}</p>}
            </div>
            {!hideClose && (
              <button
                type="button"
                className="ui-modal__close"
                onClick={() => onClose?.()}
                aria-label={t('ui.modal.close', { defaultValue: 'Close' })}
              >✕</button>
            )}
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/* ── FormField + form primitives ──
   Wrap label, helper text, and validation message around any control.
   Pass `id` to link <label> ↔ control; auto-generates one otherwise. */
export function FormField({ label, htmlFor, hint, error, required, children, className = '' }) {
  const autoId = useId();
  const id = htmlFor || autoId;
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''} ${className}`.trim()}>
      {label && (
        <label htmlFor={id} className="form-field__label">
          {label}{required && <span className="form-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id }) : children}
      {hint && !error && <p className="form-field__hint">{hint}</p>}
      {error && <p className="form-field__error" role="alert">{error}</p>}
    </div>
  );
}

/* Thin wrappers around .input — exist so a future style refactor only touches one place. */
export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      className={`input ${className}`.trim()}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
export function Select({ invalid, className = '', children, ...props }) {
  return (
    <select
      className={`input ${className}`.trim()}
      aria-invalid={invalid || undefined}
      {...props}
    >{children}</select>
  );
}
export function Textarea({ invalid, className = '', ...props }) {
  return (
    <textarea
      className={`input ${className}`.trim()}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/* ── ConfirmDialog ──
   Convenience wrapper around Modal for yes/no flows. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  loading,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel || t('ui.confirm.cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn variant={variant} size="md" onClick={onConfirm} loading={loading}>
            {confirmLabel || t('ui.confirm.confirm', { defaultValue: 'Confirm' })}
          </Btn>
        </>
      }
    >
      {typeof message === 'string' ? <p className="ui-modal__message">{message}</p> : message}
    </Modal>
  );
}

export function SearchInput({ value, onChange, placeholder, inputRef, autoFocus }) {
  const { t } = useTranslation();
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
        placeholder={placeholder || t('ui.search.placeholder')}
        autoFocus={autoFocus}
      />
      {value && (
        <button className="search-input-wrap__clear" onClick={() => onChange('')} aria-label={t('ui.search.clear')}>
          ✕
        </button>
      )}
    </div>
  );
}

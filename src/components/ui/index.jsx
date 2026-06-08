/* ════════════════════════════════════
   Shared UI primitives
════════════════════════════════════ */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Breadcrumbs from './Breadcrumbs';
import SortableHeader from './SortableHeader';

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
/**
 * EmptyState — modernised. The `icon` prop accepts:
 *   - a React element (e.g. <PackageCheck size={24} />) — rendered as-is
 *   - a string (legacy emoji) — rendered inside the icon chip
 *   - omitted — falls back to a generic Lucide Inbox-style chip
 */
export function EmptyState({ icon, title, desc = '', action, compact = false }) {
  const { t } = useTranslation();
  const isReactNode = icon && typeof icon === 'object';
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`.trim()} role="status">
      <span className="empty-state__icon" aria-hidden="true">
        {isReactNode ? icon : (icon ?? '📭')}
      </span>
      <p className="empty-state__title">{title || t('ui.empty.nothingHere')}</p>
      {desc && <p className="empty-state__desc">{desc}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

/* ── Toast ── */
/**
 * Toast supports two shapes:
 *   - simple: `message` (string) — single line, type-tinted background.
 *   - rich:   `message = { title, body, onClick }` — title + small body,
 *             clickable when onClick is provided. Used by the realtime
 *             notification poller to surface new alerts in the top-right.
 *   - element: `message` (React element) — rendered as-is. Used by
 *              Phase 4 batch flows to embed <BatchResultToast>.
 *
 * `action` prop (Phase 4.a) — optional. Renders an inline action below
 * the message body. Two accepted shapes:
 *   - { label, onClick }: standard button shape; dismisses on click.
 *   - ReactNode: rendered as-is in the action slot.
 */
export function Toast({ message, type = 'info', onClose, action }) {
  const { t } = useTranslation();
  const isElement = message && (typeof message === 'object') && !Array.isArray(message) && message.$$typeof;
  const isRich = !isElement && message && typeof message === 'object' && !Array.isArray(message);
  const onClick = isRich && typeof message.onClick === 'function' ? message.onClick : null;
  const handleBodyClick = (e) => {
    // Don't fire the toast onClick when the user is clicking the close (✕)
    // or the action button.
    if (e.target.closest('.toast__close') || e.target.closest('.toast__action')) return;
    if (onClick) {
      onClick();
      if (onClose) onClose();
    }
  };
  const renderAction = () => {
    if (!action) return null;
    if (action && typeof action === 'object' && !Array.isArray(action) && action.$$typeof) {
      // Rendered as-is — caller is responsible for accessibility.
      return <div className="toast__action">{action}</div>;
    }
    if (action && typeof action === 'object' && typeof action.onClick === 'function') {
      return (
        <div className="toast__action">
          <button
            type="button"
            className="toast__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              try { action.onClick(); } finally { onClose?.(); }
            }}
          >
            {action.label}
          </button>
        </div>
      );
    }
    return null;
  };
  return (
    <div
      className={`toast toast--${type}${onClick ? ' toast--clickable' : ''}`}
      role={onClick ? 'button' : 'status'}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? handleBodyClick : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') handleBodyClick(e); } : undefined}
    >
      {isElement ? (
        <div className="toast__body">{message}</div>
      ) : isRich ? (
        <div className="toast__body">
          {message.title && <strong className="toast__title">{message.title}</strong>}
          {message.body && <span className="toast__text">{message.body}</span>}
        </div>
      ) : (
        <span>{message}</span>
      )}
      {renderAction()}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        className="toast__close"
        aria-label={t('ui.toast.close')}
      >✕</button>
    </div>
  );
}

/* ── PageHeader ── */
export function PageHeader({ title, subtitle, actions, dense = false, breadcrumbs }) {
  // Phase 2 — breadcrumbs slot. Lazily render only when items provided
  // so existing PageHeader callers are unaffected. Breadcrumbs sit
  // ABOVE the title (per design system spec).
  return (
    <div className={`page-header ${dense ? 'page-header--dense' : ''}`}>
      <div className="page-header__main">
        {breadcrumbs?.length > 0 && <Breadcrumbs items={breadcrumbs} className="page-header__crumbs" />}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/* ── StatCard ──
 * The KPI value animates from 0 → target on mount using requestAnimationFrame
 * with an ease-out cubic. Non-numeric values (currency strings, ratios) are
 * detected and rendered statically — we only animate the numeric portion if
 * we can parse one cleanly. Honors prefers-reduced-motion. */
function useCountUp(target, { duration = 900 } = {}) {
  const numeric = useMemo(() => {
    if (typeof target === 'number' && Number.isFinite(target)) return target;
    if (typeof target === 'string') {
      // Extract the first numeric run (handles "EGP 1,234", "44%", "1.5M").
      const m = target.match(/-?\d+(?:[.,]\d+)?/);
      if (m) return parseFloat(m[0].replace(/,/g, ''));
    }
    return null;
  }, [target]);

  const [display, setDisplay] = useState(numeric ?? 0);

  useEffect(() => {
    if (numeric == null) return undefined;
    if (typeof window === 'undefined') { setDisplay(numeric); return undefined; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced || duration <= 0) { setDisplay(numeric); return undefined; }
    let rafId;
    const startTs = performance.now();
    const from = 0;
    const to = numeric;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / duration);
      setDisplay(from + (to - from) * ease(t));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [numeric, duration]);

  return { numeric, display };
}

function renderAnimatedValue(value) {
  const { numeric, display } = useCountUp(value);
  if (numeric == null) return value;
  if (typeof value === 'string') {
    // Round display, then re-format by replacing the first numeric run with
    // the animated value, preserving prefix/suffix like "EGP " or " %".
    const rounded = Math.round(display);
    const formatted = rounded.toLocaleString();
    return value.replace(/-?\d+(?:[.,]\d+)?/, formatted);
  }
  // Plain number — show with thousands separators.
  return Math.round(display).toLocaleString();
}

export function StatCard({ label, value, icon, color = 'accent', trend, compact = false }) {
  const animated = renderAnimatedValue(value);
  return (
    <div className={`stat-card stat-card--${color} ${compact ? 'stat-card--compact' : ''}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value stat-card__value--countup">{animated}</p>
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
/**
 * <Table> — workhorse list rendering primitive.
 *
 * Phase 2 extensions (all opt-in, fully backward-compatible):
 *   • column.sortable: true                     — render sortable header
 *   • column.sticky: 'left'                     — sticky left column
 *   • column.align: 'left'|'right'|'center'     — cell alignment
 *   • sort = { key, dir }                       — controlled sort state
 *   • onSortChange(key)                         — toggle direction
 *   • selectable                                — checkbox column + select-all
 *   • selectedIds: Array<string|number>
 *   • onSelectionChange(ids)
 *   • rowKey(row, index) => unique id           — used by selection
 *   • footer = ReactNode                        — <tfoot> slot (totals row, etc.)
 *
 * Backward compat: existing pages passing only { columns, data, emptyMsg,
 * compact, className } get identical output to before.
 */
export function Table({
  columns,
  data,
  emptyMsg,
  compact = false,
  className = '',
  // sort
  sort,
  onSortChange,
  // selection
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  rowKey,
  // footer
  footer,
}) {
  const { t } = useTranslation();
  if (!data?.length) return <EmptyState title={emptyMsg || t('ui.table.noData')} />;

  // Default rowKey: prefer row.name/id, fallback to index.
  const getKey = rowKey || ((row, i) => row?.name ?? row?.id ?? i);
  const selectedSet = new Set(selectedIds || []);
  const allSelected = data.length > 0 && data.every((r, i) => selectedSet.has(getKey(r, i)));
  const someSelected = !allSelected && data.some((r, i) => selectedSet.has(getKey(r, i)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : data.map(getKey));
  };
  const toggleOne = (id) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange([...next]);
  };

  const cls = [
    'table',
    compact ? 'table--compact' : '',
    selectable ? 'table--selectable' : '',
  ].filter(Boolean).join(' ');
  const wrapCls = `table-wrap ${compact ? 'table-wrap--compact' : ''} ${className}`.trim();

  return (
    <div className={wrapCls}>
      <table className={cls}>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="th th--checkbox th--sticky-left">
                <input
                  type="checkbox"
                  aria-label={t('ui.table.selectAll', { defaultValue: 'Select all rows' })}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => {
              if (c.sortable && onSortChange) {
                const isActive = sort?.key === c.key;
                return (
                  <SortableHeader
                    key={c.key}
                    column={c}
                    active={isActive}
                    direction={isActive ? sort.dir : null}
                    onSort={onSortChange}
                    align={c.align || 'left'}
                  />
                );
              }
              const thCls = [
                'th',
                `th--${c.align || 'left'}`,
                c.sticky === 'left' ? 'th--sticky-left' : '',
              ].filter(Boolean).join(' ');
              return <th key={c.key} scope="col" className={thCls}>{c.label}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const id = getKey(row, i);
            const isSel = selectedSet.has(id);
            return (
              <tr key={id} className={isSel ? 'tr--selected' : undefined}>
                {selectable && (
                  <td className="td td--checkbox td--sticky-left">
                    <input
                      type="checkbox"
                      aria-label={t('ui.table.selectRow', { defaultValue: 'Select row' })}
                      checked={isSel}
                      onChange={() => toggleOne(id)}
                    />
                  </td>
                )}
                {columns.map((c) => {
                  const tdCls = [
                    'td',
                    `td--${c.align || 'left'}`,
                    c.sticky === 'left' ? 'td--sticky-left' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <td key={c.key} className={tdCls}>
                      {c.render ? c.render(row[c.key], row) : row[c.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {selectable && <td className="td td--sticky-left" />}
              {footer}
            </tr>
          </tfoot>
        )}
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
export { default as StatusBadge } from './StatusBadge';
export { default as UserAvatar } from './UserAvatar';

/* ── Phase 2 — Shared component additions ── */
export { default as Breadcrumbs } from './Breadcrumbs';
export { default as SortableHeader } from './SortableHeader';
export { default as FormGrid } from './FormGrid';
export { default as FormActions } from './FormActions';
export { default as FilterBar } from './FilterBar';
export { default as DateInput } from './DateInput';
export { default as BulkActionBar } from './BulkActionBar';
export { default as UserMenu } from './UserMenu';
// Phase 4.a — batch/operational primitives.
export { default as RowCheckbox } from './RowCheckbox';
export { default as BatchResultToast } from './BatchResultToast';

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
  // Phase 2 — sheet mode opt-out (default behavior: auto bottom-sheet
  // below --bp-sm via CSS). Pass `sheet="never"` to force a centered
  // modal even on small viewports.
  sheet = 'auto',
  // Phase 2 — initial focus override (defaults to first focusable).
  initialFocusRef,
}) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  // Track the element that had focus before the modal opened so we can
  // restore focus on close — a11y requirement (WCAG 2.4.3).
  const returnFocusRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;

    // Capture focus return target on open.
    returnFocusRef.current = document.activeElement;

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
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
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
      // Restore focus to the element that opened the modal.
      const target = returnFocusRef.current;
      if (target && typeof target.focus === 'function' && document.body.contains(target)) {
        // Defer to next frame so any unmount-side effects from the
        // dialog children settle first.
        requestAnimationFrame(() => target.focus());
      }
    };
  }, [open, closeOnEsc, onClose, initialFocusRef]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && closeOnBackdrop) onClose?.();
  };

  const modalCls = [
    'ui-modal',
    `ui-modal--${size}`,
    `ui-modal--sheet-${sheet}`,
    className,
  ].filter(Boolean).join(' ');

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={handleBackdrop} role="presentation">
      <div
        ref={dialogRef}
        className={modalCls}
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

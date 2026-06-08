/**
 * <DateInput> — standardised date picker on top of `<input type="date">`.
 *
 * Pre-Phase-2 every page uses a bare `<input type="date">` with custom
 * inline styling. This wraps the native input with a proper label, hint,
 * error, min/max props, and a token-driven CSS class.
 *
 * Usage:
 *   <DateInput
 *     label="From"
 *     value={from}                 // ISO YYYY-MM-DD
 *     onChange={setFrom}
 *     min="2026-01-01"
 *     hint="Inclusive"
 *   />
 *
 * Bare-mode (no label) for use inside FilterBar:
 *   <DateInput value={from} onChange={setFrom} aria-label="From" />
 */
import { useId } from 'react';
import { Input } from './index';

export default function DateInput({
  label,
  hint,
  error,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  className = '',
  ...rest
}) {
  const id = useId();
  const wrapCls = [
    'form-field',
    'form-field--date',
    error ? 'form-field--error' : '',
    className,
  ].filter(Boolean).join(' ');

  const field = (
    <Input
      id={id}
      type="date"
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      invalid={Boolean(error)}
      {...rest}
    />
  );

  // Bare-mode (no label, no hint) — return just the input. Keeps the
  // DOM lean inside FilterBar where the input speaks for itself.
  if (!label && !hint && !error) return field;

  return (
    <div className={wrapCls}>
      {label && (
        <label htmlFor={id} className="form-field__label">
          {label}{required && <span className="form-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {field}
      {error && <p className="form-field__error" role="alert">{error}</p>}
      {hint && !error && <p className="form-field__hint">{hint}</p>}
    </div>
  );
}

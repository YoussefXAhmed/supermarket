const CURRENCY = 'EGP';
const LOCALE = 'en-EG';

export function fmtCurrency(value, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: options.decimals ?? 2,
    ...options,
  }).format(n);
}

export function fmtCurrencyCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtNumber(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimals }).format(n);
}

export function fmtPercent(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

export function fmtDate(value, style = 'medium') {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(LOCALE, style === 'short' ? { day: '2-digit', month: 'short' } : undefined);
}

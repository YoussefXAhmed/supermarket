/**
 * ERPNext / Frappe API error normalization and user-facing messages.
 */

export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export const NETWORK_ERROR_MESSAGE =
  'Unable to reach ERPNext. Check your connection and that the server is running.';

export const AUTH_ERROR_MESSAGE =
  'Your session may have expired. Please sign in again.';

export const PERMISSION_ERROR_MESSAGE =
  'You do not have permission for this action in ERPNext. Contact your store manager or administrator.';

/**
 * Strip HTML tags/entities from Frappe server messages for plain-text UI.
 */
export function stripHtml(text) {
  if (text == null || text === '') return '';
  return String(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isPermissionDenied({ status, code, message, raw }) {
  if (status === 403) return true;
  const exc = String(code || raw?.exc_type || '');
  if (/PermissionError/i.test(exc)) return true;
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('not permitted') ||
    msg.includes('permission') ||
    msg.includes('not allowed') ||
    msg.includes('forbidden')
  );
}

/**
 * Parse Frappe `_server_messages` JSON payload.
 */
export function parseFrappeServerMessages(data) {
  try {
    const raw = data?._server_messages;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const parts = [];
    for (const entry of parsed) {
      try {
        const obj = typeof entry === 'string' ? JSON.parse(entry) : entry;
        if (obj?.message) parts.push(stripHtml(obj.message));
      } catch {
        if (typeof entry === 'string') parts.push(stripHtml(entry));
      }
    }
    return parts.filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

const STOCK_ERROR_RE =
  /no stock in warehouse|insufficient stock|negative stock|not enough stock|qty.*not available|stock validation|cannot be negative/i;

/**
 * @param {{ message?: string, status?: number|null, code?: string|null, raw?: object|null }} info
 */
export function isStockValidationError(info) {
  const status = info?.status;
  const code = String(info?.code || info?.raw?.exc_type || '');
  const text = [
    info?.message,
    code,
    info?.raw?.exception,
    info?.raw?.exc,
    typeof info?.raw?.message === 'string' ? info.raw.message : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (status === 417) return true;
  if (/StockValidationError|NegativeStockError|InsufficientStockError/i.test(code)) return true;
  return STOCK_ERROR_RE.test(text);
}

/**
 * Extract warehouse label from ERP stock validation text.
 */
export function parseWarehouseFromStockMessage(message, fallbackWarehouse = '') {
  const msg = stripHtml(message || '');
  const whMatch =
    msg.match(/warehouse\s+([^.;]+)/i) ||
    msg.match(/in\s+([A-Z0-9][^.;]{0,80}?)(?:\s*[.;]|$)/i);
  return (whMatch?.[1] || fallbackWarehouse || 'selected warehouse').trim();
}

/**
 * User-facing POS stock failure (primary line + optional alternate-warehouse hint).
 */
export function formatPosStockErrorMessage(info, { fallbackWarehouse = '', hint = '' } = {}) {
  const warehouse = parseWarehouseFromStockMessage(info?.message, fallbackWarehouse);
  const primary = `Insufficient stock in ${warehouse}`;
  const secondary = hint ? String(hint).trim() : '';
  return secondary ? `${primary}. ${secondary}` : primary;
}

/**
 * Extract a human-readable message from an axios / Error response.
 */
export function extractERPError(error) {
  if (!error) {
    return { message: FALLBACK_ERROR_MESSAGE, status: null, code: null, raw: null };
  }

  if (error.isNormalized) {
    return {
      message: error.message || FALLBACK_ERROR_MESSAGE,
      status: error.status ?? null,
      code: error.code ?? null,
      raw: error.raw ?? null,
      isPermissionError: Boolean(error.isPermissionError),
      isAuthError: Boolean(error.isAuthError),
    };
  }

  const response = error.response;
  const data = response?.data || {};
  const status = response?.status ?? null;

  let message =
    parseFrappeServerMessages(data) ||
    (typeof data.message === 'string' ? data.message : null) ||
    (typeof data.exception === 'string' ? data.exception : null) ||
    (typeof error.message === 'string' ? error.message : null) ||
    FALLBACK_ERROR_MESSAGE;

  if (status === 401) {
    message = AUTH_ERROR_MESSAGE;
  } else if (isPermissionDenied({ status, code: data.exc_type, message, raw: data })) {
    if (message === FALLBACK_ERROR_MESSAGE || /session|login|expired/i.test(message)) {
      message = PERMISSION_ERROR_MESSAGE;
    }
  } else if (!response && (error.code === 'ECONNABORTED' || error.message?.includes('Network'))) {
    message = NETWORK_ERROR_MESSAGE;
  } else if (!response && error.message?.includes('timeout')) {
    message = 'The request timed out. Please try again.';
  }

  if (typeof message !== 'string') message = String(message);
  message = stripHtml(message);

  const base = {
    message,
    status,
    code: data.exc_type || error.code || null,
    raw: data,
    isPermissionError: isPermissionDenied({
      status,
      code: data.exc_type,
      message,
      raw: data,
    }),
    isAuthError: status === 401,
  };
  base.isStockError = isStockValidationError(base);
  return base;
}

/**
 * Normalize any thrown value into an Error with metadata.
 */
export function normalizeERPError(error) {
  if (error instanceof Error && error.isNormalized) return error;

  const extracted = extractERPError(error);
  const { message, status, code, raw, isPermissionError, isAuthError, isStockError } = extracted;
  const err = new Error(message);
  err.isNormalized = true;
  err.status = status;
  err.code = code;
  err.raw = raw;
  err.isPermissionError = isPermissionError;
  err.isAuthError = isAuthError;
  err.isStockError = isStockError;
  if (error && typeof error === 'object') {
    err.cause = error;
    if (error.invoiceName) err.invoiceName = error.invoiceName;
    if (error.recoverable != null) err.recoverable = error.recoverable;
  }
  return err;
}

/**
 * User-friendly message for UI (never exposes stack traces).
 */
export function getUserFriendlyMessage(error, fallback = FALLBACK_ERROR_MESSAGE) {
  const info = extractERPError(error);
  if (info.isStockError || error?.isStockError) {
    return formatPosStockErrorMessage(info, {
      fallbackWarehouse: error?.posWarehouse || '',
      hint: error?.stockHint || '',
    });
  }
  return info.message || fallback;
}

/**
 * Dev-only structured logging.
 */
export function logApiError(context, error) {
  const { message, status, code } = extractERPError(error);
  if (import.meta.env.DEV) {
    console.error(`[api:${context}]`, { message, status, code, error });
  }
}

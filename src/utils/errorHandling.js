/**
 * ERPNext / Frappe API error normalization and user-facing messages.
 */

export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export const NETWORK_ERROR_MESSAGE =
  'Unable to reach ERPNext. Check your connection and that the server is running.';

/** Shown when an existing authenticated session is no longer valid. */
export const SESSION_EXPIRED_MESSAGE =
  'Your session may have expired. Please sign in again.';

/** @deprecated Use SESSION_EXPIRED_MESSAGE */
export const AUTH_ERROR_MESSAGE = SESSION_EXPIRED_MESSAGE;

/** Generic login failure — does not reveal whether the email exists. */
export const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password';

export const PERMISSION_ERROR_MESSAGE =
  'You do not have permission for this action in ERPNext. Contact your store manager or administrator.';

export const INVALID_SHIFT_SESSION_MESSAGE = 'Invalid/incomplete shift session';

const SHIFT_SESSION_INVALID_RE =
  /pos opening entry must be submitted|incomplete shift session|invalid\/incomplete shift/i;

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

const INVALID_LOGIN_RE =
  /incorrect password|invalid login|invalid credentials|authenticationerror|authentication error|login credentials|not permitted to login|disabled user|user disabled/i;

/**
 * Login POST or explicit loginAttempt flag.
 * @param {unknown} error
 */
export function isLoginRequest(error) {
  const cfg = error?.config || error?.response?.config || error?.cause?.config;
  if (cfg?.loginAttempt) return true;
  const url = String(cfg?.url || '');
  return /\/api\/method\/login\b/i.test(url);
}

function isNetworkFailure(error, status) {
  const response = error?.response;
  if (response) return false;
  const code = error?.code;
  const msg = String(error?.message || '');
  return (
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    /network error/i.test(msg) ||
    (!response && status == null && /fetch|network/i.test(msg))
  );
}

/**
 * Wrong password / invalid login on the login form — never session expiry.
 * @param {unknown} error
 * @param {{ status?: number|null, code?: string|null, message?: string, raw?: object|null }} [info]
 */
export function isInvalidCredentialsError(error, info = null) {
  if (!isLoginRequest(error)) return false;
  const extracted = info || extractERPError(error);
  if (isNetworkFailure(error, extracted.status)) return false;
  if (extracted.isInvalidCredentials) return true;
  const status = extracted.status;
  const code = String(extracted.code || extracted.raw?.exc_type || '');
  const msg = String(extracted.message || '').toLowerCase();
  if (status === 401 || status === 403) return true;
  if (/AuthenticationError/i.test(code)) return true;
  if (INVALID_LOGIN_RE.test(msg)) return true;
  if (status != null && status >= 400) return true;
  return true;
}

/**
 * Existing session became invalid on an authenticated API call.
 * @param {unknown} error
 * @param {{ status?: number|null, message?: string, isSessionExpired?: boolean, isAuthError?: boolean }} [info]
 */
export function isSessionExpiredError(error, info = null) {
  if (isLoginRequest(error)) return false;
  const extracted = info || extractERPError(error);
  if (extracted.isSessionExpired) return true;
  if (extracted.status === 401) return true;
  const msg = String(extracted.message || '').toLowerCase();
  return /session.*expired|not logged in|login required|session expired/i.test(msg);
}

/**
 * User-facing auth message for login form (localized when `t` is provided).
 * @param {unknown} error
 * @param {(key: string) => string} [t]
 */
export function getLoginErrorMessage(error, t) {
  const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);
  const info = extractERPError(error);

  if (isNetworkFailure(error, info.status) || info.isNetworkError) {
    return tr('auth.networkError', NETWORK_ERROR_MESSAGE);
  }
  if (String(info.message || '').toLowerCase().includes('timeout')) {
    return tr('auth.networkError', NETWORK_ERROR_MESSAGE);
  }
  return tr('auth.invalidCredentials', INVALID_CREDENTIALS_MESSAGE);
}

/**
 * User-facing auth message for authenticated flows (localized when `t` is provided).
 * @param {unknown} error
 * @param {(key: string) => string} [t]
 */
export function getAuthErrorMessage(error, t) {
  const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback);
  const info = extractERPError(error);

  if (isInvalidCredentialsError(error, info)) {
    return tr('auth.invalidCredentials', INVALID_CREDENTIALS_MESSAGE);
  }
  if (isNetworkFailure(error, info.status) || info.isNetworkError) {
    return tr('auth.networkError', NETWORK_ERROR_MESSAGE);
  }
  if (isSessionExpiredError(error, info)) {
    return tr('auth.sessionExpired', SESSION_EXPIRED_MESSAGE);
  }
  return null;
}

const STOCK_ERROR_RE =
  /no stock in warehouse|insufficient stock|negative stock|not enough stock|qty.*not available|stock validation|cannot be negative/i;

const POS_STOCK_MOVEMENT_RE =
  /submitted without stock movement|update_stock disabled|was not submitted/i;

const GL_MOVEMENT_RE =
  /submitted without accounting entries/i;

/**
 * @param {{ message?: string, status?: number|null, code?: string|null, raw?: object|null }} info
 */
export function isPosStockMovementError(info) {
  const text = [
    info?.message,
    info?.code,
    info?.raw?.exc_type,
    info?.raw?.exception,
  ]
    .filter(Boolean)
    .join(' ');
  return POS_STOCK_MOVEMENT_RE.test(text);
}

export function isGlMovementError(info) {
  const text = [info?.message, info?.code, info?.raw?.exc_type].filter(Boolean).join(' ');
  return GL_MOVEMENT_RE.test(text);
}

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
 * Draft/unsubmitted POS Opening Entry — shift summary unavailable.
 */
export function isInvalidShiftSessionError(infoOrError) {
  if (!infoOrError) return false;
  if (infoOrError.isInvalidShiftSession) return true;
  const info =
    infoOrError.isNormalized || infoOrError.status != null || infoOrError.code
      ? infoOrError
      : extractERPError(infoOrError);
  const code = String(info?.code || info?.raw?.exc_type || '');
  const msg = String(info?.message || '');
  if (infoOrError?.isInvalidShiftSession) return true;
  if (code === 'ValidationError' && SHIFT_SESSION_INVALID_RE.test(msg)) return true;
  return SHIFT_SESSION_INVALID_RE.test(msg);
}

export function createInvalidShiftSessionError(cause = null) {
  const err = new Error(INVALID_SHIFT_SESSION_MESSAGE);
  err.isNormalized = true;
  err.isInvalidShiftSession = true;
  err.isSilent = true;
  err.code = 'ValidationError';
  if (cause) err.cause = cause;
  return err;
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
      isInvalidCredentials: Boolean(error.isInvalidCredentials),
      isSessionExpired: Boolean(error.isSessionExpired),
      isNetworkError: Boolean(error.isNetworkError),
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

  const loginReq = isLoginRequest(error);
  let isInvalidCredentials = false;
  let isSessionExpired = false;
  let isNetworkError = false;

  if (loginReq) {
    if (isNetworkFailure(error, status)) {
      message = NETWORK_ERROR_MESSAGE;
      isNetworkError = true;
    } else if (!response && String(error.message || '').toLowerCase().includes('timeout')) {
      message = NETWORK_ERROR_MESSAGE;
      isNetworkError = true;
    } else {
      message = INVALID_CREDENTIALS_MESSAGE;
      isInvalidCredentials = true;
    }
  } else if (status === 401) {
    message = SESSION_EXPIRED_MESSAGE;
    isSessionExpired = true;
  } else if (isPermissionDenied({ status, code: data.exc_type, message, raw: data })) {
    if (message === FALLBACK_ERROR_MESSAGE || /session|login|expired/i.test(message)) {
      message = PERMISSION_ERROR_MESSAGE;
    }
  } else if (isNetworkFailure(error, status)) {
    message = NETWORK_ERROR_MESSAGE;
    isNetworkError = true;
  } else if (!response && error.message?.includes('timeout')) {
    message = NETWORK_ERROR_MESSAGE;
    isNetworkError = true;
  }

  if (typeof message !== 'string') message = String(message);
  message = stripHtml(message)
    .replace(/^frappe\.exceptions\.\w+:\s*/i, '')
    .replace(/^Exception:\s*/i, '')
    .trim();

  if (loginReq && !isNetworkError) {
    message = INVALID_CREDENTIALS_MESSAGE;
    isInvalidCredentials = true;
  } else if (!loginReq && status === 401) {
    message = SESSION_EXPIRED_MESSAGE;
    isSessionExpired = true;
  } else if (
    !loginReq &&
    /session.*expired|not logged in|login required/i.test(message.toLowerCase())
  ) {
    message = SESSION_EXPIRED_MESSAGE;
    isSessionExpired = true;
  }

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
    isAuthError: isSessionExpired || status === 401,
    isInvalidCredentials,
    isSessionExpired,
    isNetworkError,
  };
  base.isStockError = isStockValidationError(base);
  base.isInvalidShiftSession = isInvalidShiftSessionError(base);
  return base;
}

/**
 * Normalize any thrown value into an Error with metadata.
 */
export function normalizeERPError(error) {
  if (error instanceof Error && error.isNormalized) return error;

  const extracted = extractERPError(error);
  const {
    message,
    status,
    code,
    raw,
    isPermissionError,
    isAuthError,
    isStockError,
    isInvalidShiftSession,
    isInvalidCredentials,
    isSessionExpired,
    isNetworkError,
  } = extracted;
  const err = new Error(
    isInvalidShiftSession ? INVALID_SHIFT_SESSION_MESSAGE : message,
  );
  err.isNormalized = true;
  err.status = status;
  err.code = code;
  err.raw = raw;
  err.isPermissionError = isPermissionError;
  err.isAuthError = isAuthError;
  err.isStockError = isStockError;
  err.isInvalidShiftSession = isInvalidShiftSession;
  err.isInvalidCredentials = isInvalidCredentials;
  err.isSessionExpired = isSessionExpired;
  err.isNetworkError = isNetworkError;
  if (isInvalidShiftSession) err.isSilent = true;
  if (error && typeof error === 'object') {
    err.cause = error;
    if (error.config) err.config = error.config;
    if (error.invoiceName) err.invoiceName = error.invoiceName;
    if (error.recoverable != null) err.recoverable = error.recoverable;
  }
  return err;
}

/**
 * User-friendly message for UI (never exposes stack traces).
 */
const PI_FROM_RECEIPT_RE =
  /draft purchase invoice|already exists for this receipt|already fully billed|could not create purchase invoice|could not be submitted|purchase invoice mapper/i;

export function getUserFriendlyMessage(error, fallback = FALLBACK_ERROR_MESSAGE) {
  const info = extractERPError(error);
  if (info.isInvalidShiftSession || error?.isInvalidShiftSession) {
    return INVALID_SHIFT_SESSION_MESSAGE;
  }
  if (info.isInvalidCredentials) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  if (info.isSessionExpired || (info.status === 401 && !isLoginRequest(error))) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (info.isNetworkError) {
    return NETWORK_ERROR_MESSAGE;
  }
  // Stock errors should only be formatted as POS stock banners when the caller explicitly
  // flags the error as POS stock context (posWarehouse/stockHint).
  if ((info.isStockError || error?.isStockError) && (error?.posWarehouse || error?.stockHint)) {
    return formatPosStockErrorMessage(info, {
      fallbackWarehouse: error?.posWarehouse || '',
      hint: error?.stockHint || '',
    });
  }
  if (info.isPermissionError || error?.response?.status === 403) {
    const url = String(error?.config?.url || error?.response?.config?.url || '');
    const permMsg = String(info.message || '');
    const combined = `${url} ${permMsg}`.toLowerCase();
    if (
      /pos_closing_approval\./i.test(url) ||
      /approve shift closings|reject shift closings|shift clos/i.test(permMsg) ||
      /pos closing entry.*submit/i.test(permMsg)
    ) {
      return 'You do not have permission to approve shift closings.';
    }
    if (/shift/i.test(combined) && /clos/i.test(combined) && /permission|forbidden|not permitted/i.test(combined)) {
      return 'You do not have permission to approve shift closings.';
    }
    return PERMISSION_ERROR_MESSAGE;
  }
  const msg = info.message || fallback;
  if (PI_FROM_RECEIPT_RE.test(msg)) {
    return msg.replace(/^frappe\.exceptions\.\w+:\s*/i, '').trim();
  }
  if (/Traceback|File ".*\.py"/i.test(msg)) {
    return 'ERP could not complete this purchase invoice action. Check the receipt and try again.';
  }
  return msg;
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

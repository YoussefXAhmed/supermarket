/**
 * ERPNext / Frappe API error normalization and user-facing messages.
 */

export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export const NETWORK_ERROR_MESSAGE =
  'Unable to reach ERPNext. Check your connection and that the server is running.';

export const AUTH_ERROR_MESSAGE =
  'Your session may have expired. Please sign in again.';

/**
 * Parse Frappe `_server_messages` JSON payload.
 */
export function parseFrappeServerMessages(data) {
  try {
    const raw = data?._server_messages;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const first = JSON.parse(parsed[0]);
    return first?.message || null;
  } catch {
    return null;
  }
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

  if (status === 401 || status === 403) {
    message = AUTH_ERROR_MESSAGE;
  } else if (!response && (error.code === 'ECONNABORTED' || error.message?.includes('Network'))) {
    message = NETWORK_ERROR_MESSAGE;
  } else if (!response && error.message?.includes('timeout')) {
    message = 'The request timed out. Please try again.';
  }

  if (typeof message !== 'string') message = String(message);

  return {
    message,
    status,
    code: data.exc_type || error.code || null,
    raw: data,
  };
}

/**
 * Normalize any thrown value into an Error with metadata.
 */
export function normalizeERPError(error) {
  if (error instanceof Error && error.isNormalized) return error;

  const { message, status, code, raw } = extractERPError(error);
  const err = new Error(message);
  err.isNormalized = true;
  err.status = status;
  err.code = code;
  err.raw = raw;
  if (error && typeof error === 'object') {
    err.cause = error;
  }
  return err;
}

/**
 * User-friendly message for UI (never exposes stack traces).
 */
export function getUserFriendlyMessage(error, fallback = FALLBACK_ERROR_MESSAGE) {
  const { message } = extractERPError(error);
  return message || fallback;
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

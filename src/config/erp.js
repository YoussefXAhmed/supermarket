/**
 * Central ERPNext URL configuration.
 * Set VITE_ERPNEXT_URL in `.env` for production and when ERP is not on the default host.
 */

const DEFAULT_ERP_URL = 'http://127.0.0.1:8000';

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function readEnvUrl(key) {
  const raw = import.meta.env[key];
  return raw && String(raw).trim() ? trimTrailingSlash(raw) : null;
}

/** Public ERPNext site origin (desk, images, external links). */
export const ERP_BASE_URL = readEnvUrl('VITE_ERPNEXT_URL') || DEFAULT_ERP_URL;

/**
 * REST API base for axios.
 * Dev: empty string so Vite proxies `/api` to ERPNext (cookie-friendly).
 * Prod: ERP origin unless VITE_ERP_API_BASE overrides.
 */
export const ERP_API_BASE =
  readEnvUrl('VITE_ERP_API_BASE') ??
  (import.meta.env.DEV ? '' : ERP_BASE_URL);

/** Printview origin (defaults to ERP_BASE_URL). */
export const ERP_PRINT_BASE = readEnvUrl('VITE_ERP_PRINT_BASE') || ERP_BASE_URL;

export const IS_DEV = Boolean(import.meta.env.DEV);

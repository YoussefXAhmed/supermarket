import { ERP_BASE_URL, ERP_PRINT_BASE } from '../config/erp';

/**
 * Join a base URL with a path segment.
 */
export function joinERPUrl(base, path = '') {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Build a Frappe desk URL (`/app/...`).
 * @param {string} path - e.g. `item`, `/item/ITEM-001`, `query-report/Sales Register`
 */
export function getERPDeskUrl(path = '') {
  if (!path) return joinERPUrl(ERP_BASE_URL, '/app');
  if (path.startsWith('/app')) return joinERPUrl(ERP_BASE_URL, path);
  const segment = path.startsWith('/') ? path.slice(1) : path;
  return joinERPUrl(ERP_BASE_URL, `/app/${segment}`);
}

/** Open ERPNext desk in a new tab. */
export function openERPDesk(path = '') {
  const url = getERPDeskUrl(path);
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

/**
 * Build ERPNext printview URL.
 */
export function getERPPrintviewUrl({
  doctype,
  name,
  format = 'Standard',
  noLetterhead = 0,
  letterhead = 'No Letterhead',
  lang = 'en',
} = {}) {
  const params = new URLSearchParams({
    doctype,
    name,
    format,
    no_letterhead: String(noLetterhead),
    letterhead,
    _lang: lang,
  });
  return `${ERP_PRINT_BASE}/printview?${params.toString()}`;
}

/** Open ERPNext printview in a new tab. */
export function openERPPrintview(options) {
  const url = getERPPrintviewUrl(options);
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

/**
 * Resolve Item.image (or any ERP file path) to a full URL.
 */
export function getERPImageUrl(imagePath) {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  return joinERPUrl(ERP_BASE_URL, imagePath);
}

/** Desk query report URL. */
export function getERPQueryReportUrl(reportName) {
  return getERPDeskUrl(`query-report/${encodeURIComponent(reportName)}`);
}

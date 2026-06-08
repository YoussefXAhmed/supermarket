/**
 * printErpFormat — open an ERPNext-rendered PDF in a new tab.
 *
 * Replaces the previous browser-print flow (`exportToPdf` from utils/export.js)
 * for every document we have a Jinja print format for. The server renders via
 * WeasyPrint so the output is page-numbered, font-correct, RTL-aware, and
 * carries the company logo + audit info — none of which a browser-print can
 * guarantee.
 *
 * Usage:
 *
 *   printErpFormat({
 *     doctype: 'Purchase Invoice',
 *     name:    'ACC-PINV-2026-00024',
 *     format:  'Elmahdi Supplier Invoice',
 *     lang:    'en',         // optional — falls back to i18n.language
 *     download: false,       // true → forces filename download
 *   });
 *
 * The PDF endpoint requires a valid session — same auth as every other API
 * call. ERPNext sets the `Content-Type: application/pdf` and a meaningful
 * `Content-Disposition`, so the browser handles it natively.
 */
import i18n from '../i18n';

/** Resolve the user's preferred print language. EN-only fallback. */
function resolveLang(explicit) {
  if (explicit) return explicit;
  const code = String(i18n?.language || 'en').split('-')[0].toLowerCase();
  return code === 'ar' ? 'ar' : 'en';
}

export function printErpFormat({ doctype, name, format, lang, download = false } = {}) {
  if (!doctype || !name || !format) {
    // Defensive: refuse to open a blank window if the caller forgot a param.
    // Errors here would be silent garbage; better to log and noop.
    // eslint-disable-next-line no-console
    console.warn('[printErpFormat] missing required arg', { doctype, name, format });
    return null;
  }
  const params = new URLSearchParams({
    doctype,
    name,
    format,
    _lang: resolveLang(lang),
  });
  if (download) params.set('no_letterhead', '0');
  const url = `/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`;
  return window.open(url, '_blank', 'noopener');
}

/**
 * Convenience map — keeps the (doctype → format name) pairing in one
 * place so callers don't have to remember the exact Print Format names.
 */
export const PRINT_FORMATS = {
  POS_RECEIPT:           { doctype: 'POS Invoice',           format: 'Elmahdi POS Receipt 80mm' },
  SALES_INVOICE:         { doctype: 'Sales Invoice',         format: 'Elmahdi Sales Invoice' },
  GOODS_RECEIPT:         { doctype: 'Purchase Receipt',      format: 'Elmahdi Goods Receipt' },
  SUPPLIER_INVOICE:      { doctype: 'Purchase Invoice',      format: 'Elmahdi Supplier Invoice' },
  PAYMENT_VOUCHER:       { doctype: 'Payment Entry',         format: 'Elmahdi Payment Voucher' },
  STOCK_TRANSFER:        { doctype: 'Stock Entry',           format: 'Elmahdi Stock Transfer' },
  STOCK_RECONCILIATION:  { doctype: 'Stock Reconciliation',  format: 'Elmahdi Stock Reconciliation' },
  SHIFT_CLOSING:         { doctype: 'POS Closing Entry',     format: 'Elmahdi Shift Closing' },
};

export function printDocByKind(kind, name, lang) {
  const cfg = PRINT_FORMATS[kind];
  if (!cfg) return null;
  return printErpFormat({ doctype: cfg.doctype, name, format: cfg.format, lang });
}

/**
 * Render a Finance report as a server-rendered PDF (uses the unified Jinja
 * report templates + Elmahdi master macros for visual consistency).
 *
 *   printReportPdf('general_ledger', { from_date, to_date, account, branch })
 *   printReportPdf('ap_aging',       {})
 *   printReportPdf('top_suppliers',  { from_date, to_date })
 */
export function printReportPdf(reportKey, filters = {}, lang) {
  if (!reportKey) return null;
  const params = new URLSearchParams({
    report_key: reportKey,
    _lang: resolveLang(lang),
  });
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const url = `/api/method/elmahdi.api.print_reports.render_report_pdf?${params.toString()}`;
  return window.open(url, '_blank', 'noopener');
}

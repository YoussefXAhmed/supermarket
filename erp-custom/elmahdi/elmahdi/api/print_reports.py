"""
Render Elmahdi finance reports as PDFs.

Frappe's built-in PDF endpoint is doctype-scoped — reports aren't doctypes,
so we expose a small whitelisted helper that:

  1. Calls the corresponding `get_<report>` endpoint to build the data.
  2. Renders the matching Jinja template with that data + the shared
     `info` dict from print_helpers.
  3. Passes the HTML through Frappe's `get_pdf()` (WeasyPrint) and returns
     the binary stream — Frappe sets the Content-Type/Disposition.

The endpoint reuses the existing capability checks of each report endpoint,
so a Purchasing Officer who can't see GL data cannot print it either.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils.pdf import get_pdf

from elmahdi.api.accounts_payable import (
    get_general_ledger,
    get_ap_aging_by_supplier,
    get_top_suppliers_report,
)
from elmahdi.api import reports as registry_reports
from elmahdi.print_helpers import print_context


_GENERIC_TPL = "elmahdi/templates/print_formats/report_generic.html"


def _registry_runner(report_key: str):
    """Return a callable that runs a registry report and shapes the result
    into the print-template's expected envelope."""
    def runner(**filters):
        data = registry_reports.run_report(report_key, filters)
        # `data` is already {columns, rows, summary, warnings}; pass it
        # through unchanged.
        return data
    return runner


_REPORTS = {
    # Bespoke finance reports — kept on their own templates because they
    # carry extra structure (running balance, bucket totals, ranking, …).
    "general_ledger": {
        "template": "elmahdi/templates/print_formats/report_general_ledger.html",
        "fn": get_general_ledger,
        "name": ("General Ledger", "دفتر الأستاذ العام"),
    },
    "ap_aging": {
        "template": "elmahdi/templates/print_formats/report_ap_aging.html",
        "fn": get_ap_aging_by_supplier,
        "name": ("AP Aging", "أعمار الذمم الدائنة"),
    },
    "top_suppliers": {
        "template": "elmahdi/templates/print_formats/report_top_suppliers.html",
        "fn": get_top_suppliers_report,
        "name": ("Top Suppliers", "أهم الموردين"),
    },

    # Generic columnar reports — every report registered in
    # `elmahdi.api.reports.REPORT_REGISTRY` reaches PDF through the same
    # template. To add a new one, just append it to REPORT_REGISTRY there
    # and add an entry below — no new Jinja file needed.
    "sales_register": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("sales-register"),
        "name": ("Sales Register", "سجل المبيعات"),
    },
    "daily_cash_register": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("daily-cash-register"),
        "name": ("Daily Cash Register", "سجل النقدية اليومي"),
    },
    "stock_balance": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("stock-balance"),
        "name": ("Stock Balance", "رصيد المخزون"),
    },
    "customer_ledger": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("customer-ledger"),
        "name": ("Customer Ledger", "حساب العميل"),
    },
    "profit_and_loss": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("profit-and-loss"),
        "name": ("Profit & Loss", "الربح والخسارة"),
    },
    "item_wise_sales": {
        "template": _GENERIC_TPL,
        "fn": _registry_runner("item-wise-sales"),
        "name": ("Item-wise Sales", "المبيعات حسب الصنف"),
    },
}


@frappe.whitelist()
def render_report_pdf(report_key: str, lang: str | None = None, **filters):
    """Render a report template against fresh data and stream the PDF.

    `filters` are forwarded to the report's data function — caller passes
    them as URL query params, e.g.:
        /api/method/elmahdi.api.print_reports.render_report_pdf
            ?report_key=general_ledger&from_date=2026-01-01&to_date=2026-06-04
    """
    if report_key not in _REPORTS:
        frappe.throw(_("Unknown report key: {0}").format(report_key), frappe.ValidationError)

    spec = _REPORTS[report_key]

    # Strip Frappe-internal URL params before forwarding. Frappe always
    # appends `cmd`, and the SPA's printErpFormat helper sends `_lang`
    # as its own framework param — neither belongs in the data function's
    # kwargs, and most data functions have strict `@frappe.whitelist`
    # typing validation that rejects unknown args.
    if not lang and filters.get("_lang"):
        lang = filters["_lang"]
    clean_filters = {
        k: v for k, v in filters.items()
        if k not in {"cmd", "_lang", "lang", "_csrf_token"} and not k.startswith("_")
    }

    # Each report function does its own permission assertion via
    # _require_ap_read() — printing is just an alternative output channel.
    report_data = spec["fn"](**clean_filters)

    lang = (lang or getattr(frappe.local, "lang", None) or "en").split("-")[0].lower()
    if lang not in ("en", "ar"):
        lang = "en"

    # Build a doc-like proxy so print_helpers.print_context can still
    # produce a sane info dict without a real Frappe document.
    proxy = frappe._dict({
        "doctype": "Report",
        "company": frappe.defaults.get_user_default("Company")
            or frappe.db.get_single_value("Global Defaults", "default_company"),
        "creation": frappe.utils.now_datetime(),
        "owner": frappe.session.user,
        "name": spec["name"][1 if lang == "ar" else 0],
    })
    info = print_context(proxy, lang=lang)

    report_title = spec["name"][1 if lang == "ar" else 0]
    html = frappe.render_template(spec["template"], {
        "info": info,
        "report": frappe._dict(report_data),
        "report_title": report_title,
    })

    pdf = get_pdf(html)
    file_basename = f"{report_key}-{frappe.utils.today()}"
    frappe.local.response.filename = f"{file_basename}.pdf"
    frappe.local.response.filecontent = pdf
    frappe.local.response.type = "binary"
    frappe.local.response.display_content_as = "attachment"

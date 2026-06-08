"""
Idempotent installer for every Elmahdi Print Format.

The HTML for each format lives in a sibling `.html` file under
`templates/print_formats/<key>.html`. We read it at install time and
upsert the Print Format record.

Run via `bench migrate` (auto), or manually:
    bench --site SITE execute elmahdi.setup.print_formats.install_print_formats
"""

from __future__ import annotations

from pathlib import Path

import frappe


APP_NAME = "elmahdi"


# (Print Format name, doctype, source file under templates/print_formats/, default_print_language)
FORMATS: list[tuple[str, str, str, str]] = [
    # Transactional documents
    ("Elmahdi POS Receipt 80mm",      "POS Invoice",          "pos_receipt_80mm.html", "en"),
    ("Elmahdi Sales Invoice",         "Sales Invoice",        "sales_invoice.html",    "en"),
    ("Elmahdi Goods Receipt",         "Purchase Receipt",     "goods_receipt.html",    "en"),
    ("Elmahdi Supplier Invoice",      "Purchase Invoice",     "supplier_invoice.html", "en"),
    ("Elmahdi Payment Voucher",       "Payment Entry",        "payment_voucher.html",  "en"),
    ("Elmahdi Stock Transfer",        "Stock Entry",          "stock_transfer.html",   "en"),
    ("Elmahdi Stock Reconciliation",  "Stock Reconciliation", "stock_reconciliation.html", "en"),
    ("Elmahdi Shift Closing",         "POS Closing Entry",    "shift_closing.html",    "en"),
    # HR
    ("Elmahdi Payslip",               "Salary Slip",          "payslip.html",          "en"),
    # Reports — we surface them as Print Formats on a "wrapper" docname,
    # but in practice the SPA prints these by rendering the format directly
    # against synthetic context. See report_formats.py for that flow.
]


def _read_template(file_name: str) -> str:
    base = Path(frappe.get_app_path(APP_NAME, "templates", "print_formats"))
    path = base / file_name
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _upsert(name: str, doctype: str, html: str, language: str = "en"):
    if not html:
        # Template file not yet shipped — skip silently so the migration
        # passes even mid-batch.
        return False
    payload = {
        "doctype": "Print Format",
        "name": name,
        "doc_type": doctype,
        "module": "Elmahdi",
        "print_format_type": "Jinja",
        "standard": "No",
        "disabled": 0,
        "raw_printing": 1 if "80mm" in name else 0,
        "default_print_language": language,
        "html": html,
    }
    if frappe.db.exists("Print Format", name):
        existing = frappe.get_doc("Print Format", name)
        existing.update(payload)
        existing.flags.ignore_permissions = True
        existing.save()
    else:
        frappe.get_doc(payload).insert(ignore_permissions=True)
    return True


def install_print_formats():
    installed = []
    skipped = []
    for name, doctype, fname, lang in FORMATS:
        html = _read_template(fname)
        if not html:
            skipped.append((name, fname, "template-missing"))
            continue
        try:
            _upsert(name, doctype, html, lang)
            installed.append(name)
        except Exception as exc:  # noqa: BLE001
            skipped.append((name, fname, str(exc)))
    frappe.db.commit()
    return {"installed": installed, "skipped": skipped}

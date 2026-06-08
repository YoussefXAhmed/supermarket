"""
Print Format helpers — builds the shared `info` dict that every Elmahdi
Print Format passes to the master macro library.

The info dict carries:
    company_name, logo_url
    branch_name, branch_address, branch_phone
    audit.{created_by, created_at, approved_by, approved_at}
    printed_by, printed_at
    currency, lang
    labels      (EN / AR — selected based on the format's print language)

Each Print Format calls:

    {% set info = elmahdi.print_helpers.print_context(doc) %}

at the top, then uses `info` throughout. The cost is one helper call per
print render — cheap and side-effect-free.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.utils import flt, get_datetime, now_datetime


# ── Labels — EN / AR ──────────────────────────────────────────────────────


_LABELS = {
    "en": {
        "branch":        "Branch",
        "phone":         "Phone",
        "date":          "Date",
        "time":          "Time",
        "created_by":    "Created by",
        "created_at":    "Created at",
        "approved_by":   "Approved by",
        "approved_at":   "Approved at",
        "printed_by":    "Printed by",
        "printed_at":    "Printed at",
        "subtotal":      "Subtotal",
        "tax":           "Tax",
        "discount":      "Discount",
        "grand_total":   "Grand Total",
        "prepared_by":   "Prepared by",
        "received_by":   "Received by",
        "item":          "Item",
        "qty":           "Qty",
        "rate":          "Rate",
        "amount":        "Amount",
        "uom":           "UOM",
        "warehouse":     "Warehouse",
        "supplier":      "Supplier",
        "customer":      "Customer",
        "cashier":       "Cashier",
        "payment_method": "Payment method",
        "paid_amount":   "Paid amount",
        "outstanding":   "Outstanding",
        "due_date":      "Due date",
        "invoice":       "Invoice",
        "voucher":       "Voucher",
        "receipt":       "Goods Receipt",
        "from_wh":       "From warehouse",
        "to_wh":         "To warehouse",
        "page":          "Page",
        "page_of":       "of",
        "reference":     "Reference",
        "notes":         "Notes",
        "status":        "Status",
        "opening_time":  "Opening time",
        "closing_time":  "Closing time",
        "expected_cash": "Expected cash",
        "counted_cash":  "Counted cash",
        "variance":      "Variance",
        "sales":         "Sales",
        "invoice_count": "Invoice count",
    },
    "ar": {
        "branch":        "الفرع",
        "phone":         "الهاتف",
        "date":          "التاريخ",
        "time":          "الوقت",
        "created_by":    "أنشأ بواسطة",
        "created_at":    "تاريخ الإنشاء",
        "approved_by":   "اعتمد بواسطة",
        "approved_at":   "تاريخ الاعتماد",
        "printed_by":    "طبع بواسطة",
        "printed_at":    "تاريخ الطباعة",
        "subtotal":      "الإجمالي الفرعي",
        "tax":           "ضريبة",
        "discount":      "خصم",
        "grand_total":   "الإجمالي الكلي",
        "prepared_by":   "أعده",
        "received_by":   "استلمه",
        "item":          "الصنف",
        "qty":           "الكمية",
        "rate":          "السعر",
        "amount":        "المبلغ",
        "uom":           "الوحدة",
        "warehouse":     "المخزن",
        "supplier":      "المورد",
        "customer":      "العميل",
        "cashier":       "الكاشير",
        "payment_method": "طريقة الدفع",
        "paid_amount":   "المبلغ المدفوع",
        "outstanding":   "المتبقي",
        "due_date":      "تاريخ الاستحقاق",
        "invoice":       "الفاتورة",
        "voucher":       "السند",
        "receipt":       "إيصال الاستلام",
        "from_wh":       "من المخزن",
        "to_wh":         "إلى المخزن",
        "page":          "صفحة",
        "page_of":       "من",
        "reference":     "المرجع",
        "notes":         "ملاحظات",
        "status":        "الحالة",
        "opening_time":  "وقت الفتح",
        "closing_time":  "وقت الإغلاق",
        "expected_cash": "النقد المتوقع",
        "counted_cash":  "النقد المعدود",
        "variance":      "الفرق",
        "sales":         "المبيعات",
        "invoice_count": "عدد الفواتير",
    },
}


def _labels_for(lang: str | None) -> dict[str, str]:
    code = (lang or "").split("-")[0].lower()
    return _LABELS.get(code) or _LABELS["en"]


# ── Logo resolution ───────────────────────────────────────────────────────


def _company_logo_url(company: str | None) -> str:
    """Try the company logo first, then a fallback file.

    Frappe's `Company` has a `company_logo` File field. If unset, we look
    at `Letter Head.image` for the company's `default_letter_head`. If
    still empty, fall back to `/files/logo.png` which is shipped in the
    repo's public folder.
    """
    if company:
        logo = frappe.db.get_value("Company", company, "company_logo")
        if logo:
            return logo
        letter_head = frappe.db.get_value("Company", company, "default_letter_head")
        if letter_head:
            image = frappe.db.get_value("Letter Head", letter_head, "image")
            if image:
                return image
    return "/files/logo.png"


# ── Branch / warehouse resolution ─────────────────────────────────────────


def _warehouse_address(warehouse: str | None) -> tuple[str, str]:
    """Return (single-line address string, phone) for a warehouse via its
    linked Address. Best-effort — missing pieces are silently omitted.
    """
    if not warehouse:
        return "", ""
    try:
        # Frappe stores warehouse-address links in Dynamic Link rows on Address.
        rows = frappe.db.sql(
            """
            SELECT a.name
            FROM `tabAddress` a
            INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name
            WHERE dl.link_doctype = 'Warehouse'
                AND dl.link_name = %s
                AND a.disabled = 0
            ORDER BY a.is_primary_address DESC
            LIMIT 1
            """,
            warehouse,
            as_dict=True,
        )
        if not rows:
            return "", ""
        addr = frappe.get_doc("Address", rows[0].name)
        parts = [
            addr.address_line1, addr.address_line2,
            addr.city, addr.state, addr.country,
        ]
        line = ", ".join([p for p in parts if p])
        return line, (addr.phone or "")
    except Exception:
        return "", ""


def _resolve_branch(doc) -> tuple[str, str, str]:
    """(branch_name, address, phone) for the document.

    Resolution order:
        1. doc.set_warehouse        (Purchase Receipt, Stock Entry, …)
        2. items[0].warehouse       (Sales Invoice, POS Invoice)
        3. doc.cost_center
        4. ""
    """
    branch_name = ""
    branch_doctype = "Warehouse"
    if hasattr(doc, "set_warehouse") and doc.get("set_warehouse"):
        branch_name = doc.set_warehouse
    elif doc.get("items"):
        for item in doc.items or []:
            if item.get("warehouse"):
                branch_name = item.warehouse
                break
    if not branch_name and doc.get("cost_center"):
        branch_name = doc.cost_center
        branch_doctype = "Cost Center"

    if not branch_name:
        return "", "", ""

    if branch_doctype == "Warehouse":
        # Prefer the warehouse_name field; fall back to the id.
        nice_name = frappe.db.get_value("Warehouse", branch_name, "warehouse_name") or branch_name
        address, phone = _warehouse_address(branch_name)
        return nice_name, address, phone
    return branch_name, "", ""


# ── Audit extraction ──────────────────────────────────────────────────────


_AUDIT_FIELDS = {
    "Purchase Receipt": "elmahdi_purchase_audit",
    "Purchase Invoice": "elmahdi_purchase_audit",
    "Payment Entry":    "elmahdi_payment_audit",
    "POS Closing Entry": "elmahdi_shift_audit",
}


def _audit_for(doc) -> dict[str, Any]:
    """Pull approver info from the Elmahdi-managed audit JSON if present."""
    out = {
        "created_by": doc.owner if doc.get("owner") else "",
        "created_at": doc.creation if doc.get("creation") else None,
        "approved_by": "",
        "approved_at": None,
    }
    field = _AUDIT_FIELDS.get(doc.doctype)
    if not field or not doc.get(field):
        return out
    try:
        audit = json.loads(doc.get(field))
    except Exception:
        return out
    if isinstance(audit, dict):
        # Find the last 'approved' / 'submitted' event.
        for evt in reversed(audit.get("events") or []):
            if isinstance(evt, dict) and evt.get("action") in ("approved", "submitted", "approve"):
                out["approved_by"] = evt.get("user") or ""
                out["approved_at"] = evt.get("at")
                break
    return out


# ── Public entrypoint used by every Print Format ──────────────────────────


def print_context(doc, lang: str | None = None) -> dict[str, Any]:
    """Build the unified `info` dict consumed by the master macros."""
    lang = lang or getattr(frappe.local, "lang", None) or "en"
    labels = _labels_for(lang)
    company = doc.get("company") if hasattr(doc, "get") else None

    branch_name, branch_address, branch_phone = _resolve_branch(doc)

    return {
        "company_name": (company and frappe.db.get_value("Company", company, "company_name")) or company or "Elmahdi Supermarket",
        "logo_url": _company_logo_url(company),
        "branch_name": branch_name,
        "branch_address": branch_address,
        "branch_phone": branch_phone,
        "audit": _audit_for(doc),
        "printed_by": frappe.session.user,
        "printed_at": frappe.utils.format_datetime(now_datetime()),
        "currency": doc.get("currency") or "EGP",
        "lang": lang,
        "labels": labels,
    }

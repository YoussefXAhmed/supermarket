"""
Shift reconciliation aggregates — server-side (authoritative query, not client guesswork).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt


def _opening_doc(name):
    doc = frappe.get_doc("POS Opening Entry", name)
    if doc.docstatus != 1:
        frappe.throw(_("POS Opening Entry must be submitted"), frappe.ValidationError)
    return doc


def _opening_filters(opening):
    filters = {
        "docstatus": 1,
        "is_pos": 1,
        "pos_profile": opening.pos_profile,
        "posting_date": [">=", opening.period_start_date],
    }
    if opening.user:
        filters["owner"] = opening.user
    if frappe.get_meta("POS Invoice").has_field("pos_opening_entry"):
        filters["pos_opening_entry"] = opening.name
    return filters


def _payment_rows_for_invoice(invoice_name):
    meta = frappe.get_meta("POS Invoice")
    child = meta.get("payment_table") or "payments"
    if not meta.has_field(child):
        return []
    rows = frappe.get_all(
        "Sales Invoice Payment",
        filters={"parent": invoice_name, "parenttype": "POS Invoice"},
        fields=["mode_of_payment", "amount"],
    )
    return rows


@frappe.whitelist()
def get_shift_summary(pos_opening_entry):
    """Aggregated sales/returns/payment mix for an open shift."""
    opening = _opening_doc(pos_opening_entry)
    filters = _opening_filters(opening)

    invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["name", "grand_total", "is_return", "owner", "posting_date", "status"],
    )
    if not invoices and filters.get("pos_opening_entry"):
        filters.pop("pos_opening_entry", None)
        invoices = frappe.get_all(
            "POS Invoice",
            filters=filters,
            fields=["name", "grand_total", "is_return", "owner", "posting_date", "status"],
        )

    void_count = frappe.db.count(
        "POS Invoice",
        {
            "docstatus": 2,
            "is_pos": 1,
            "pos_profile": opening.pos_profile,
            "posting_date": [">=", opening.period_start_date],
            **({"owner": opening.user} if opening.user else {}),
        },
    )

    payment_totals = {}
    sales_total = 0.0
    sales_count = 0
    returns_total = 0.0
    returns_count = 0

    for inv in invoices:
        total = flt(inv.grand_total)
        is_return = bool(inv.is_return) or total < 0
        if is_return:
            returns_total += abs(total)
            returns_count += 1
        else:
            sales_total += total
            sales_count += 1

        pays = _payment_rows_for_invoice(inv.name)
        if not pays:
            pays = [{"mode_of_payment": "Cash", "amount": total}]
        for p in pays:
            mode = p.mode_of_payment or "Cash"
            amt = flt(p.amount)
            signed = -abs(amt) if is_return else amt
            payment_totals[mode] = flt(payment_totals.get(mode, 0)) + signed

    opening_by_mode = {}
    for row in opening.get("balance_details") or []:
        mode = row.mode_of_payment or "Cash"
        opening_by_mode[mode] = flt(opening_by_mode.get(mode, 0)) + flt(row.opening_amount)

    opening_cash = flt(opening_by_mode.get("Cash", 0))
    net_cash = flt(payment_totals.get("Cash", 0))
    expected_cash = opening_cash + net_cash

    return {
        "opening_entry": opening.name,
        "pos_profile": opening.pos_profile,
        "company": opening.company,
        "user": opening.user or opening.owner,
        "period_start_date": str(opening.period_start_date),
        "opening_by_mode": opening_by_mode,
        "payment_totals": payment_totals,
        "sales_total": sales_total,
        "sales_count": sales_count,
        "returns_total": returns_total,
        "returns_count": returns_count,
        "void_count": void_count,
        "invoice_count": sales_count + returns_count,
        "expected_cash": expected_cash,
        "opening_cash": opening_cash,
        "net_cash_from_sales": net_cash,
    }


@frappe.whitelist()
def prepare_closing_entry(pos_opening_entry, actual_cash, notes=None, payment_counts=None):
    """
    Build a POS Closing Entry (draft) with payment_reconciliation rows.
    payment_counts: optional JSON map {mode: closing_amount}
    """
    opening = _opening_doc(pos_opening_entry)
    summary = get_shift_summary(pos_opening_entry)
    actual_cash = flt(actual_cash)
    if actual_cash < 0:
        frappe.throw(_("Counted cash cannot be negative"))

    counts = {}
    if payment_counts:
        if isinstance(payment_counts, str):
            counts = json.loads(payment_counts)
        else:
            counts = payment_counts

    from frappe.utils import today

    closing = frappe.new_doc("POS Closing Entry")
    closing.pos_profile = opening.pos_profile
    closing.company = opening.company
    closing.pos_opening_entry = opening.name
    closing.period_start_date = opening.period_start_date
    closing.period_end_date = today()
    closing.posting_date = today()
    if opening.user:
        closing.user = opening.user

    opening_by_mode = summary.get("opening_by_mode") or {}
    payment_totals = summary.get("payment_totals") or {}
    modes = set(list(opening_by_mode.keys()) + list(payment_totals.keys()) + list(counts.keys()) + ["Cash"])

    for mode in modes:
        opening_amt = flt(opening_by_mode.get(mode, 0))
        expected = opening_amt + flt(payment_totals.get(mode, 0))
        if mode == "Cash":
            closing_amt = actual_cash if "Cash" not in counts else flt(counts.get("Cash", actual_cash))
        else:
            closing_amt = flt(counts.get(mode, expected))
        closing.append(
            "payment_reconciliation",
            {
                "mode_of_payment": mode,
                "opening_amount": opening_amt,
                "expected_amount": expected,
                "closing_amount": closing_amt,
                "difference": flt(closing_amt - expected),
            },
        )

    audit_note = notes or ""
    closing.remarks = audit_note
    closing.insert()

    return {
        "name": closing.name,
        "docstatus": closing.docstatus,
        "expected_cash": summary.get("expected_cash"),
        "actual_cash": actual_cash,
        "variance": flt(actual_cash - flt(summary.get("expected_cash"))),
    }

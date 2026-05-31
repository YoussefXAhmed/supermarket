"""
Shift reconciliation aggregates — server-side (authoritative query, not client guesswork).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, today

from elmahdi.api.erp_submit import native_submit
from elmahdi.api.shift_authorization import assert_may_access_pos_opening_session
from elmahdi.api.spa_authorization import assert_may_repair_shifts


def _opening_doc(name, *, require_submitted=True):
    doc = frappe.get_doc("POS Opening Entry", name)
    if require_submitted and doc.docstatus != 1:
        frappe.throw(_("POS Opening Entry must be submitted"), frappe.ValidationError)
    return doc


def _can_submit_opening(doc):
    if doc.docstatus == 1:
        return False, _("Already submitted")
    if doc.docstatus == 2:
        return False, _("Opening entry is cancelled")
    if not doc.pos_profile or not doc.company:
        return False, _("Missing POS profile or company")
    if not doc.get("balance_details"):
        return False, _("Missing opening balance details")
    return True, None


def _submit_opening_doc(doc):
    """ERPNext submit workflow — never only set docstatus via REST."""
    ok, reason = _can_submit_opening(doc)
    if not ok:
        frappe.throw(reason, frappe.ValidationError)
    return native_submit(doc)


@frappe.whitelist(methods=["POST"])
def open_pos_shift(
    pos_profile,
    company,
    user=None,
    opening_amount=0,
    mode_of_payment="Cash",
    remarks=None,
):
    """
    Create and submit a POS Opening Entry (docstatus=1).
    Cashiers/managers with create+submit permission on POS Opening Entry.
    """
    if not pos_profile or not company:
        frappe.throw(_("POS profile and company are required"), frappe.ValidationError)

    frappe.has_permission("POS Opening Entry", "create", throw=True)

    amount = flt(opening_amount)
    if amount < 0:
        frappe.throw(_("Opening cash cannot be negative"), frappe.ValidationError)

    posting = today()
    doc = frappe.new_doc("POS Opening Entry")
    doc.pos_profile = pos_profile
    doc.company = company
    doc.period_start_date = posting
    doc.posting_date = posting
    if user:
        doc.user = user
    doc.append(
        "balance_details",
        {
            "mode_of_payment": mode_of_payment or "Cash",
            "opening_amount": amount,
        },
    )
    if remarks:
        doc.remarks = remarks

    doc.insert()
    _submit_opening_doc(doc)

    return {
        "name": doc.name,
        "docstatus": doc.docstatus,
        "status": doc.status,
        "pos_profile": doc.pos_profile,
        "company": doc.company,
        "user": doc.user or doc.owner,
    }


@frappe.whitelist(methods=["POST"])
def submit_pos_opening_entry(name):
    """Submit a draft POS Opening Entry if valid (native submit)."""
    if not name:
        frappe.throw(_("Opening entry name is required"), frappe.ValidationError)
    doc = frappe.get_doc("POS Opening Entry", name)
    frappe.has_permission("POS Opening Entry", "submit", doc=doc, throw=True)
    doc = _submit_opening_doc(doc)
    return {"name": doc.name, "docstatus": doc.docstatus, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def repair_draft_opening_entries(dry_run=1):
    """
    Find draft POS Opening Entries (docstatus=0) and submit when valid.
    Restricted to managers / administrators.
    """
    assert_may_repair_shifts()

    if isinstance(dry_run, str):
        dry_run = dry_run.lower() in ("1", "true", "yes")

    names = frappe.get_all(
        "POS Opening Entry",
        filters={"docstatus": 0},
        pluck="name",
        order_by="creation asc",
    )

    results = []
    for name in names:
        row = {"name": name, "action": "skipped"}
        try:
            doc = frappe.get_doc("POS Opening Entry", name)
            ok, reason = _can_submit_opening(doc)
            if not ok:
                row["action"] = "skipped"
                row["message"] = reason
            elif dry_run:
                row["action"] = "would_submit"
            else:
                _submit_opening_doc(doc)
                row["action"] = "submitted"
                row["docstatus"] = doc.docstatus
        except Exception as exc:
            row["action"] = "error"
            row["message"] = str(exc)
        results.append(row)

    return {
        "dry_run": bool(dry_run),
        "found": len(names),
        "results": results,
    }


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
    frappe.has_permission("POS Opening Entry", "read", doc=opening, throw=True)
    assert_may_access_pos_opening_session(opening)
    filters = _opening_filters(opening)

    invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["name", "grand_total", "is_return", "owner", "posting_date", "status"],
    )

    # Void count must be scoped to the same opening entry so that multi-shift-per-day
    # scenarios do not bleed cancelled invoices from a prior shift into this summary.
    void_filters = {
        "docstatus": 2,
        "is_pos": 1,
        "pos_profile": opening.pos_profile,
        "posting_date": [">=", opening.period_start_date],
        **({"owner": opening.user} if opening.user else {}),
    }
    if frappe.get_meta("POS Invoice").has_field("pos_opening_entry"):
        void_filters["pos_opening_entry"] = opening.name
    void_count = frappe.db.count("POS Invoice", void_filters)

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


@frappe.whitelist(methods=["POST"])
def prepare_closing_entry(pos_opening_entry, actual_cash, notes=None, payment_counts=None):
    """
    Build a POS Closing Entry (draft) with payment_reconciliation rows.
    payment_counts: optional JSON map {mode: closing_amount}
    """
    opening = _opening_doc(pos_opening_entry)
    frappe.has_permission("POS Opening Entry", "read", doc=opening, throw=True)
    assert_may_access_pos_opening_session(opening)
    frappe.has_permission("POS Closing Entry", "create", throw=True)
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

    closing = frappe.new_doc("POS Closing Entry")
    closing.pos_profile = opening.pos_profile
    closing.company = opening.company
    closing.pos_opening_entry = opening.name
    closing.period_start_date = opening.period_start_date
    closing.period_end_date = today()
    closing.posting_date = today()
    if opening.user:
        closing.user = opening.user

    # Roll-up shift revenue onto the parent doc directly. We intentionally do
    # NOT append rows to `pos_transactions` — our pipeline consolidates each
    # POS Invoice at sale time (see elmahdi.api.erp_submit.consolidate_pos_invoice),
    # so by the time the shift closes every invoice already has its
    # `consolidated_invoice` field set. ERPNext's standard validate_pos_invoices()
    # rejects already-consolidated rows ("Row #1: POS Invoice is already
    # consolidated"). The parent Currency/Float fields are not recomputed from
    # child rows during validate, so setting them here is safe and gives the
    # Daily Cash Register report a real "Shift revenue" figure.
    invoice_rows = frappe.get_all(
        "POS Invoice",
        filters=_opening_filters(opening),
        fields=["name", "grand_total", "net_total"],
    )
    invoice_names = [row.name for row in invoice_rows]
    total_qty = 0.0
    if invoice_names:
        qty_rows = frappe.get_all(
            "POS Invoice Item",
            filters={"parent": ["in", invoice_names], "parenttype": "POS Invoice"},
            fields=["qty"],
        )
        total_qty = sum(flt(q.qty) for q in qty_rows)

    closing.grand_total = sum(flt(r.grand_total) for r in invoice_rows)
    closing.net_total = sum(flt(r.net_total) for r in invoice_rows)
    closing.total_quantity = total_qty

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

    from elmahdi.api.pos_closing_approval import _cash_variance_pct, _set_audit_fields

    closing.insert()
    _set_audit_fields(closing, pending=True)
    if frappe.db.has_column("POS Closing Entry", "pending_shift_approval"):
        frappe.db.set_value(
            "POS Closing Entry",
            closing.name,
            {
                "pending_shift_approval": 1,
                "variance_percent": _cash_variance_pct(closing),
            },
            update_modified=False,
        )

    return {
        "name": closing.name,
        "docstatus": closing.docstatus,
        "expected_cash": summary.get("expected_cash"),
        "actual_cash": actual_cash,
        "variance": flt(actual_cash - flt(summary.get("expected_cash"))),
    }

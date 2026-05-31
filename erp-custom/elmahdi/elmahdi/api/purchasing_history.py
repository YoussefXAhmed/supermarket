"""
Purchasing History — read-only listing of Purchase Receipts and Purchase
Invoices for the operational purchasing workspace.

Audience: Purchasing Officer (the user who creates draft PRs), Store Manager
(monitors), Accountant (financial side), Administrator.

Endpoints:
- list_purchase_receipt_history(...): all PRs with derived status badge
  (draft / pending_approval / approved / rejected).
- list_purchase_invoice_history(...): all PIs with payment status
  (outstanding / partial / paid).
- get_purchase_receipt_detail(name): drill-down for one PR including approval
  events + payment status of the linked invoice (if any).
- get_purchase_invoice_detail(name): drill-down for one PI including the
  source receipt's approval trail + payment ledger.
- get_purchasing_dashboard_kpis(): aggregate counts for the dashboard.

Authorization: backed by `can_view_purchasing_history` capability — gated at
the endpoint level. Frappe doctype permissions still apply on doc reads;
the purchasing profile already has READ on PR/PI/Items via
rest_resource_policy.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, get_datetime, today

from elmahdi.api.spa_authorization import has_cap
from elmahdi.api.purchasing import (
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_SUBMITTED,
    STATUS_DRAFT,
    STATUS_PENDING_MANAGER,
    STATUS_PENDING_ACCOUNTANT,
    _has_custom_field,
    _parse_audit,
)


# ── authorization ────────────────────────────────────────────────────────────


def _assert_may_view_purchasing_history() -> None:
    if not has_cap("can_view_purchasing_history"):
        frappe.throw(
            _("You do not have permission to view purchasing history."),
            frappe.PermissionError,
        )


# ── status helpers ───────────────────────────────────────────────────────────

PR_STATUS_DRAFT = "draft"
PR_STATUS_PENDING = "pending_approval"
PR_STATUS_APPROVED = "approved"
PR_STATUS_REJECTED = "rejected"

PI_STATUS_OUTSTANDING = "outstanding"
PI_STATUS_PARTIAL = "partial"
PI_STATUS_PAID = "paid"


def _pr_decision_status(doc, audit: dict) -> str:
    """Resolve a normalized PR status for the history view."""
    raw = (doc.get("approval_status") or (audit or {}).get("approval_status") or "").strip()
    docstatus = cint(doc.docstatus)
    if raw == STATUS_REJECTED or docstatus == 2:
        return PR_STATUS_REJECTED
    if raw in (STATUS_APPROVED, STATUS_SUBMITTED) or docstatus == 1:
        return PR_STATUS_APPROVED
    if raw in (STATUS_PENDING_MANAGER, STATUS_PENDING_ACCOUNTANT):
        return PR_STATUS_PENDING
    if cint(doc.get("pending_purchase_approval")):
        return PR_STATUS_PENDING
    return PR_STATUS_DRAFT


def _pi_payment_status(doc) -> str:
    """Normalize ERPNext PI status into outstanding / partial / paid."""
    status = (doc.get("status") or "").strip()
    if status == "Paid":
        return PI_STATUS_PAID
    if status == "Partly Paid":
        return PI_STATUS_PARTIAL
    if status in ("Unpaid", "Overdue", "Return", "Submitted"):
        # Submitted-but-no-payments lands here too.
        outstanding = flt(doc.outstanding_amount)
        if outstanding <= 0.0049:
            return PI_STATUS_PAID
        if outstanding < flt(doc.grand_total) - 0.0049:
            return PI_STATUS_PARTIAL
        return PI_STATUS_OUTSTANDING
    # Cancelled / Draft / Credit Note Issued / unknown → leave as outstanding so
    # it surfaces by default rather than being silently filtered out.
    return PI_STATUS_OUTSTANDING


# ── filter builders ──────────────────────────────────────────────────────────


def _pr_status_filters(status: str) -> list[Any]:
    """Translate the public PR status into a `frappe.get_all` filter set."""
    s = (status or "").strip().lower()
    if s == PR_STATUS_DRAFT:
        # Draft: docstatus=0 AND (no approval_status, or 'draft', or pending-empty).
        return [
            ["docstatus", "=", 0],
            ["approval_status", "in", [STATUS_DRAFT, "", None]],
            ["pending_purchase_approval", "=", 0],
        ]
    if s == PR_STATUS_PENDING:
        return [
            ["docstatus", "=", 0],
            ["approval_status", "in", [STATUS_PENDING_MANAGER, STATUS_PENDING_ACCOUNTANT]],
        ]
    if s == PR_STATUS_APPROVED:
        return [
            ["docstatus", "=", 1],
            ["approval_status", "in", [STATUS_APPROVED, STATUS_SUBMITTED]],
        ]
    if s == PR_STATUS_REJECTED:
        return [["approval_status", "=", STATUS_REJECTED]]
    return []


def _pi_status_filters(status: str) -> list[Any]:
    s = (status or "").strip().lower()
    if s == PI_STATUS_OUTSTANDING:
        return [["status", "in", ["Unpaid", "Overdue"]], ["docstatus", "=", 1]]
    if s == PI_STATUS_PARTIAL:
        return [["status", "=", "Partly Paid"], ["docstatus", "=", 1]]
    if s == PI_STATUS_PAID:
        return [["status", "=", "Paid"], ["docstatus", "=", 1]]
    return [["docstatus", "in", [0, 1]]]


def _add_common_filters(
    filters: list[Any],
    *,
    supplier: str = "",
    from_date: str = "",
    to_date: str = "",
    name: str = "",
) -> list[Any]:
    if supplier:
        filters.append(["supplier", "=", supplier])
    if name:
        filters.append(["name", "like", f"%{name}%"])
    if from_date:
        filters.append(["posting_date", ">=", str(getdate(from_date))])
    if to_date:
        filters.append(["posting_date", "<=", str(getdate(to_date))])
    return filters


# ── PR list / detail ─────────────────────────────────────────────────────────


def _payment_status_for_receipt(pr_name: str) -> dict:
    """Look up payment status of the PI linked to this receipt (if any)."""
    rows = frappe.db.sql(
        """
        SELECT DISTINCT pi.name, pi.status, pi.outstanding_amount, pi.grand_total
        FROM `tabPurchase Invoice Item` pii
        JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
        WHERE pii.purchase_receipt = %s AND pi.docstatus IN (0, 1)
        """,
        (pr_name,),
        as_dict=True,
    )
    if not rows:
        return {"invoice": None, "status": None, "outstanding": 0.0, "grand_total": 0.0}
    row = rows[0]
    return {
        "invoice": row.name,
        "status": _pi_payment_status(row),
        "outstanding": flt(row.outstanding_amount),
        "grand_total": flt(row.grand_total),
    }


def _serialize_pr_row(doc, audit: dict) -> dict:
    status = _pr_decision_status(doc, audit)
    decided_by = ""
    decided_at = ""
    if status == PR_STATUS_REJECTED:
        decided_by = (audit or {}).get("rejected_by") or ""
        decided_at = (audit or {}).get("rejected_at") or ""
    elif status == PR_STATUS_APPROVED:
        decided_by = doc.get("approved_by") or (audit or {}).get("approved_by") or ""
        decided_at = doc.get("approved_at") or (audit or {}).get("approved_at") or ""

    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name or doc.supplier,
        "warehouse": doc.set_warehouse,
        "posting_date": str(doc.posting_date) if doc.posting_date else "",
        "creation": str(doc.creation) if doc.creation else "",
        "modified": str(doc.modified) if doc.modified else "",
        "grand_total": flt(doc.grand_total),
        "currency": doc.currency or "EGP",
        "docstatus": cint(doc.docstatus),
        "status": status,
        "approval_status": doc.get("approval_status") or "",
        "approval_level": doc.get("purchase_approval_level") or (audit or {}).get("approval_level") or "",
        "approval_role": doc.get("approval_role") or "",
        "decided_by": decided_by,
        "decided_at": str(decided_at) if decided_at else "",
        "decision_notes": doc.get("approval_reason") or (audit or {}).get("approval_reason") or "",
        "requested_by": (audit or {}).get("requested_by") or doc.owner,
    }


@frappe.whitelist()
def list_purchase_receipt_history(
    status: str = "all",
    supplier: str = "",
    from_date: str = "",
    to_date: str = "",
    name: str = "",
    limit: int = 200,
) -> dict:
    """All Purchase Receipts visible to the purchasing workspace, with
    a normalized status badge (`draft` / `pending_approval` / `approved`
    / `rejected`)."""
    _assert_may_view_purchasing_history()

    filters: list[Any] = list(_pr_status_filters(status))
    if not filters and (status or "").strip().lower() in ("", "all"):
        # No status restriction; still cap docstatus so cancelled-only noise is
        # last (kept under "rejected" path).
        filters.append(["docstatus", "in", [0, 1, 2]])

    _add_common_filters(filters, supplier=supplier, from_date=from_date, to_date=to_date, name=name)

    rows = frappe.get_all(
        "Purchase Receipt",
        filters=filters,
        fields=[
            "name",
            "supplier",
            "supplier_name",
            "set_warehouse",
            "posting_date",
            "creation",
            "modified",
            "grand_total",
            "currency",
            "docstatus",
            "owner",
            "approval_status",
            "purchase_approval_level",
            "approval_role",
            "approved_by",
            "approved_at",
            "approval_reason",
            "pending_purchase_approval",
        ],
        order_by="modified desc",
        limit_page_length=int(limit or 200),
    )

    out = []
    for row in rows:
        doc = frappe.get_doc("Purchase Receipt", row.name)
        audit = _parse_audit(doc) or {}
        out.append(_serialize_pr_row(doc, audit))

    return {"rows": out, "count": len(out)}


@frappe.whitelist()
def get_purchase_receipt_detail(name: str) -> dict:
    """Full receipt drill-down: supplier + items + approval audit + payment."""
    _assert_may_view_purchasing_history()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)

    doc = frappe.get_doc("Purchase Receipt", name)
    audit = _parse_audit(doc) or {}
    status = _pr_decision_status(doc, audit)

    items = []
    for line in doc.items or []:
        items.append({
            "item_code": line.item_code,
            "item_name": line.item_name,
            "uom": line.uom,
            "qty": flt(line.qty),
            "rate": flt(line.rate),
            "amount": flt(line.amount),
            "warehouse": line.warehouse,
        })

    supplier_info: dict = {}
    if doc.supplier:
        try:
            supp = frappe.get_doc("Supplier", doc.supplier)
            supplier_info = {
                "name": supp.name,
                "supplier_name": supp.supplier_name,
                "supplier_type": supp.supplier_type,
                "country": supp.country,
                "default_currency": supp.default_currency,
                "mobile_no": getattr(supp, "mobile_no", "") or "",
                "email_id": getattr(supp, "email_id", "") or "",
            }
        except Exception:
            supplier_info = {"name": doc.supplier, "supplier_name": doc.supplier_name or doc.supplier}

    events = []
    for evt in (audit or {}).get("events") or []:
        if not isinstance(evt, dict):
            continue
        events.append({
            "action": evt.get("action") or "",
            "user": evt.get("user") or "",
            "at": str(evt.get("at") or ""),
            "notes": evt.get("notes") or "",
            "item_code": evt.get("item_code") or "",
            "previous_rate": flt(evt.get("previous_rate")) if evt.get("previous_rate") is not None else None,
            "rate": flt(evt.get("rate")) if evt.get("rate") is not None else None,
        })

    payment = _payment_status_for_receipt(doc.name)

    return {
        "name": doc.name,
        "status": status,
        "approval_status": doc.get("approval_status") or "",
        "approval_level": doc.get("purchase_approval_level") or (audit or {}).get("approval_level") or "",
        "docstatus": cint(doc.docstatus),
        "supplier": supplier_info,
        "warehouse": doc.set_warehouse,
        "posting_date": str(doc.posting_date) if doc.posting_date else "",
        "creation": str(doc.creation) if doc.creation else "",
        "modified": str(doc.modified) if doc.modified else "",
        "currency": doc.currency or "EGP",
        "grand_total": flt(doc.grand_total),
        "total": flt(doc.total),
        "total_taxes_and_charges": flt(doc.total_taxes_and_charges),
        "items": items,
        "events": events,
        "remarks": doc.remarks or "",
        "approved_by": doc.get("approved_by") or (audit or {}).get("approved_by") or "",
        "approved_at": str(doc.get("approved_at") or (audit or {}).get("approved_at") or ""),
        "decision_notes": doc.get("approval_reason") or (audit or {}).get("approval_reason") or "",
        "requested_by": (audit or {}).get("requested_by") or doc.owner,
        "payment": payment,
    }


# ── PI list / detail ─────────────────────────────────────────────────────────


def _serialize_pi_row(doc) -> dict:
    payment_status = _pi_payment_status(doc)
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "supplier_name": doc.supplier_name or doc.supplier,
        "posting_date": str(doc.posting_date) if doc.posting_date else "",
        "due_date": str(doc.due_date) if doc.due_date else "",
        "creation": str(doc.creation) if doc.creation else "",
        "modified": str(doc.modified) if doc.modified else "",
        "grand_total": flt(doc.grand_total),
        "outstanding_amount": flt(doc.outstanding_amount),
        "paid_amount": flt(doc.grand_total) - flt(doc.outstanding_amount),
        "currency": doc.currency or "EGP",
        "docstatus": cint(doc.docstatus),
        "erp_status": doc.status or "",
        "status": payment_status,
        "paid_pct": (
            round((flt(doc.grand_total) - flt(doc.outstanding_amount)) / flt(doc.grand_total) * 100, 2)
            if flt(doc.grand_total) else 0.0
        ),
    }


@frappe.whitelist()
def list_purchase_invoice_history(
    status: str = "all",
    supplier: str = "",
    from_date: str = "",
    to_date: str = "",
    name: str = "",
    limit: int = 200,
) -> dict:
    """All Purchase Invoices for the purchasing workspace with normalized
    payment status (`outstanding` / `partial` / `paid`)."""
    _assert_may_view_purchasing_history()

    filters = list(_pi_status_filters(status))
    _add_common_filters(filters, supplier=supplier, from_date=from_date, to_date=to_date, name=name)

    rows = frappe.get_all(
        "Purchase Invoice",
        filters=filters,
        fields=[
            "name",
            "supplier",
            "supplier_name",
            "posting_date",
            "due_date",
            "creation",
            "modified",
            "grand_total",
            "outstanding_amount",
            "currency",
            "docstatus",
            "status",
        ],
        order_by="modified desc",
        limit_page_length=int(limit or 200),
    )

    out = []
    for row in rows:
        doc = frappe.get_doc("Purchase Invoice", row.name)
        out.append(_serialize_pi_row(doc))
    return {"rows": out, "count": len(out)}


@frappe.whitelist()
def get_purchase_invoice_detail(name: str) -> dict:
    """Full invoice drill-down: supplier + items + linked PR approval + payment."""
    _assert_may_view_purchasing_history()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)

    doc = frappe.get_doc("Purchase Invoice", name)

    items = []
    receipt_names: set[str] = set()
    for line in doc.items or []:
        items.append({
            "item_code": line.item_code,
            "item_name": line.item_name,
            "uom": line.uom,
            "qty": flt(line.qty),
            "rate": flt(line.rate),
            "amount": flt(line.amount),
            "purchase_receipt": line.purchase_receipt,
        })
        if line.purchase_receipt:
            receipt_names.add(line.purchase_receipt)

    supplier_info: dict = {}
    if doc.supplier:
        try:
            supp = frappe.get_doc("Supplier", doc.supplier)
            supplier_info = {
                "name": supp.name,
                "supplier_name": supp.supplier_name,
                "supplier_type": supp.supplier_type,
                "country": supp.country,
                "default_currency": supp.default_currency,
                "mobile_no": getattr(supp, "mobile_no", "") or "",
                "email_id": getattr(supp, "email_id", "") or "",
            }
        except Exception:
            supplier_info = {"name": doc.supplier, "supplier_name": doc.supplier_name or doc.supplier}

    # Approval trail from source PR(s).
    receipts = []
    for rname in sorted(receipt_names):
        try:
            pr = frappe.get_doc("Purchase Receipt", rname)
            audit = _parse_audit(pr) or {}
            receipts.append({
                "name": pr.name,
                "status": _pr_decision_status(pr, audit),
                "approved_by": pr.get("approved_by") or (audit or {}).get("approved_by") or "",
                "approved_at": str(pr.get("approved_at") or (audit or {}).get("approved_at") or ""),
                "decision_notes": pr.get("approval_reason") or (audit or {}).get("approval_reason") or "",
                "events": [
                    {
                        "action": evt.get("action") or "",
                        "user": evt.get("user") or "",
                        "at": str(evt.get("at") or ""),
                        "notes": evt.get("notes") or "",
                    }
                    for evt in (audit or {}).get("events") or []
                    if isinstance(evt, dict)
                ],
            })
        except Exception:
            receipts.append({"name": rname, "status": "unknown"})

    # Payment ledger — Payment Entry References pointing at this PI.
    payment_rows = frappe.db.sql(
        """
        SELECT
            pe.name AS payment_entry,
            pe.posting_date,
            pe.paid_amount,
            pe.docstatus,
            per.allocated_amount,
            per.account
        FROM `tabPayment Entry Reference` per
        JOIN `tabPayment Entry` pe ON pe.name = per.parent
        WHERE per.reference_doctype = 'Purchase Invoice'
          AND per.reference_name = %s
          AND pe.docstatus = 1
        ORDER BY pe.posting_date DESC
        """,
        (doc.name,),
        as_dict=True,
    )

    payment_status = _pi_payment_status(doc)
    return {
        "name": doc.name,
        "supplier": supplier_info,
        "posting_date": str(doc.posting_date) if doc.posting_date else "",
        "due_date": str(doc.due_date) if doc.due_date else "",
        "creation": str(doc.creation) if doc.creation else "",
        "currency": doc.currency or "EGP",
        "grand_total": flt(doc.grand_total),
        "outstanding_amount": flt(doc.outstanding_amount),
        "paid_amount": flt(doc.grand_total) - flt(doc.outstanding_amount),
        "paid_pct": (
            round((flt(doc.grand_total) - flt(doc.outstanding_amount)) / flt(doc.grand_total) * 100, 2)
            if flt(doc.grand_total) else 0.0
        ),
        "docstatus": cint(doc.docstatus),
        "erp_status": doc.status or "",
        "status": payment_status,
        "items": items,
        "receipts": receipts,
        "payments": [
            {
                "name": p.payment_entry,
                "posting_date": str(p.posting_date) if p.posting_date else "",
                "allocated_amount": flt(p.allocated_amount),
                "paid_amount": flt(p.paid_amount),
                "account": p.account or "",
            }
            for p in payment_rows
        ],
    }


# ── dashboard KPIs ───────────────────────────────────────────────────────────


@frappe.whitelist()
def get_purchasing_dashboard_kpis() -> dict:
    """Aggregate counts for the purchasing dashboard. Cheap aggregates only."""
    _assert_may_view_purchasing_history()

    def count_pr(status: str) -> dict:
        f = list(_pr_status_filters(status))
        rows = frappe.get_all(
            "Purchase Receipt", filters=f, fields=["name", "grand_total"], limit_page_length=0
        )
        return {"count": len(rows), "value": sum(flt(r.grand_total) for r in rows)}

    def count_pi(status: str) -> dict:
        f = list(_pi_status_filters(status))
        rows = frappe.get_all(
            "Purchase Invoice",
            filters=f,
            fields=["name", "grand_total", "outstanding_amount"],
            limit_page_length=0,
        )
        if status == PI_STATUS_OUTSTANDING:
            value = sum(flt(r.outstanding_amount) for r in rows)
        elif status == PI_STATUS_PARTIAL:
            value = sum(flt(r.outstanding_amount) for r in rows)
        elif status == PI_STATUS_PAID:
            value = sum(flt(r.grand_total) for r in rows)
        else:
            value = sum(flt(r.grand_total) for r in rows)
        return {"count": len(rows), "value": value}

    return {
        "pr_pending": count_pr(PR_STATUS_PENDING),
        "pr_approved": count_pr(PR_STATUS_APPROVED),
        "pr_rejected": count_pr(PR_STATUS_REJECTED),
        "pr_draft": count_pr(PR_STATUS_DRAFT),
        "pi_outstanding": count_pi(PI_STATUS_OUTSTANDING),
        "pi_partial": count_pi(PI_STATUS_PARTIAL),
        "pi_paid": count_pi(PI_STATUS_PAID),
        "as_of": today(),
    }

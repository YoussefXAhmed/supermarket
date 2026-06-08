"""
Purchase approval history — read-only audit listing for Store Manager and
Administrator. Returns approved + rejected purchase receipts with their
approver/rejector, timestamps, and approval comments parsed from the
purchase_rate_audit JSON.

Counterpart of `list_pending_purchase_approvals` in purchasing.py, but for
historical (already-decided) records.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, get_datetime

from elmahdi.api.purchase_authorization import assert_may_view_purchase_approvals
from elmahdi.api.purchasing import (
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_SUBMITTED,
    _has_custom_field,
    _parse_audit,
)


HISTORY_STATUSES = {
    "approved": [STATUS_APPROVED, STATUS_SUBMITTED],
    "rejected": [STATUS_REJECTED],
}


def _audit_event_notes(audit: dict, action: str) -> str:
    """Pull the most recent notes for a given action from the audit events."""
    if not isinstance(audit, dict):
        return ""
    for evt in reversed(audit.get("events") or []):
        if (evt or {}).get("action") == action and (evt or {}).get("notes"):
            return str(evt["notes"])
    return ""


def _decision_meta(doc, audit: dict) -> dict:
    """Resolve (decided_by, decided_at, notes) for the decision, status-aware."""
    status = (doc.get("approval_status") or audit.get("approval_status") or "").strip()
    if status == STATUS_REJECTED:
        decided_by = audit.get("rejected_by") or ""
        decided_at = audit.get("rejected_at") or ""
        notes = audit.get("reject_notes") or _audit_event_notes(audit, "rejected")
        decision = "rejected"
    else:
        # Approved + submitted both count as a positive decision for history.
        decided_by = doc.get("approved_by") or audit.get("approved_by") or ""
        decided_at = doc.get("approved_at") or audit.get("approved_at") or ""
        notes = (
            doc.get("approval_reason")
            or audit.get("approval_reason")
            or _audit_event_notes(audit, "approve_submit")
        )
        decision = "approved"
    return {
        "decision": decision,
        "decided_by": decided_by,
        "decided_at": str(decided_at) if decided_at else "",
        "decision_notes": notes or "",
    }


def _resolve_status_filter(status: str) -> list[str] | None:
    s = (status or "").strip().lower()
    if not s or s == "all":
        return None
    if s in HISTORY_STATUSES:
        return HISTORY_STATUSES[s]
    return None


def _build_filters(
    status: str = "",
    supplier: str = "",
    from_date: str = "",
    to_date: str = "",
    name: str = "",
) -> list[Any]:
    """Compose the frappe.get_all filter list. Status filter selects approved/
    rejected/all; rejected receipts stay at docstatus=0, approved sit at 1."""
    f: list[Any] = []
    status_codes = _resolve_status_filter(status)
    if status_codes:
        if _has_custom_field("approval_status"):
            f.append(["approval_status", "in", status_codes])
        # Match docstatus too so submitted approvals always come through.
        if status_codes == HISTORY_STATUSES["approved"]:
            f.append(["docstatus", "in", [0, 1]])
    else:
        if _has_custom_field("approval_status"):
            f.append([
                "approval_status",
                "in",
                HISTORY_STATUSES["approved"] + HISTORY_STATUSES["rejected"],
            ])

    if supplier:
        f.append(["supplier", "=", supplier])
    if name:
        f.append(["name", "like", f"%{name}%"])
    if from_date:
        f.append(["modified", ">=", str(getdate(from_date))])
    if to_date:
        # Use the *day after* so the range is inclusive of `to_date`.
        f.append(["modified", "<=", f"{getdate(to_date)} 23:59:59"])
    return f


def _serialize_row(doc, audit: dict) -> dict:
    meta = _decision_meta(doc, audit)
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
        "approval_status": doc.get("approval_status") or audit.get("approval_status") or "",
        "approval_level": doc.get("purchase_approval_level") or audit.get("approval_level") or "manager",
        "approval_role": doc.get("approval_role") or audit.get("approval_role") or "",
        "variance_percent": flt(doc.get("variance_percent")),
        "decision": meta["decision"],
        "decided_by": meta["decided_by"],
        "decided_at": meta["decided_at"],
        "decision_notes": meta["decision_notes"],
        "requested_by": audit.get("requested_by") or doc.owner,
    }


@frappe.whitelist()
def list_purchase_approval_history(
    status: str = "all",
    supplier: str = "",
    from_date: str = "",
    to_date: str = "",
    name: str = "",
    limit: int = 200,
) -> dict:
    """List approved/rejected purchase receipts with audit metadata."""
    assert_may_view_purchase_approvals()

    filters = _build_filters(status, supplier, from_date, to_date, name)

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
            "variance_percent",
        ],
        order_by="modified desc",
        limit_page_length=int(limit or 200),
    )

    out = []
    totals = {"approved_count": 0, "rejected_count": 0, "approved_value": 0.0, "rejected_value": 0.0}
    month_start = getdate().replace(day=1)
    month_totals = {"approved_count": 0, "rejected_count": 0, "approved_value": 0.0, "rejected_value": 0.0}

    for row in rows:
        doc = frappe.get_doc("Purchase Receipt", row.name)
        audit = _parse_audit(doc) or {}
        serialized = _serialize_row(doc, audit)
        out.append(serialized)

        amount = flt(serialized["grand_total"])
        decision = serialized["decision"]
        if decision == "approved":
            totals["approved_count"] += 1
            totals["approved_value"] += amount
        elif decision == "rejected":
            totals["rejected_count"] += 1
            totals["rejected_value"] += amount

        decided_dt = None
        if serialized["decided_at"]:
            try:
                decided_dt = get_datetime(serialized["decided_at"]).date()
            except Exception:
                decided_dt = None
        decided_dt = decided_dt or (get_datetime(serialized["modified"]).date() if serialized["modified"] else None)
        if decided_dt and decided_dt >= month_start:
            if decision == "approved":
                month_totals["approved_count"] += 1
                month_totals["approved_value"] += amount
            elif decision == "rejected":
                month_totals["rejected_count"] += 1
                month_totals["rejected_value"] += amount

    return {
        "rows": out,
        "totals": totals,
        "month_totals": month_totals,
        "filters_echo": {
            "status": status,
            "supplier": supplier,
            "from_date": from_date,
            "to_date": to_date,
            "name": name,
            "limit": int(limit or 200),
        },
    }


@frappe.whitelist()
def get_purchase_approval_detail(name: str) -> dict:
    """Drill-down view: full receipt + items + audit metadata for the
    history modal. Read-only — no mutation."""
    assert_may_view_purchase_approvals()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)

    doc = frappe.get_doc("Purchase Receipt", name)
    audit = _parse_audit(doc) or {}
    meta = _decision_meta(doc, audit)

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

    supplier_info = {}
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
    for evt in audit.get("events") or []:
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

    taxes = [
        {
            "description": (tx.description or tx.account_head or "").strip(),
            "account_head": tx.account_head,
            "charge_type": tx.charge_type,
            "rate": flt(tx.rate),
            "tax_amount": flt(tx.tax_amount),
            "add_deduct": (getattr(tx, "add_deduct_tax", None) or "Add"),
        }
        for tx in (doc.get("taxes") or [])
        if flt(tx.tax_amount) != 0
    ]

    return {
        "name": doc.name,
        "supplier": supplier_info,
        "warehouse": doc.set_warehouse,
        "posting_date": str(doc.posting_date) if doc.posting_date else "",
        "creation": str(doc.creation) if doc.creation else "",
        "modified": str(doc.modified) if doc.modified else "",
        "currency": doc.currency or "EGP",
        "net_total": flt(doc.net_total),
        "grand_total": flt(doc.grand_total),
        "total_taxes_and_charges": flt(doc.total_taxes_and_charges),
        "discount_amount": flt(doc.discount_amount),
        "total": flt(doc.total),
        "taxes": taxes,
        "docstatus": cint(doc.docstatus),
        "approval_status": doc.get("approval_status") or audit.get("approval_status") or "",
        "approval_level": doc.get("purchase_approval_level") or audit.get("approval_level") or "manager",
        "decision": meta["decision"],
        "decided_by": meta["decided_by"],
        "decided_at": meta["decided_at"],
        "decision_notes": meta["decision_notes"],
        "requested_by": audit.get("requested_by") or doc.owner,
        "items": items,
        "events": events,
        "remarks": doc.remarks or "",
    }

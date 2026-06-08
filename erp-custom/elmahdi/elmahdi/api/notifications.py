"""
Notification Center — persistent, per-user notifications via Frappe's
built-in `Notification Log` doctype. No new doctype needed.

Used by:
- Purchase Receipt approval flow (notify managers when draft submitted;
  notify purchaser when approved/rejected)
- Shift close flow (notify accountant on draft; notify cashier on
  approval/rejection)
- Supplier payment (notify purchaser when payment recorded)
- Goods received (notify purchaser when receipt approved)

Each notification persists across page reloads. SPA polls
`count_unread()` for the bell badge.
"""

from __future__ import annotations

from typing import Iterable

import frappe
from frappe import _


# ── helpers ─────────────────────────────────────────────────────────────────


def _users_with_role_profile(profile_name: str) -> list[str]:
    """All enabled users on a given role profile."""
    return frappe.get_all(
        "User",
        filters={"role_profile_name": profile_name, "enabled": 1},
        pluck="name",
    )


def _push(
    *,
    for_users: Iterable[str],
    subject: str,
    body: str = "",
    doc_type: str | None = None,
    doc_name: str | None = None,
    notification_type: str = "Alert",
) -> int:
    """Insert one Notification Log per recipient. Returns count delivered."""
    count = 0
    for user in set(filter(None, for_users)):
        if user in ("Administrator", "Guest"):
            continue
        try:
            row = frappe.new_doc("Notification Log")
            row.for_user = user
            row.subject = subject[:140]
            row.email_content = body
            row.type = notification_type  # Alert / Mention / Energy Point / Share
            if doc_type:
                row.document_type = doc_type
            if doc_name:
                row.document_name = doc_name
            row.insert(ignore_permissions=True)
            count += 1
        except Exception:
            frappe.log_error(
                title=f"Notification push failed for {user}",
                message=frappe.get_traceback(),
            )
    return count


# ── public notification publishers (called from approve/reject flows) ───────


def notify_purchase_pending(receipt_name: str, supplier: str) -> None:
    """A purchasing officer submitted a draft PR; managers should review."""
    managers = _users_with_role_profile("Elmahdi Store Manager")
    _push(
        for_users=managers,
        subject=_("Goods Receipt {0} awaiting approval — {1}").format(receipt_name, supplier),
        doc_type="Purchase Receipt",
        doc_name=receipt_name,
    )


def notify_purchase_decision(
    receipt_name: str,
    requester: str,
    decision: str,
    notes: str = "",
) -> None:
    """Notify the original purchaser of approve/reject decision."""
    if not requester:
        return
    label = _("approved") if decision == "approved" else _("rejected")
    _push(
        for_users=[requester],
        subject=_("Goods Receipt {0} {1}").format(receipt_name, label),
        body=notes,
        doc_type="Purchase Receipt",
        doc_name=receipt_name,
    )


def notify_shift_close_pending(closing_name: str, cashier: str) -> None:
    """Cashier submitted a draft closing; accountants should review."""
    accountants = _users_with_role_profile("Elmahdi Accountant")
    _push(
        for_users=accountants,
        subject=_("Shift closing {0} awaiting approval — {1}").format(closing_name, cashier),
        doc_type="POS Closing Entry",
        doc_name=closing_name,
    )


def notify_shift_close_decision(
    closing_name: str,
    cashier: str,
    decision: str,
    notes: str = "",
) -> None:
    if not cashier:
        return
    label = _("approved") if decision == "approved" else _("rejected")
    _push(
        for_users=[cashier],
        subject=_("Shift closing {0} {1}").format(closing_name, label),
        body=notes,
        doc_type="POS Closing Entry",
        doc_name=closing_name,
    )


def notify_supplier_payment(payment_name: str, supplier: str, amount: float, creator: str) -> None:
    """Notify the purchaser when a bill they raised is paid."""
    purchasing = _users_with_role_profile("Elmahdi Purchasing Officer")
    _push(
        for_users=set(purchasing) | {creator},
        subject=_("Supplier payment {0} recorded — {1} EGP {2}").format(
            payment_name, supplier, f"{amount:.2f}"
        ),
        doc_type="Payment Entry",
        doc_name=payment_name,
    )


def notify_finance_invoice_pending(
    invoice_name: str,
    supplier: str,
    amount: float,
    receipt_name: str = "",
) -> None:
    """A Purchase Invoice has just been auto-created from an approved Goods
    Receipt and is now awaiting payment by Finance. Sends to all Accountants.
    """
    accountants = _users_with_role_profile("Elmahdi Accountant")
    if not accountants:
        return
    receipt_hint = _(" (Goods Receipt {0})").format(receipt_name) if receipt_name else ""
    _push(
        for_users=accountants,
        subject=_("New Supplier Invoice Pending — {0} · EGP {1}{2}").format(
            supplier, f"{amount:.2f}", receipt_hint,
        ),
        body=_("Invoice {0} is ready for review and payment.").format(invoice_name),
        doc_type="Purchase Invoice",
        doc_name=invoice_name,
    )


def notify_invoice_overdue(
    invoice_name: str,
    supplier: str,
    outstanding: float,
    days_overdue: int,
) -> None:
    """Daily scheduler notification for a newly-overdue Purchase Invoice."""
    accountants = _users_with_role_profile("Elmahdi Accountant")
    if not accountants:
        return
    _push(
        for_users=accountants,
        subject=_("Supplier Invoice {0} is {1} day(s) overdue — {2} · EGP {3}").format(
            invoice_name, days_overdue, supplier, f"{outstanding:.2f}",
        ),
        doc_type="Purchase Invoice",
        doc_name=invoice_name,
    )


# ── whitelisted SPA endpoints ───────────────────────────────────────────────


def _category_for(doctype: str | None) -> str:
    """Map a Frappe doctype to a coarse category used by the SPA filter UI.

    Categories are stable user-facing buckets — they map many-to-one to
    doctypes so that new notification sources slot into an existing bucket
    without changing the frontend.
    """
    if not doctype:
        return "system"
    d = (doctype or "").strip()
    # Approvals / purchasing share Purchase Receipt — we route by *subject*
    # in the frontend if needed, but coarse mapping keeps the backend simple.
    if d == "Purchase Receipt":
        return "approvals"
    if d == "Purchase Invoice":
        return "finance"
    if d == "Payment Entry":
        return "finance"
    if d == "POS Closing Entry":
        return "shifts"
    if d == "POS Opening Entry":
        return "shifts"
    if d == "POS Invoice":
        return "pos"
    if d == "Sales Invoice":
        return "pos"
    if d in ("Stock Entry", "Stock Reconciliation", "Item", "Bin"):
        return "inventory"
    if d in ("Supplier", "Purchase Order"):
        return "purchasing"
    return "system"


@frappe.whitelist()
def list_my_notifications(unread_only: int = 0, limit: int = 30) -> dict:
    """Notifications for the logged-in user. Newest first."""
    filters: dict = {"for_user": frappe.session.user}
    if int(unread_only or 0):
        filters["read"] = 0
    rows = frappe.get_all(
        "Notification Log",
        filters=filters,
        fields=["name", "subject", "type", "document_type", "document_name", "read", "creation"],
        order_by="creation desc",
        limit_page_length=int(limit or 30),
    )
    for r in rows:
        r["category"] = _category_for(r.get("document_type"))
        r["creation"] = str(r.get("creation")) if r.get("creation") else None
    return {"rows": rows, "count": len(rows)}


@frappe.whitelist()
def count_unread() -> dict:
    n = frappe.db.count("Notification Log", {"for_user": frappe.session.user, "read": 0})
    return {"unread": int(n)}


@frappe.whitelist(methods=["POST"])
def mark_read(name: str) -> dict:
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    owner = frappe.db.get_value("Notification Log", name, "for_user")
    if owner != frappe.session.user:
        frappe.throw(_("Not your notification."), frappe.PermissionError)
    frappe.db.set_value("Notification Log", name, "read", 1, update_modified=False)
    return {"name": name, "read": 1}


@frappe.whitelist(methods=["POST"])
def mark_all_read() -> dict:
    user = frappe.session.user
    names = frappe.get_all("Notification Log", filters={"for_user": user, "read": 0}, pluck="name")
    for n in names:
        frappe.db.set_value("Notification Log", n, "read", 1, update_modified=False)
    return {"marked": len(names)}

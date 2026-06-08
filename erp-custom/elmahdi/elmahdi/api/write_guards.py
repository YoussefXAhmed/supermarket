"""
Fail-closed validate hooks for doctypes that are written from the SPA.

Closes the production-audit blocker: Payment Entry / Purchase Invoice /
Stock Entry / Stock Reconciliation could previously be mutated via REST
without the SPA capability check ever firing. Now every write path — SPA
endpoint OR direct REST call OR ERPNext Desk — passes through the same
asserter.

Each guard:
  • lets break-glass users (Administrator / System Manager) through,
  • throws frappe.PermissionError when the cap is missing,
  • does NOT contradict ERPNext's own DocPerm — it's an ADDITIONAL layer.

The check is intentionally cheap: cap lookup is O(1) on a dict.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import (
    is_break_glass_user,
    has_cap,
)


# ── Payment Entry ─────────────────────────────────────────────────────────


def validate_payment_entry_write(doc, method=None):
    """Block writes to Payment Entry unless the user has the cap.

    Submitted PEs are immutable in ERPNext core (docstatus=1 → read-only),
    so this fires on insert/update of drafts. Cancellation is handled by
    rest_resource_guard.before_cancel_guard.
    """
    if is_break_glass_user():
        return
    # Pay entries are AP only in our world. We don't restrict Receive
    # (customer payments) because that's the Cashier's POS close flow.
    payment_type = (doc.payment_type or "").strip()
    if payment_type != "Pay":
        return
    if not has_cap("can_manage_supplier_payments"):
        frappe.throw(
            _("You do not have permission to record supplier payments."),
            frappe.PermissionError,
        )


# ── Purchase Invoice ──────────────────────────────────────────────────────


def validate_purchase_invoice_write(doc, method=None):
    """Anyone who can read PIs may read; only the Accountant / Admin /
    purchasing-approval flow may CREATE or modify draft PIs."""
    if is_break_glass_user():
        return
    if has_cap("can_manage_supplier_payable") or has_cap("can_manage_system"):
        return
    # The auto-creation path from the Purchase Receipt approval is initiated
    # by the manager flow itself — assert_may_approve_purchasing_manager
    # already ran upstream. We allow it through here because the manager
    # holds `can_approve_purchasing`.
    if has_cap("can_approve_purchasing"):
        return
    frappe.throw(
        _("You do not have permission to create or edit Supplier Invoices."),
        frappe.PermissionError,
    )


def after_insert_purchase_invoice(doc, method=None):
    """Surface a 'new Supplier Invoice pending' notification regardless of
    whether the PI came through the approval flow or was manually created."""
    try:
        from elmahdi.api.notifications import notify_finance_invoice_pending
        notify_finance_invoice_pending(
            invoice_name=doc.name,
            supplier=doc.supplier,
            amount=float(doc.grand_total or 0),
            receipt_name=(doc.items[0].purchase_receipt if doc.items else None),
        )
    except Exception:
        # Notifications are best-effort — never block a PI from being saved
        # because the notification helper had a hiccup.
        frappe.log_error(
            title=f"PI notification failed for {doc.name}",
            message=frappe.get_traceback(),
        )


# ── Stock Entry ───────────────────────────────────────────────────────────


def validate_stock_entry_write(doc, method=None):
    """Material Receipt / Transfer / Issue / Repack — restricted to roles
    that can operate inventory."""
    if is_break_glass_user():
        return
    if not (has_cap("can_operate_inventory") or has_cap("can_manage_system")):
        frappe.throw(
            _("You do not have permission to record stock movements."),
            frappe.PermissionError,
        )


# ── Stock Reconciliation ──────────────────────────────────────────────────


def validate_stock_reconciliation_write(doc, method=None):
    """Drafting a stock count is allowed for inventory clerks; submitting
    (which posts to GL) needs an approver."""
    if is_break_glass_user():
        return
    # Draft → must be at least an inventory operator.
    if int(doc.docstatus or 0) == 0:
        if not (
            has_cap("can_operate_inventory")
            or has_cap("can_inventory_reconcile")
            or has_cap("can_manage_system")
        ):
            frappe.throw(
                _("You do not have permission to draft stock reconciliation."),
                frappe.PermissionError,
            )
        return
    # Submit → must hold the approval cap.
    if not (has_cap("can_inventory_reconcile") or has_cap("can_approve_reconciliation") or has_cap("can_manage_system")):
        frappe.throw(
            _("You do not have permission to submit stock reconciliation."),
            frappe.PermissionError,
        )

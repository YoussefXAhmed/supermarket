"""
POS Closing Entry — cashier draft only; manager/accountant submit.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

SHIFT_VARIANCE_APPROVAL_PCT = 1.0  # % of expected cash; above → explicit approval


def _has_custom_field(fieldname: str) -> bool:
	return frappe.db.has_column("POS Closing Entry", fieldname)


def _user_roles() -> set[str]:
	return set(frappe.get_roles(frappe.session.user))


def _is_break_glass() -> bool:
	return bool(_user_roles() & {"Administrator", "System Manager"})


def _can_approve_shift() -> bool:
	if _is_break_glass():
		return True
	roles = _user_roles()
	return bool(
		roles
		& {
			"Accounts Manager",
			"Accounts User",
			"Store Manager",
			"Sales Manager",
			"Stock Manager",
			"Purchase Manager",
		}
	)


def _cash_variance_pct(doc) -> float:
	recon = doc.get("payment_reconciliation") or []
	cash = next((r for r in recon if (r.mode_of_payment or "").lower() == "cash"), None)
	if not cash:
		return 0.0
	expected = flt(cash.expected_amount)
	diff = abs(flt(cash.difference))
	if expected <= 0.01:
		return 100.0 if diff > 0.01 else 0.0
	return diff / expected * 100.0


def _set_audit_fields(doc, *, pending: bool, approved: bool = False, reason: str = "", role: str = ""):
	if _has_custom_field("pending_shift_approval"):
		doc.pending_shift_approval = 1 if pending else 0
	if _has_custom_field("variance_percent"):
		doc.variance_percent = _cash_variance_pct(doc)
	if approved:
		if _has_custom_field("approved_by"):
			doc.approved_by = frappe.session.user
		if _has_custom_field("approved_at"):
			doc.approved_at = now_datetime()
		if _has_custom_field("approval_role"):
			doc.approval_role = role or _primary_approval_role()
		if _has_custom_field("approval_reason") and reason:
			doc.approval_reason = reason


def _primary_approval_role() -> str:
	roles = _user_roles()
	if roles & {"Accounts Manager", "Accounts User"}:
		return "accountant"
	if roles & {"Store Manager", "Sales Manager", "Stock Manager", "Purchase Manager"}:
		return "manager"
	return "admin"


def before_submit_pos_closing(doc, method=None):
	if getattr(frappe.flags, "elmahdi_pos_closing_approval_submit", False):
		return
	if _is_break_glass():
		return
	if not _can_approve_shift():
		frappe.throw(
			_("Only a store manager or accountant can submit POS Closing Entry."),
			frappe.PermissionError,
		)
	if doc.owner == frappe.session.user and "POS User" in _user_roles():
		frappe.throw(_("Cashiers cannot submit their own shift closing."), frappe.PermissionError)


def on_update_pos_closing(doc, method=None):
	"""Mark draft closings pending manager/accountant review."""
	if doc.docstatus != 0 or getattr(frappe.flags, "elmahdi_pos_closing_skip_pending", False):
		return
	pct = _cash_variance_pct(doc)
	pending = pct > SHIFT_VARIANCE_APPROVAL_PCT or not _can_approve_shift()
	_set_audit_fields(doc, pending=pending)
	if pending and _has_custom_field("pending_shift_approval"):
		frappe.db.set_value(
			"POS Closing Entry",
			doc.name,
			{
				"pending_shift_approval": 1,
				"variance_percent": pct,
			},
			update_modified=False,
		)


@frappe.whitelist()
def approve_pos_closing_entry(name, notes=""):
	if not _can_approve_shift():
		frappe.throw(_("Not permitted to approve shift closing."), frappe.PermissionError)

	doc = frappe.get_doc("POS Closing Entry", name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft POS Closing Entry can be approved."), frappe.ValidationError)

	if doc.owner == frappe.session.user and not _is_break_glass():
		frappe.throw(_("You cannot approve your own shift closing."), frappe.PermissionError)

	_set_audit_fields(doc, pending=False, approved=True, reason=notes or "Shift close approved")
	frappe.flags.elmahdi_pos_closing_skip_pending = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.elmahdi_pos_closing_skip_pending = False

	frappe.flags.elmahdi_pos_closing_approval_submit = True
	try:
		doc.submit()
	finally:
		frappe.flags.elmahdi_pos_closing_approval_submit = False

	return {"name": doc.name, "docstatus": doc.docstatus, "status": "submitted"}


@frappe.whitelist()
def reject_pos_closing_entry(name, notes=""):
	"""Reject a draft closing (keeps it in draft, clears pending flag, records reason)."""
	if not _can_approve_shift():
		frappe.throw(_("Not permitted to reject shift closing."), frappe.PermissionError)

	doc = frappe.get_doc("POS Closing Entry", name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft POS Closing Entry can be rejected."), frappe.ValidationError)

	if doc.owner == frappe.session.user and not _is_break_glass():
		frappe.throw(_("You cannot reject your own shift closing."), frappe.PermissionError)

	_set_audit_fields(doc, pending=False, approved=False, reason=notes or "Shift close rejected")
	frappe.flags.elmahdi_pos_closing_skip_pending = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.elmahdi_pos_closing_skip_pending = False

	return {"name": doc.name, "docstatus": doc.docstatus, "status": "rejected"}


@frappe.whitelist()
def list_pending_shift_closings(limit=50):
	if not _can_approve_shift():
		frappe.throw(_("Not permitted to view shift approvals."), frappe.PermissionError)

	filters = {"docstatus": 0}
	if _has_custom_field("pending_shift_approval"):
		filters["pending_shift_approval"] = 1

	rows = frappe.get_all(
		"POS Closing Entry",
		filters=filters,
		fields=[
			"name",
			"pos_profile",
			"company",
			"user",
			"owner",
			"posting_date",
			"modified",
			"variance_percent",
			"approved_by",
		],
		order_by="modified desc",
		limit_page_length=int(limit or 50),
	)
	return rows

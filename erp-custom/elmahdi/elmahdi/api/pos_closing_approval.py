"""
POS Closing Entry — cashier draft only; accountant finalizes via whitelisted methods.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from elmahdi.api.shift_authorization import (
	CASHIER_ERP_ROLES,
	assert_may_act_as_pos_closing_approver,
	assert_not_self_approval,
	is_break_glass_user,
	may_act_as_pos_closing_approver,
	primary_approval_role_label,
	user_erp_roles,
)

SHIFT_VARIANCE_APPROVAL_PCT = 1.0  # % of expected cash; above → explicit approval


def _has_custom_field(fieldname: str) -> bool:
	return frappe.db.has_column("POS Closing Entry", fieldname)


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
			doc.approval_role = role or primary_approval_role_label()
		if _has_custom_field("approval_reason") and reason:
			doc.approval_reason = reason


def before_submit_pos_closing(doc, method=None):
	"""ERPNext submit gate — blocks cashier REST submit; managers must not self-approve."""
	if getattr(frappe.flags, "elmahdi_pos_closing_approval_submit", False):
		return
	if is_break_glass_user():
		return

	if may_act_as_pos_closing_approver():
		if doc.owner == frappe.session.user:
			frappe.throw(_("You cannot approve your own shift closing."), frappe.PermissionError)
		return

	roles = user_erp_roles()
	if roles & CASHIER_ERP_ROLES:
		frappe.throw(
			_("Cashiers cannot submit POS Closing Entry. An accountant must approve the closing."),
			frappe.PermissionError,
		)

	frappe.throw(
		_("You do not have permission to approve shift closings."),
		frappe.PermissionError,
	)


def on_update_pos_closing(doc, method=None):
	"""Mark draft closings pending accountant review."""
	if doc.docstatus != 0 or getattr(frappe.flags, "elmahdi_pos_closing_skip_pending", False):
		return
	pct = _cash_variance_pct(doc)
	pending = pct > SHIFT_VARIANCE_APPROVAL_PCT or not may_act_as_pos_closing_approver()
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
	assert_may_act_as_pos_closing_approver()

	doc = frappe.get_doc("POS Closing Entry", name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft POS Closing Entry can be approved."), frappe.ValidationError)

	assert_not_self_approval(doc)

	_set_audit_fields(doc, pending=False, approved=True, reason=notes or "Shift close approved")
	frappe.flags.elmahdi_pos_closing_skip_pending = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.elmahdi_pos_closing_skip_pending = False

	frappe.flags.elmahdi_pos_closing_approval_submit = True
	prev_doc_ignore = bool(doc.flags.ignore_permissions)
	doc.flags.ignore_permissions = True
	try:
		doc.submit()
	finally:
		doc.flags.ignore_permissions = prev_doc_ignore
		frappe.flags.elmahdi_pos_closing_approval_submit = False

	return {"name": doc.name, "docstatus": doc.docstatus, "status": "submitted"}


@frappe.whitelist()
def reject_pos_closing_entry(name, notes=""):
	"""Reject a draft closing (keeps it in draft, clears pending flag, records reason)."""
	assert_may_act_as_pos_closing_approver()

	doc = frappe.get_doc("POS Closing Entry", name)
	if doc.docstatus != 0:
		frappe.throw(_("Only draft POS Closing Entry can be rejected."), frappe.ValidationError)

	assert_not_self_approval(doc)

	_set_audit_fields(doc, pending=False, approved=False, reason=notes or "Shift close rejected")
	frappe.flags.elmahdi_pos_closing_skip_pending = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.elmahdi_pos_closing_skip_pending = False

	return {"name": doc.name, "docstatus": doc.docstatus, "status": "rejected"}


@frappe.whitelist()
def list_pending_shift_closings(limit=50):
	assert_may_act_as_pos_closing_approver()

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

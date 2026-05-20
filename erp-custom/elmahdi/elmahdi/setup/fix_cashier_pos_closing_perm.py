"""Ensure cashier roles can open shifts but cannot submit POS Closing Entry (draft close only)."""

import frappe
from frappe.permissions import add_permission, update_permission_property


ROLES = ("POS User", "Sales User")
POS_OPENING = "POS Opening Entry"
POS_CLOSING = "POS Closing Entry"


def _ensure_row(doctype: str, role: str) -> None:
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")


def _set_perm(doctype: str, role: str, perms: dict[str, int]) -> None:
	_ensure_row(doctype, role)
	for ptype, value in perms.items():
		update_permission_property(doctype, role, 0, ptype, int(value))


def grant_cashier_pos_closing_perms() -> None:
	"""Cashier: POS Opening submit allowed; POS Closing draft only (no submit)."""
	for role in ROLES:
		_set_perm(
			POS_OPENING,
			role,
			{"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 0},
		)
		_set_perm(
			POS_CLOSING,
			role,
			{"read": 1, "write": 1, "create": 1, "submit": 0, "cancel": 0},
		)


def execute():
	grant_cashier_pos_closing_perms()
	frappe.db.commit()
	frappe.clear_cache()
	return {"status": "ok", "policy": "cashier_pos_closing_no_submit"}

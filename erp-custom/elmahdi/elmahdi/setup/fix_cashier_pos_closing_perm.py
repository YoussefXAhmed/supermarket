"""Grant POS User / Sales User submit on POS Closing Entry for cashier shift close."""

import frappe
from frappe.permissions import add_permission, has_permission, update_permission_property


ROLES = ("POS User", "Sales User")
DOCTYPES = ("POS Closing Entry", "POS Opening Entry")


def _grant_submit(doctype: str, role: str) -> None:
	"""Ensure role can read/write/create/submit on doctype via Custom DocPerm."""
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")
		for ptype in ("write", "create", "submit"):
			update_permission_property(doctype, role, 0, ptype, 1)
		return

	for ptype in ("read", "write", "create", "submit"):
		update_permission_property(doctype, role, 0, ptype, 1)


def grant_cashier_pos_closing_perms() -> None:
	for doctype in DOCTYPES:
		for role in ROLES:
			_grant_submit(doctype, role)


def execute():
	grant_cashier_pos_closing_perms()
	frappe.db.commit()
	frappe.clear_cache()

	frappe.set_user("cashier@elmahdi.com")
	result = {
		"user": "cashier@elmahdi.com",
		"POS Closing Entry submit": bool(has_permission("POS Closing Entry", "submit")),
		"POS Closing Entry create": bool(has_permission("POS Closing Entry", "create")),
		"POS Opening Entry submit": bool(has_permission("POS Opening Entry", "submit")),
	}
	frappe.set_user("Administrator")
	return result

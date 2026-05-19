"""Submit permissions for operational approvers (shift close + purchase receipt)."""

import frappe
from frappe.permissions import add_permission, update_permission_property


def _grant_submit(doctype: str, role: str) -> None:
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")
	for ptype in ("read", "write", "submit"):
		update_permission_property(doctype, role, 0, ptype, 1)


def grant_operational_approver_perms() -> None:
	for role in ("Accounts Manager", "Accountant"):
		_grant_submit("POS Closing Entry", role)
		_grant_submit("Purchase Receipt", role)
	for role in ("Purchase Manager", "Stock Manager"):
		from elmahdi.setup.grant_operational_item_price_read import _grant_read

		_grant_read(role)
		_grant_submit("Purchase Receipt", role)


def execute():
	grant_operational_approver_perms()
	frappe.db.commit()
	frappe.clear_cache()

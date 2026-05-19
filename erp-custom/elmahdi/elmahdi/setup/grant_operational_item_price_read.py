"""Grant read on Item Price for operational roles (SPA item lists, POS, buying rates)."""

import frappe
from frappe.permissions import add_permission, update_permission_property


ROLES = (
	"Purchase User",
	"Stock User",
	"Sales User",
	"POS User",
	"Stock Manager",
	"Purchase Manager",
	"Sales Manager",
	"Accounts User",
	"Accounts Manager",
)
DOCTYPE = "Item Price"


def _grant_read(role: str) -> None:
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": DOCTYPE, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(DOCTYPE, role, permlevel=0, ptype="read")
	update_permission_property(DOCTYPE, role, 0, "read", 1)


def grant_operational_item_price_read() -> None:
	for role in ROLES:
		_grant_read(role)

	for role, doctype in (
		("Accounts User", "Warehouse"),
		("Accounts Manager", "Warehouse"),
		("Stock Manager", "Warehouse"),
		("Purchase Manager", "Warehouse"),
		("Sales Manager", "Warehouse"),
	):
		if frappe.db.exists("Role", role) and frappe.db.exists("DocType", doctype):
			if not frappe.db.exists(
				"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
			):
				add_permission(doctype, role, permlevel=0, ptype="read")
			update_permission_property(doctype, role, 0, "read", 1)


def execute():
	grant_operational_item_price_read()
	frappe.db.commit()
	frappe.clear_cache()

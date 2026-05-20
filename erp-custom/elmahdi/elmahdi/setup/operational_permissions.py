"""
ERPNext Custom DocPerm matrix for Elmahdi operational roles.
Aligns desk enforcement with SPA approval workflows.
"""

from __future__ import annotations

import frappe
from frappe.permissions import add_permission, update_permission_property

# role -> doctype -> permission fields (1/0)
PERM_MATRIX: dict[str, dict[str, dict[str, int]]] = {
	"POS User": {
		"POS Closing Entry": {"read": 1, "write": 1, "create": 1, "submit": 0, "cancel": 0},
		"POS Invoice": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 0},
		"POS Opening Entry": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
		"Stock Reconciliation": {"read": 0, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Sales User": {
		"POS Closing Entry": {"read": 1, "write": 1, "create": 1, "submit": 0, "cancel": 0},
		"POS Invoice": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 0},
	},
	"Purchase User": {
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 0, "cancel": 0},
		"Purchase Receipt Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Purchase Invoice": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 0},
		"Purchase Invoice Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Reconciliation": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Stock User": {
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Stock Reconciliation": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 0, "cancel": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"POS Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Sales Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Sales Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Receipt Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Purchase Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Invoice Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Item Price": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Sales Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	# Optional role for sites that use a dedicated "Store Manager" role
	# instead of inheriting Sales/Stock/Purchase Manager roles via Role Profile.
	"Store Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Receipt Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Sales Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
	},
	"Stock Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Receipt Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Purchase Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Invoice Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Item Price": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Stock Reconciliation": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Purchase Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Receipt Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Purchase Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Invoice Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Item Price": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Bin": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 0, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Accounts User": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 0},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 0},
		"Purchase Receipt Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Invoice Item": {"read": 1, "write": 1, "create": 1, "submit": 0},
		"Payment Entry": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Invoice": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Sales Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Item Price": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"GL Entry": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Reconciliation": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
	"Accounts Manager": {
		"POS Opening Entry": {"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0},
		"POS Closing Entry": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt": {"read": 1, "write": 1, "create": 0, "submit": 1, "cancel": 1},
		"Purchase Receipt Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Purchase Invoice Item": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Payment Entry": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Purchase Invoice": {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1},
		"Sales Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"POS Invoice": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Item Price": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Warehouse": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"GL Entry": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Entry": {"read": 1, "write": 0, "create": 0, "submit": 0},
		"Stock Reconciliation": {"read": 0, "write": 0, "create": 0, "submit": 0},
	},
}


def _ensure_perm(doctype: str, role: str, ptype: str, value: int) -> None:
	if not frappe.db.exists("DocType", doctype):
		return
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")
	update_permission_property(doctype, role, 0, ptype, value)


def apply_permission_matrix() -> list[str]:
	applied: list[str] = []
	for role, doctypes in PERM_MATRIX.items():
		if not frappe.db.exists("Role", role):
			continue
		for doctype, perms in doctypes.items():
			for ptype, value in perms.items():
				_ensure_perm(doctype, role, ptype, value)
				applied.append(f"{role}:{doctype}:{ptype}={value}")
	return applied


def verify_role_permissions(role: str, checks: dict[str, dict[str, bool]]) -> dict:
	frappe.set_user("Administrator")
	from frappe.permissions import has_permission

	results = {}
	for doctype, perms in checks.items():
		results[doctype] = {
			ptype: bool(has_permission(doctype, ptype, user=role))
			for ptype, expected in perms.items()
		}
	return results


def execute():
	applied = apply_permission_matrix()
	frappe.db.commit()
	frappe.clear_cache()
	return {"applied_count": len(applied)}

"""Store/monitor ERP roles — read POS closings only (no REST submit/cancel bypass)."""

from __future__ import annotations

import frappe
from frappe.permissions import add_permission, update_permission_property

MONITOR_ROLES = (
	"Sales Manager",
	"POS Manager",
	"Store Manager",
	"Stock Manager",
	"Purchase Manager",
)

POS_CLOSING = "POS Closing Entry"


def _set(doctype: str, role: str, perms: dict[str, int]) -> None:
	if not frappe.db.exists("Role", role):
		return
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")
	for ptype, value in perms.items():
		update_permission_property(doctype, role, 0, ptype, int(value))


def grant_monitor_shift_perms() -> None:
	"""Monitor roles may view shift closings; approval is accountant-only via whitelisted API."""
	for role in MONITOR_ROLES:
		_set(
			POS_CLOSING,
			role,
			{"read": 1, "write": 0, "create": 0, "submit": 0, "cancel": 0, "delete": 0},
		)


def execute():
	grant_monitor_shift_perms()
	frappe.db.commit()
	frappe.clear_cache()
	return {"status": "ok", "policy": "monitor_pos_closing_read_only"}

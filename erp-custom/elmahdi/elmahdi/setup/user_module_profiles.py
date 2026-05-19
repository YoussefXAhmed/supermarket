"""
Desk module access (Allow Modules) per Elmahdi operational role.

Sets User.block_modules directly — the complement of each role's allow-list.
"""

from __future__ import annotations

import frappe

_BASE_DESK = ("Desk", "Elmahdi")

ALLOWED_MODULES_BY_ROLE_PROFILE: dict[str, tuple[str, ...]] = {
	"Elmahdi Cashier": (*_BASE_DESK, "Selling"),
	"Elmahdi Inventory Clerk": (*_BASE_DESK, "Stock", "Buying"),
	"Elmahdi Purchasing Officer": (*_BASE_DESK, "Buying", "Stock"),
	"Elmahdi Accountant": (*_BASE_DESK, "Accounts", "Buying", "Stock", "Selling", "Regional"),
	"Elmahdi Store Manager": (
		*_BASE_DESK,
		"Accounts",
		"Buying",
		"Selling",
		"Stock",
		"Setup",
	),
}


def _all_modules() -> list[str]:
	return frappe.get_all("Module Def", pluck="name", order_by="name")


def _blocked_modules(allowed: tuple[str, ...]) -> list[str]:
	allowed_set = set(allowed)
	return [m for m in _all_modules() if m not in allowed_set]


def apply_user_modules(user_email: str, role_profile: str) -> dict:
	"""Apply allow-list to a user via block_modules."""
	allowed = ALLOWED_MODULES_BY_ROLE_PROFILE.get(role_profile)
	if allowed is None:
		frappe.throw(f"No module map for role profile: {role_profile}")

	blocked = _blocked_modules(allowed)
	user = frappe.get_doc("User", user_email)
	user.module_profile = None
	user.set("block_modules", [])
	for module in blocked:
		user.append("block_modules", {"module": module})
	user.save(ignore_permissions=True)

	return {
		"user": user_email,
		"role_profile": role_profile,
		"allowed_modules": list(allowed),
		"blocked_count": len(blocked),
	}


def sync_operational_user_modules() -> list[dict]:
	results: list[dict] = []
	for row in frappe.get_all(
		"User",
		filters={
			"enabled": 1,
			"role_profile_name": ["in", list(ALLOWED_MODULES_BY_ROLE_PROFILE.keys())],
		},
		fields=["name", "role_profile_name"],
		order_by="name",
	):
		results.append(apply_user_modules(row.name, row.role_profile_name))

	frappe.db.commit()
	frappe.clear_cache()
	return results


def execute():
	import json

	out = sync_operational_user_modules()
	print(json.dumps(out, indent=2))
	return out

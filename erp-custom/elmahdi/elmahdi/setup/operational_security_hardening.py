"""
Operational user hardening — desk access, module blocks, monitor shift perms.

Run after provision or permission matrix changes:
  bench --site <site> execute elmahdi.setup.operational_security_hardening.execute
"""

from __future__ import annotations

import frappe

from elmahdi.setup.fix_cashier_pos_closing_perm import grant_cashier_pos_closing_perms
from elmahdi.setup.fix_monitor_shift_perms import grant_monitor_shift_perms
from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.setup.provision_operational_users import ROLE_PROFILES
from elmahdi.setup.user_module_profiles import apply_user_modules

SPA_ONLY_PROFILES = frozenset(
	p
	for p in ROLE_PROFILES
	if p != "Elmahdi Administrator"
)


def _harden_desk_access() -> list[str]:
	"""SPA operational users: no ERP Desk login (API session only)."""
	updated: list[str] = []
	if not frappe.get_meta("User").has_field("desk_access"):
		return updated

	for profile in SPA_ONLY_PROFILES:
		for row in frappe.get_all(
			"User",
			filters={"enabled": 1, "role_profile_name": profile},
			pluck="name",
		):
			frappe.db.set_value("User", row, "desk_access", 0, update_modified=False)
			updated.append(row)
	return updated


def execute():
	grant_cashier_pos_closing_perms()
	grant_monitor_shift_perms()
	applied = apply_permission_matrix()
	desk_users = _harden_desk_access()

	module_rows: list[dict] = []
	for profile in SPA_ONLY_PROFILES:
		for row in frappe.get_all(
			"User",
			filters={"enabled": 1, "role_profile_name": profile},
			fields=["name"],
		):
			module_rows.append(apply_user_modules(row.name, profile))

	frappe.db.commit()
	frappe.clear_cache()
	return {
		"permission_rows": len(applied),
		"desk_access_cleared": len(desk_users),
		"module_profiles_synced": len(module_rows),
	}

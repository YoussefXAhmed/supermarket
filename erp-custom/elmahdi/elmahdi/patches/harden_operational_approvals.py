"""Migrate-safe: custom fields, ERP perms, role profiles, user normalization."""

from __future__ import annotations

import frappe

from elmahdi.setup.approval_custom_fields import execute as install_approval_fields
from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.setup.provision_operational_users import ROLE_PROFILES, _ensure_role_profile, _provision_user
from elmahdi.setup.user_module_profiles import sync_operational_user_modules


EXPECTED_ROLE_PROFILES = {
	"Elmahdi Cashier": ["POS User", "Sales User"],
	"Elmahdi Inventory Clerk": ["Stock User"],
	"Elmahdi Purchasing Officer": ["Purchase User"],
	"Elmahdi Store Manager": [
		"Stock Manager",
		"Purchase Manager",
		"Sales Manager",
	],
	"Elmahdi Accountant": ["Accounts User", "Accounts Manager"],
}


def _validate_role_profiles() -> list[str]:
	issues: list[str] = []
	for profile, expected in EXPECTED_ROLE_PROFILES.items():
		if not frappe.db.exists("Role Profile", profile):
			issues.append(f"missing profile: {profile}")
			continue
		doc = frappe.get_doc("Role Profile", profile)
		actual = sorted(r.role for r in doc.roles)
		exp = sorted(expected)
		if actual != exp:
			issues.append(f"profile {profile}: expected {exp}, got {actual}")
		forbidden = {"System Manager", "POS User"} & set(actual)
		if profile == "Elmahdi Accountant" and forbidden:
			issues.append(f"accountant has forbidden roles: {forbidden}")
	return issues


def _normalize_users() -> None:
	"""Re-apply role profiles + modules without rotating passwords."""
	for profile in EXPECTED_ROLE_PROFILES:
		_ensure_role_profile(profile, ROLE_PROFILES[profile])

	for row in frappe.get_all(
		"User",
		filters={"enabled": 1, "role_profile_name": ["in", list(EXPECTED_ROLE_PROFILES.keys())]},
		fields=["name", "role_profile_name"],
	):
		user = frappe.get_doc("User", row.name)
		user.role_profile_name = row.role_profile_name
		user.save(ignore_permissions=True)

	sync_operational_user_modules()


def execute():
	install_approval_fields()
	apply_permission_matrix()
	_normalize_users()
	issues = _validate_role_profiles()
	frappe.db.commit()
	frappe.clear_cache()
	return {"issues": issues}

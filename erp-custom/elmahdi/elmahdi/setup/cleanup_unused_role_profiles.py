"""Remove Role Profiles not used by Elmahdi operational provisioning."""

from __future__ import annotations

import frappe

from elmahdi.setup.provision_operational_users import ROLE_PROFILES

KEEP_PROFILES = frozenset(ROLE_PROFILES.keys())


def list_unused_role_profiles() -> list[str]:
	"""Role profiles on site that are not in the Elmahdi operational catalog."""
	all_profiles = frappe.get_all("Role Profile", pluck="name")
	return sorted(name for name in all_profiles if name not in KEEP_PROFILES)


def delete_unused_role_profiles() -> dict:
	"""Delete Role Profiles outside KEEP_PROFILES when no user references them."""
	deleted: list[str] = []
	skipped: list[dict] = []

	for name in list_unused_role_profiles():
		users = frappe.get_all(
			"User",
			filters={"role_profile_name": name},
			pluck="name",
			limit=5,
		)
		if users:
			skipped.append({"profile": name, "users": users})
			continue
		frappe.delete_doc("Role Profile", name, ignore_permissions=True, force=True)
		deleted.append(name)

	frappe.db.commit()
	frappe.clear_cache()
	return {"kept": sorted(KEEP_PROFILES), "deleted": deleted, "skipped": skipped}


def execute():
	return delete_unused_role_profiles()

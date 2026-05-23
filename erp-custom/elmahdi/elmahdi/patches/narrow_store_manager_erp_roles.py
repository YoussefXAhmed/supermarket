"""Re-provision store manager ERP roles (monitor/approve only) and refresh DocPerm matrix."""

from __future__ import annotations

import frappe

from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.setup.provision_operational_users import ROLE_PROFILES, _ensure_role_profile


def execute():
	roles = ROLE_PROFILES.get("Elmahdi Store Manager")
	if roles:
		_ensure_role_profile("Elmahdi Store Manager", roles)

	for email in frappe.get_all(
		"User",
		filters={"role_profile_name": "Elmahdi Store Manager", "enabled": 1},
		pluck="name",
	):
		user = frappe.get_doc("User", email)
		user.role_profile_name = "Elmahdi Store Manager"
		user.save(ignore_permissions=True)

	apply_permission_matrix()
	frappe.db.commit()
	frappe.clear_cache()

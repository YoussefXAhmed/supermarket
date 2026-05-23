"""Ensure Elmahdi HR Officer role profile, ERP role, and permission matrix."""

from __future__ import annotations

import frappe

from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.setup.provision_operational_users import (
	ELMAHDI_HR_USER_ROLE,
	ROLE_PROFILES,
	_ensure_erp_role,
	_ensure_role_profile,
	provision_all,
)


def _sync_hr_role_profile() -> None:
	expected = sorted(ROLE_PROFILES["Elmahdi HR Officer"])
	if not frappe.db.exists("Role Profile", "Elmahdi HR Officer"):
		_ensure_role_profile("Elmahdi HR Officer", ROLE_PROFILES["Elmahdi HR Officer"])
		return
	actual = sorted(r.role for r in frappe.get_doc("Role Profile", "Elmahdi HR Officer").roles)
	if actual != expected:
		try:
			_ensure_role_profile("Elmahdi HR Officer", ROLE_PROFILES["Elmahdi HR Officer"])
		except frappe.DocumentLockedError:
			frappe.log_error(title="HR Officer profile locked", message="Skipped role profile save during patch")


def execute():
	_ensure_erp_role(ELMAHDI_HR_USER_ROLE)
	_sync_hr_role_profile()
	apply_permission_matrix()

	# Provision hr@ when missing; refresh profile when present without password rotation.
	if not frappe.db.exists("User", "hr@elmahdi.com"):
		provision_all()
	else:
		user = frappe.get_doc("User", "hr@elmahdi.com")
		user.role_profile_name = "Elmahdi HR Officer"
		user.save(ignore_permissions=True)
		from elmahdi.setup.user_module_profiles import apply_user_modules

		apply_user_modules("hr@elmahdi.com", "Elmahdi HR Officer")

	frappe.db.commit()
	frappe.clear_cache()
	return {"role_profile": "Elmahdi HR Officer", "erp_role": ELMAHDI_HR_USER_ROLE}

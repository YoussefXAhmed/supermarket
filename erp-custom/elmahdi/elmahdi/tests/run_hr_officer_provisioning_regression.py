"""
Regression: Elmahdi HR Officer role profile and minimal HR REST permissions.

Run:
  bench --site <site> execute elmahdi.tests.run_hr_officer_provisioning_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.permissions import has_permission

from elmahdi.api.spa_authorization import (
	assert_may_access_finance,
	assert_may_access_hr_workspace,
	assert_may_access_purchasing,
	assert_may_manage_operational_users,
	assert_may_operate_inventory,
	assert_may_operate_pos,
	get_capabilities,
	has_cap,
	is_break_glass_user,
)
from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.setup.provision_operational_users import ELMAHDI_HR_USER_ROLE, ROLE_PROFILES, _ensure_erp_role
from elmahdi.setup.rest_resource_policy import REST_USER_EXPECTATIONS
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

HR_USER = "hr@elmahdi.com"
HR_PROFILE = "Elmahdi HR Officer"
FORBIDDEN_ERP_ROLES = frozenset(
	{
		"System Manager",
		"Administrator",
		"Accounts User",
		"Accounts Manager",
		"Stock User",
		"Stock Manager",
		"Purchase User",
		"Purchase Manager",
		"Sales Manager",
		"POS Manager",
	}
)


def _step(steps, *, step, ok, message="", **extra):
	row = audit_record(step=step, passed=ok, message=message, **extra)
	steps.append(row)
	return ok


def _expect_permission_error(fn) -> bool:
	try:
		fn()
	except frappe.PermissionError:
		return True
	except Exception as exc:
		return "Permission" in type(exc).__name__
	return False


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		_ensure_erp_role(ELMAHDI_HR_USER_ROLE)
		apply_permission_matrix()
		frappe.db.commit()

		_step(
			steps,
			step="role_profile_exists",
			ok=frappe.db.exists("Role Profile", HR_PROFILE),
			message=HR_PROFILE,
		)

		if frappe.db.exists("Role Profile", HR_PROFILE):
			roles = sorted(r.role for r in frappe.get_doc("Role Profile", HR_PROFILE).roles)
			_step(
				steps,
				step="role_profile_erp_roles",
				ok=roles == sorted(ROLE_PROFILES[HR_PROFILE]),
				message=str(roles),
			)

		if not frappe.db.exists("User", HR_USER):
			_step(steps, step="hr_user_present", ok=False, message=f"User {HR_USER} missing — run provision_operational_users")
		else:
			frappe.set_user(HR_USER)
			erp_roles = set(frappe.get_roles(HR_USER))
			_step(
				steps,
				step="hr_user_present",
				ok=True,
				message=HR_USER,
			)
			_step(
				steps,
				step="hr_no_forbidden_erp_roles",
				ok=not (erp_roles & FORBIDDEN_ERP_ROLES),
				message=str(sorted(erp_roles)),
			)
			_step(
				steps,
				step="hr_not_break_glass",
				ok=not is_break_glass_user(HR_USER),
				message="must not be System Manager / Administrator",
			)
			_step(
				steps,
				step="hr_role_profile_field",
				ok=frappe.db.get_value("User", HR_USER, "role_profile_name") == HR_PROFILE,
				message=frappe.db.get_value("User", HR_USER, "role_profile_name") or "",
			)

			for doctype, perm, expected in REST_USER_EXPECTATIONS.get(HR_USER, []):
				actual = bool(has_permission(doctype, perm, user=HR_USER))
				_step(
					steps,
					step=f"rest_{doctype.replace(' ', '_')}_{perm}",
					ok=actual == expected,
					message=f"expected={expected} actual={actual}",
				)

			from elmahdi.api.hr_workforce import EMPLOYEE_LIST_FIELDS, list_employees

			try:
				rows = list_employees(limit=5)
				_step(
					steps,
					step="api_list_employees",
					ok=True,
					message=f"count={len(rows)} fields={len(EMPLOYEE_LIST_FIELDS)}",
				)
			except Exception as exc:
				_step(
					steps,
					step="api_list_employees",
					ok=False,
					message=f"{type(exc).__name__}: {exc}",
				)

			_step(
				steps,
				step="spa_view_employees_cap",
				ok=has_cap("can_view_employees", HR_USER),
				message="",
			)
			_step(
				steps,
				step="spa_manage_employees_cap",
				ok=has_cap("can_manage_employees", HR_USER),
				message="",
			)

			caps = get_capabilities(HR_USER)
			_step(
				steps,
				step="spa_hr_workspace_cap",
				ok=has_cap("can_access_hr_workspace", HR_USER),
				message=json.dumps({k: v for k, v in caps.items() if v}, default=str)[:200],
			)
			_step(
				steps,
				step="spa_manage_operational_users_cap",
				ok=has_cap("can_manage_operational_users", HR_USER),
				message="",
			)
			_step(
				steps,
				step="spa_no_admin_workspace",
				ok=not has_cap("can_access_admin_workspace", HR_USER),
				message="",
			)
			_step(
				steps,
				step="spa_no_finance_cap",
				ok=not has_cap("can_access_accountant_workspace", HR_USER),
				message="",
			)
			_step(
				steps,
				step="spa_no_pos_operate",
				ok=not has_cap("can_operate_pos", HR_USER),
				message="",
			)

			_step(
				steps,
				step="api_hr_workspace_allowed",
				ok=not _expect_permission_error(assert_may_access_hr_workspace),
				message="",
			)
			_step(
				steps,
				step="api_manage_operational_users_allowed",
				ok=not _expect_permission_error(assert_may_manage_operational_users),
				message="",
			)
			_step(
				steps,
				step="api_finance_denied",
				ok=_expect_permission_error(assert_may_access_finance),
				message="",
			)
			_step(
				steps,
				step="api_purchasing_denied",
				ok=_expect_permission_error(assert_may_access_purchasing),
				message="",
			)
			_step(
				steps,
				step="api_inventory_denied",
				ok=_expect_permission_error(assert_may_operate_inventory),
				message="",
			)
			_step(
				steps,
				step="api_pos_denied",
				ok=_expect_permission_error(assert_may_operate_pos),
				message="",
			)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("HR Officer provisioning regression failed"), frappe.ValidationError)
	return summary

"""
HR workforce — whitelisted read/write helpers (SPA).

Uses explicit field allowlists and spa_authorization gates so HR officers
do not depend on fragile /api/resource field-level failures.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import (
	assert_may_access_hr_workspace,
	has_cap,
	is_break_glass_user,
)

EMPLOYEE_LIST_FIELDS = [
	"name",
	"employee",
	"employee_name",
	"first_name",
	"cell_number",
	"passport_number",
	"current_address",
	"permanent_address",
	"department",
	"designation",
	"date_of_joining",
	"status",
	"user_id",
	"company",
	"personal_email",
	"company_email",
	"creation",
	"modified",
]

USER_SNAPSHOT_FIELDS = [
	"name",
	"full_name",
	"email",
	"enabled",
	"user_type",
	"last_login",
	"role_profile_name",
]


def _assert_may_read_employees() -> None:
	assert_may_access_hr_workspace()
	if is_break_glass_user():
		return
	if has_cap("can_view_employees") or has_cap("can_manage_employees"):
		return
	frappe.throw(_("You do not have permission to view employees."), frappe.PermissionError)


@frappe.whitelist()
def list_employees(limit=200, start=0):
	"""List employees for HR workspace (read)."""
	_assert_may_read_employees()
	frappe.has_permission("Employee", "read", throw=True)
	rows = frappe.get_list(
		"Employee",
		fields=EMPLOYEE_LIST_FIELDS,
		order_by="modified desc",
		limit_page_length=int(limit or 200),
		limit_start=int(start or 0),
	)
	return rows


@frappe.whitelist()
def get_workforce_snapshot(limit=500):
	"""Dashboard aggregate — employees + operational users (role profiles)."""
	_assert_may_read_employees()
	employees = list_employees(limit=limit)

	users: list[dict] = []
	if has_cap("can_manage_operational_users") or is_break_glass_user():
		frappe.has_permission("User", "read", throw=True)
		users = frappe.get_list(
			"User",
			filters={"name": ["!=", "Guest"]},
			fields=USER_SNAPSHOT_FIELDS,
			order_by="modified desc",
			limit_page_length=int(limit or 500),
		)
	return {"employees": employees, "users": users}


@frappe.whitelist()
def list_departments():
	"""Read-only department picklist."""
	_assert_may_read_employees()
	frappe.has_permission("Department", "read", throw=True)
	return frappe.get_list("Department", fields=["name"], order_by="name asc", limit_page_length=500)


@frappe.whitelist()
def list_designations():
	"""Read-only designation / position picklist."""
	_assert_may_read_employees()
	frappe.has_permission("Designation", "read", throw=True)
	return frappe.get_list("Designation", fields=["name", "designation_name"], order_by="name asc", limit_page_length=500)

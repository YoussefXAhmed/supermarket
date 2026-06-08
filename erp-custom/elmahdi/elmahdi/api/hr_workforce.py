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
	# Elmahdi custom fields (Batch A.1).
	"elmahdi_branch_warehouse",
	"national_id",
	"elmahdi_address",
	"reports_to",
	"gender",
	"date_of_birth",
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
def list_employees(limit=200, start=0, branch=None, search=None, status=None):
	"""List employees for HR workspace (read).

	Filters:
	  branch  — match Employee.elmahdi_branch_warehouse exactly (warehouse id)
	  search  — substring match against employee_name OR national_id OR
	            cell_number OR employee id; case-insensitive
	  status  — Active / Inactive / Suspended / Left (Employee.status)
	"""
	_assert_may_read_employees()
	frappe.has_permission("Employee", "read", throw=True)

	filters: list = []
	if branch:
		filters.append(["elmahdi_branch_warehouse", "=", branch])
	if status:
		filters.append(["status", "=", status])

	or_filters: list = []
	if search:
		s = f"%{search.strip()}%"
		or_filters = [
			["employee_name", "like", s],
			["national_id", "like", s],
			["cell_number", "like", s],
			["name", "like", s],
			["employee", "like", s],
		]

	rows = frappe.get_list(
		"Employee",
		fields=EMPLOYEE_LIST_FIELDS,
		filters=filters,
		or_filters=or_filters or None,
		order_by="modified desc",
		limit_page_length=int(limit or 200),
		limit_start=int(start or 0),
	)
	return rows


@frappe.whitelist()
def list_branches():
	"""Picklist of warehouses usable as the Employee branch.

	Excludes group warehouses and disabled rows. The Store Manager filter
	UI on EmployeesPage uses this.
	"""
	_assert_may_read_employees()
	frappe.has_permission("Warehouse", "read", throw=True)
	return frappe.get_list(
		"Warehouse",
		filters={"is_group": 0, "disabled": 0},
		fields=["name", "warehouse_name"],
		order_by="warehouse_name asc",
		limit_page_length=200,
	)


@frappe.whitelist()
def list_active_employees_for_reports_to():
	"""Picklist for the 'Reports To' selector — only active employees."""
	_assert_may_read_employees()
	frappe.has_permission("Employee", "read", throw=True)
	return frappe.get_list(
		"Employee",
		filters={"status": "Active"},
		fields=["name", "employee_name", "department"],
		order_by="employee_name asc",
		limit_page_length=500,
	)


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

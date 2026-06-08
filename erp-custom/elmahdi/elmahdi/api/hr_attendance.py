"""
HR Attendance — whitelisted endpoints for the SPA.

Maps the SPA's 5 logical statuses → ERPNext Attendance combinations:

    SPA "Present"  → status="Present",   late_entry=0
    SPA "Absent"   → status="Absent"
    SPA "Late"     → status="Present",   late_entry=1
    SPA "Half Day" → status="Half Day"
    SPA "On Leave" → status="On Leave"

Row-level visibility is enforced by `row_scoping.attendance_pqc` from
Batch A (Store Manager → own-branch only; everyone else → own records).
Write access is gated by `assert_may_manage_attendance` (HR + Admin).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, getdate, today

from elmahdi.api.spa_authorization import (
	assert_may_access_hr_workspace,
	assert_may_manage_attendance,
	has_cap,
	is_break_glass_user,
)


# ── HRMS availability guard ───────────────────────────────────────────────
# ERPNext v15 moved Attendance / Leave Application / Salary Slip into the
# separate `hrms` app. If that app isn't installed yet, every endpoint
# below returns an "hrms_not_installed" envelope instead of 500-ing.

def _hrms_installed() -> bool:
	try:
		return frappe.db.table_exists("Attendance")
	except Exception:
		return False


_NOT_INSTALLED = {
	"hrms_not_installed": True,
	"hint": (
		"Install the `hrms` app to enable Attendance, Leave, and Payroll. "
		"Run: bench get-app hrms && bench --site SITE install-app hrms && "
		"bench --site SITE migrate"
	),
}


# ── status mapping ────────────────────────────────────────────────────────


SPA_STATUSES = ("Present", "Absent", "Late", "Half Day", "On Leave")

# (erpnext_status, late_entry_flag)
_SPA_TO_ERP = {
	"Present":  ("Present",  0),
	"Absent":   ("Absent",   0),
	"Late":     ("Present",  1),
	"Half Day": ("Half Day", 0),
	"On Leave": ("On Leave", 0),
}


def _erp_to_spa(status: str, late_entry: int) -> str:
	if status == "Present" and int(late_entry or 0) == 1:
		return "Late"
	return status or ""


def _assert_status(spa_status: str) -> tuple[str, int]:
	if spa_status not in _SPA_TO_ERP:
		frappe.throw(
			_("Unknown attendance status: {0}").format(spa_status),
			frappe.ValidationError,
		)
	return _SPA_TO_ERP[spa_status]


# ── read endpoints ────────────────────────────────────────────────────────


_LIST_FIELDS = [
	"name",
	"employee",
	"employee_name",
	"attendance_date",
	"status",
	"late_entry",
	"in_time",
	"out_time",
	"working_hours",
	"leave_type",
	"company",
	"department",
	"modified",
]


def _assert_may_read_attendance() -> None:
	"""HR / Store Manager / Admin can read; everyone else only via self-service."""
	assert_may_access_hr_workspace_or_self()


def assert_may_access_hr_workspace_or_self() -> None:
	"""Either HR-workspace access (HR Officer / Store Manager / Admin) OR
	the user has a linked Employee record (self-service)."""
	if is_break_glass_user():
		return
	if has_cap("can_access_hr_workspace") or has_cap("can_view_hr_reports"):
		return
	# Self-service: linked Employee record only.
	if frappe.db.exists("Employee", {"user_id": frappe.session.user}):
		return
	frappe.throw(
		_("You do not have permission to view attendance."),
		frappe.PermissionError,
	)


@frappe.whitelist()
def list_attendance(
	date_from: str | None = None,
	date_to: str | None = None,
	branch: str | None = None,
	employee: str | None = None,
	status: str | None = None,
	limit: int = 500,
):
	"""Attendance list with filters. Defaults to last 30 days.

	Branch filter joins Employee.elmahdi_branch_warehouse — passed through
	a sub-query so the existing `permission_query_conditions` still applies.
	"""
	_assert_may_read_attendance()
	if not _hrms_installed():
		return []
	frappe.has_permission("Attendance", "read", throw=True)

	to_d = date_to or today()
	from_d = date_from or add_days(to_d, -29)

	filters: list = [
		["attendance_date", ">=", str(from_d)],
		["attendance_date", "<=", str(to_d)],
		# Hide cancelled records — they're noise for the HR officer. The
		# amend pattern in `mark_attendance` produces these every time a
		# submitted record's status changes.
		["docstatus", "!=", 2],
	]
	if employee:
		filters.append(["employee", "=", employee])
	if status and status in _SPA_TO_ERP:
		erp_status, late_flag = _SPA_TO_ERP[status]
		filters.append(["status", "=", erp_status])
		if status == "Late":
			filters.append(["late_entry", "=", 1])

	if branch:
		# Scope to employees attached to the given branch warehouse.
		emp_names = frappe.db.sql_list(
			"SELECT name FROM `tabEmployee` WHERE elmahdi_branch_warehouse = %s",
			(branch,),
		)
		if not emp_names:
			return []
		filters.append(["employee", "in", emp_names])

	rows = frappe.get_list(
		"Attendance",
		filters=filters,
		fields=_LIST_FIELDS,
		order_by="attendance_date desc, employee asc",
		limit_page_length=int(limit or 500),
	)
	# Project to SPA shape — logical status + branch lookup.
	out: list[dict] = []
	emp_branch_cache: dict[str, str] = {}
	for r in rows:
		emp = r.get("employee")
		if emp and emp not in emp_branch_cache:
			emp_branch_cache[emp] = (
				frappe.db.get_value("Employee", emp, "elmahdi_branch_warehouse") or ""
			)
		out.append({
			"name": r.name,
			"employee": emp,
			"employee_name": r.employee_name,
			"attendance_date": str(r.attendance_date) if r.attendance_date else "",
			"status": _erp_to_spa(r.status, r.late_entry),
			"in_time": str(r.in_time) if r.in_time else "",
			"out_time": str(r.out_time) if r.out_time else "",
			"working_hours": float(r.working_hours or 0),
			"branch": emp_branch_cache.get(emp, ""),
			"department": r.department or "",
			"modified": str(r.modified) if r.modified else "",
		})
	return out


@frappe.whitelist()
def get_attendance_kpis(date: str | None = None):
	"""Counts for the dashboard's "Today" panel.

	Returns:
		{
			"date": "YYYY-MM-DD",
			"present": int, "absent": int, "late": int,
			"on_leave": int, "half_day": int,
			"employees": int   (active employee count for context)
		}
	"""
	_assert_may_read_attendance()
	if not _hrms_installed():
		return {
			**_NOT_INSTALLED,
			"date": date or today(),
			"present": 0, "absent": 0, "late": 0,
			"on_leave": 0, "half_day": 0,
			"employees": int(frappe.db.count("Employee", filters={"status": "Active"}) or 0),
		}
	frappe.has_permission("Attendance", "read", throw=True)
	d = date or today()

	rows = frappe.db.sql(
		"""
		SELECT status, late_entry, COUNT(*) AS c
		FROM `tabAttendance`
		WHERE attendance_date = %s AND docstatus != 2
		GROUP BY status, late_entry
		""",
		(d,),
		as_dict=True,
	)
	out = {"present": 0, "absent": 0, "late": 0, "on_leave": 0, "half_day": 0}
	for r in rows:
		s = (r.status or "").strip()
		if s == "Present":
			if int(r.late_entry or 0) == 1:
				out["late"] += int(r.c)
			else:
				out["present"] += int(r.c)
		elif s == "Absent":
			out["absent"] += int(r.c)
		elif s == "On Leave":
			out["on_leave"] += int(r.c)
		elif s == "Half Day":
			out["half_day"] += int(r.c)

	out["date"] = str(d)
	out["employees"] = int(
		frappe.db.count("Employee", filters={"status": "Active"}) or 0
	)
	return out


# ── write endpoints ───────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def mark_attendance(
	employee: str,
	attendance_date: str,
	status: str,
	in_time: str | None = None,
	out_time: str | None = None,
	notes: str | None = None,
):
	"""Create-or-update a single Attendance record.

	If a record already exists for (employee, attendance_date) we update
	it; otherwise we create and submit. ERPNext blocks duplicates by its
	own validation, so we look it up first to update instead of failing.
	"""
	assert_may_manage_attendance()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed on this site. Install it to enable attendance tracking."),
			frappe.ValidationError,
		)
	if not employee or not attendance_date or not status:
		frappe.throw(
			_("employee, attendance_date and status are required."),
			frappe.ValidationError,
		)
	erp_status, late_flag = _assert_status(status)

	existing = frappe.db.get_value(
		"Attendance",
		{"employee": employee, "attendance_date": str(attendance_date), "docstatus": ["!=", 2]},
		["name", "docstatus", "status", "late_entry"],
		as_dict=True,
	)
	if existing:
		# ERPNext locks `status` and `late_entry` after submit — the only
		# way to change them is to cancel the existing record and create
		# a fresh one. If the row is still a draft (docstatus=0) the
		# normal update path works.
		needs_amend = (
			int(existing.docstatus or 0) == 1
			and (existing.status != erp_status
			     or int(existing.late_entry or 0) != int(late_flag))
		)
		if needs_amend:
			to_cancel = frappe.get_doc("Attendance", existing.name)
			to_cancel.flags.ignore_permissions = True
			to_cancel.cancel()
			# Fall through to insert + submit a fresh one below.
		else:
			doc = frappe.get_doc("Attendance", existing.name)
			doc.status = erp_status
			doc.late_entry = late_flag
			if in_time is not None:
				doc.in_time = in_time or None
			if out_time is not None:
				doc.out_time = out_time or None
			doc.flags.ignore_permissions = True
			doc.save()
			return {"name": doc.name, "updated": True, "status": status}

	doc = frappe.get_doc({
		"doctype": "Attendance",
		"employee": employee,
		"attendance_date": str(attendance_date),
		"status": erp_status,
		"late_entry": late_flag,
		"in_time": in_time or None,
		"out_time": out_time or None,
		"company": frappe.db.get_value("Employee", employee, "company")
			or frappe.defaults.get_user_default("Company"),
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return {"name": doc.name, "created": True, "status": status}


@frappe.whitelist(methods=["POST"])
def bulk_mark_attendance(
	attendance_date: str,
	default_status: str = "Present",
	branch: str | None = None,
	overrides: str | dict | None = None,
):
	"""Bulk-mark attendance for all active employees in a branch.

	`overrides` is a dict mapping `employee -> spa_status` for per-row
	exceptions (e.g. mark everyone Present except 2 Absent). Default
	status is applied to the rest.

	Returns a per-employee result list.
	"""
	assert_may_manage_attendance()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed on this site."),
			frappe.ValidationError,
		)
	if isinstance(overrides, str):
		import json
		try:
			overrides = json.loads(overrides)
		except Exception:
			overrides = {}
	overrides = overrides or {}

	# Build the employee list for this branch (or all active employees if
	# branch is omitted — Admin / HR fallback).
	filters = {"status": "Active"}
	if branch:
		filters["elmahdi_branch_warehouse"] = branch
	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=["name", "employee_name"],
		limit_page_length=2000,
	)
	if not employees:
		return {"count": 0, "results": []}

	results = []
	for emp in employees:
		spa_status = overrides.get(emp.name) or default_status
		try:
			res = mark_attendance(
				employee=emp.name,
				attendance_date=attendance_date,
				status=spa_status,
			)
			results.append({
				"employee": emp.name,
				"employee_name": emp.employee_name,
				"status": spa_status,
				"ok": True,
				"detail": res,
			})
		except Exception as e:
			results.append({
				"employee": emp.name,
				"employee_name": emp.employee_name,
				"status": spa_status,
				"ok": False,
				"error": str(e)[:200],
			})
	frappe.db.commit()
	return {"count": len(results), "results": results}


@frappe.whitelist(methods=["POST"])
def delete_attendance(name: str):
	"""Cancel + remove an attendance row. HR / Admin only."""
	assert_may_manage_attendance()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed on this site."),
			frappe.ValidationError,
		)
	if not frappe.db.exists("Attendance", name):
		frappe.throw(_("Attendance {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Attendance", name)
	if doc.docstatus == 1:
		doc.cancel()
	doc = frappe.get_doc("Attendance", name)
	doc.flags.ignore_permissions = True
	doc.delete()
	return {"deleted": name}


# ─── Phase 4.b · Domain 3 — Batch attendance operations ────────────────────
#
# Two endpoints surface the existing single-row primitives through
# `run_row_batch` so HR can fix end-of-day data in one shot instead of
# clicking 30 individual rows:
#
#   • batch_update_attendance_status(items, status)  — re-amend N records
#     to the same status (e.g. "Half Day" for everyone who left early).
#   • batch_delete_attendance(items)                 — remove N records
#     (cancellation cascade preserved per row).
#
# Branch + employee scoping is enforced via the existing
# permission_query_conditions on `Attendance` (row_scoping.attendance_pqc).
# The batch wrappers add a per-row `has_permission("write")` check so a
# motivated client passing a name outside their scope gets a clean
# row-level failure rather than mutating data outside their reach.


def _resolve_attendance_employee(name: str) -> str:
	"""Lookup helper used by the update path. The single-doc
	mark_attendance API works at (employee, date, status) level rather
	than (name, status), because ERPNext's submit/amend semantics make
	an in-place status flip on a submitted doc impossible. We fetch the
	(employee, date) pair from the attendance row so we can call
	mark_attendance with the right arguments."""
	row = frappe.db.get_value(
		"Attendance",
		name,
		["employee", "attendance_date", "in_time", "out_time"],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Attendance {0} not found.").format(name), frappe.DoesNotExistError)
	return row


def _batch_update_attendance_row(item, _index, *, default_status: str):
	"""Per-row callback for batch_update_attendance_status."""
	if isinstance(item, str):
		name = item
		status = default_status
	elif isinstance(item, dict):
		name = item.get("name") or item.get("docname")
		status = item.get("status") or default_status
	else:
		frappe.throw(_("Invalid batch item shape."), frappe.ValidationError)

	if not name:
		frappe.throw(_("Missing attendance row name."), frappe.ValidationError)
	if status not in _SPA_TO_ERP:
		frappe.throw(_("Invalid attendance status."), frappe.ValidationError)

	# Branch + employee scope guard.
	if not frappe.has_permission("Attendance", "write", doc=name):
		frappe.throw(
			_("Attendance row {0} is not in your branch scope.").format(name),
			frappe.PermissionError,
		)

	row = _resolve_attendance_employee(name)
	# Delegate to the existing single-doc primitive — it handles the
	# submit/cancel/amend dance correctly and preserves notes/in_time/
	# out_time when only status changes.
	result = mark_attendance(
		employee=row["employee"],
		attendance_date=str(row["attendance_date"]),
		status=status,
		in_time=row.get("in_time"),
		out_time=row.get("out_time"),
	)
	return {
		"name": result.get("name") or name,
		"status": status,
		"action": "updated" if result.get("updated") else "amended",
	}


def _batch_delete_attendance_row(item, _index):
	"""Per-row callback for batch_delete_attendance."""
	if isinstance(item, str):
		name = item
	elif isinstance(item, dict):
		name = item.get("name") or item.get("docname")
	else:
		frappe.throw(_("Invalid batch item shape."), frappe.ValidationError)
	if not name:
		frappe.throw(_("Missing attendance row name."), frappe.ValidationError)

	# Delete is enforced as a write permission for HR + Admin; the row
	# scoping check covers branch isolation for Store Manager (who in
	# practice can read attendance but doesn't have can_manage_attendance,
	# so the role gate in the wrapper rejects them first).
	if not frappe.has_permission("Attendance", "write", doc=name):
		frappe.throw(
			_("Attendance row {0} is not in your branch scope.").format(name),
			frappe.PermissionError,
		)

	delete_attendance(name)
	return {"name": name, "action": "deleted"}


@frappe.whitelist(methods=["POST"])
def batch_update_attendance_status(items=None, status: str = ""):
	"""Update the status of N attendance rows in one call.

	`items` is a list of attendance row names (strings) OR a list of
	``{name, status?}`` dicts when callers need a heterogeneous batch
	(e.g. set 5 to Half Day and 3 to Late). When `status` is provided
	at the top level it acts as the default for plain-name items.

	Returns the standard run_row_batch envelope.
	"""
	assert_may_manage_attendance()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed on this site."),
			frappe.ValidationError,
		)
	from elmahdi.api._batch import run_row_batch

	if isinstance(items, str):
		import json as _json
		try:
			items = _json.loads(items)
		except ValueError:
			items = []

	# Default-status validation only when items are plain names. Mixed
	# batches carry per-row statuses and the row callback validates each.
	is_mixed = any(isinstance(i, dict) and i.get("status") for i in (items or []))
	if not is_mixed and status not in _SPA_TO_ERP:
		frappe.throw(_("Invalid attendance status."), frappe.ValidationError)

	return run_row_batch(
		items or [],
		lambda item, idx: _batch_update_attendance_row(
			item, idx, default_status=status or "Present",
		),
		action="attendance.batch_update_status",
		doctype="Attendance",
		summary_extra={"status": status, "mixed": is_mixed},
	)


@frappe.whitelist(methods=["POST"])
def batch_delete_attendance(items=None):
	"""Cancel + remove N attendance rows in one call.

	`items` is a list of names. Per-row failures (record already
	deleted, linked to a leave application that won't cancel, etc.) are
	surfaced via the result envelope; the rest of the batch continues.
	"""
	assert_may_manage_attendance()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed on this site."),
			frappe.ValidationError,
		)
	from elmahdi.api._batch import run_row_batch

	if isinstance(items, str):
		import json as _json
		try:
			items = _json.loads(items)
		except ValueError:
			items = []

	return run_row_batch(
		items or [],
		_batch_delete_attendance_row,
		action="attendance.batch_delete",
		doctype="Attendance",
	)

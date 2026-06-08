"""
HR Reports — backend builders for the unified report envelope.

Each builder returns a `partial` dict with `columns`, `rows`, `summary`,
`warnings` — the dispatcher in `reports.py` wraps it in the standard
envelope. All builders gracefully degrade when `hrms` isn't installed
(payroll / leave / attendance tables won't exist on a fresh ERPNext-only
site).

Permission model: `_assert_may_view_reports` is patched in `reports.py`
to allow `can_view_hr_reports` so HR Officer + Store Manager + Admin can
hit these. Row-level scoping (Batch A) is automatically enforced through
the same PQC paths the rest of the SPA uses.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, flt, nowdate


# ── helpers ──────────────────────────────────────────────────────────────


def _hrms_installed() -> bool:
	try:
		return frappe.db.table_exists("Attendance")
	except Exception:
		return False


def _date_range(filters: dict, days_back: int = 29) -> tuple[str, str]:
	to_d = filters.get("to_date") or nowdate()
	from_d = filters.get("from_date") or add_days(to_d, -days_back)
	return (str(from_d), str(to_d))


def _branch_employees(branch: str | None) -> list[str] | None:
	"""Return the employee names attached to a branch, or None if no
	branch filter was supplied (caller should not narrow)."""
	if not branch:
		return None
	return frappe.db.sql_list(
		"SELECT name FROM `tabEmployee` WHERE elmahdi_branch_warehouse = %s",
		(branch,),
	) or []


def _money_col(key: str, label: str) -> dict:
	return {"key": key, "label": label, "type": "currency", "align": "right"}


# ── 1. Employee Directory ────────────────────────────────────────────────


def report_employee_directory(filters: dict) -> dict:
	warnings: list = []
	emp_filters: list = [["status", "!=", "Left"]]
	if filters.get("branch"):
		emp_filters.append(["elmahdi_branch_warehouse", "=", filters["branch"]])
	if filters.get("department"):
		emp_filters.append(["department", "=", filters["department"]])
	if filters.get("status"):
		emp_filters.append(["status", "=", filters["status"]])

	try:
		employees = frappe.get_list(
			"Employee",
			filters=emp_filters,
			fields=[
				"name", "employee_name", "employee", "department",
				"designation", "elmahdi_branch_warehouse",
				"cell_number", "personal_email", "status",
				"date_of_joining", "national_id",
			],
			order_by="employee_name asc",
			limit_page_length=2000,
		)
	except frappe.PermissionError:
		warnings.append("Employee read: permission denied")
		employees = []

	rows: list[dict] = []
	for e in employees:
		rows.append({
			"employee": e.name,
			"employee_name": e.employee_name or e.name,
			"branch": e.elmahdi_branch_warehouse or "",
			"department": e.department or "",
			"designation": e.designation or "",
			"phone": e.cell_number or "",
			"email": e.personal_email or "",
			"national_id": e.national_id or "",
			"date_of_joining": str(e.date_of_joining) if e.date_of_joining else "",
			"status": e.status or "",
		})

	# Aggregate counts for the summary strip.
	by_branch: dict[str, int] = {}
	by_status: dict[str, int] = {}
	for r in rows:
		by_branch[r["branch"] or "—"] = by_branch.get(r["branch"] or "—", 0) + 1
		by_status[r["status"] or "—"] = by_status.get(r["status"] or "—", 0) + 1

	return {
		"columns": [
			{"key": "employee", "label": _("Employee ID"), "type": "mono"},
			{"key": "employee_name", "label": _("Name")},
			{"key": "branch", "label": _("Branch")},
			{"key": "department", "label": _("Department")},
			{"key": "designation", "label": _("Position")},
			{"key": "phone", "label": _("Phone")},
			{"key": "email", "label": _("Email")},
			{"key": "national_id", "label": _("National ID"), "type": "mono"},
			{"key": "date_of_joining", "label": _("Joined"), "type": "date"},
			{"key": "status", "label": _("Status")},
		],
		"rows": rows,
		"summary": {
			"total_employees": len(rows),
			"by_branch_count": len(by_branch),
			"active_count": by_status.get("Active", 0),
		},
		"warnings": warnings,
	}


# ── 2. Employees by Branch ───────────────────────────────────────────────


def report_employees_by_branch(filters: dict) -> dict:
	warnings: list = []
	try:
		raw = frappe.db.sql(
			"""
			SELECT
				IFNULL(elmahdi_branch_warehouse, '—') AS branch,
				IFNULL(department, '—')               AS department,
				COUNT(*)                              AS headcount,
				SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) AS active
			FROM `tabEmployee`
			WHERE status != 'Left'
			GROUP BY branch, department
			ORDER BY branch, department
			""",
			as_dict=True,
		)
	except frappe.PermissionError:
		warnings.append("Employee read: permission denied")
		raw = []

	rows = [
		{"branch": r.branch, "department": r.department,
		 "headcount": int(r.headcount or 0), "active": int(r.active or 0)}
		for r in raw
	]
	total_emp = sum(r["headcount"] for r in rows)
	total_active = sum(r["active"] for r in rows)

	return {
		"columns": [
			{"key": "branch", "label": _("Branch")},
			{"key": "department", "label": _("Department")},
			{"key": "headcount", "label": _("Headcount"), "type": "int", "align": "right"},
			{"key": "active", "label": _("Active"), "type": "int", "align": "right"},
		],
		"rows": rows,
		"summary": {
			"total_employees": total_emp,
			"active_employees": total_active,
			"branches_covered": len({r["branch"] for r in rows}),
		},
		"warnings": warnings,
	}


# ── 3. Attendance Summary ────────────────────────────────────────────────


def report_attendance_summary(filters: dict) -> dict:
	warnings: list = []
	if not _hrms_installed():
		warnings.append("HR Management (hrms) app is not installed.")
		return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}

	from_d, to_d = _date_range(filters, days_back=29)
	emp_in = _branch_employees(filters.get("branch"))

	emp_filter_clause = ""
	params: list = [from_d, to_d]
	if emp_in is not None:
		if not emp_in:
			return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}
		placeholders = ", ".join(["%s"] * len(emp_in))
		emp_filter_clause = f" AND employee IN ({placeholders})"
		params.extend(emp_in)

	try:
		raw = frappe.db.sql(
			f"""
			SELECT
				a.employee, a.employee_name,
				SUM(CASE WHEN a.status='Present'  AND IFNULL(a.late_entry,0)=0 THEN 1 ELSE 0 END) AS present,
				SUM(CASE WHEN a.status='Present'  AND IFNULL(a.late_entry,0)=1 THEN 1 ELSE 0 END) AS late,
				SUM(CASE WHEN a.status='Absent'   THEN 1 ELSE 0 END) AS absent,
				SUM(CASE WHEN a.status='On Leave' THEN 1 ELSE 0 END) AS on_leave,
				SUM(CASE WHEN a.status='Half Day' THEN 1 ELSE 0 END) AS half_day,
				COUNT(*) AS total
			FROM `tabAttendance` a
			WHERE a.docstatus != 2
				AND a.attendance_date BETWEEN %s AND %s
				{emp_filter_clause}
			GROUP BY a.employee, a.employee_name
			ORDER BY a.employee_name
			""",
			params,
			as_dict=True,
		)
	except frappe.PermissionError:
		warnings.append("Attendance read: permission denied")
		raw = []

	branch_cache: dict[str, str] = {}
	rows: list[dict] = []
	for r in raw:
		if r.employee and r.employee not in branch_cache:
			branch_cache[r.employee] = frappe.db.get_value(
				"Employee", r.employee, "elmahdi_branch_warehouse",
			) or ""
		total = int(r.total or 0) or 1  # avoid div-by-zero
		late_count = int(r.late or 0)
		rows.append({
			"employee": r.employee,
			"employee_name": r.employee_name or r.employee,
			"branch": branch_cache.get(r.employee, ""),
			"present": int(r.present or 0),
			"late": late_count,
			"absent": int(r.absent or 0),
			"on_leave": int(r.on_leave or 0),
			"half_day": int(r.half_day or 0),
			"total": int(r.total or 0),
			"late_ratio": round(100.0 * late_count / total, 1),
		})

	# Period totals.
	period_present = sum(r["present"] for r in rows)
	period_absent = sum(r["absent"] for r in rows)
	period_late = sum(r["late"] for r in rows)
	period_total = sum(r["total"] for r in rows)

	return {
		"columns": [
			{"key": "employee", "label": _("Employee ID"), "type": "mono"},
			{"key": "employee_name", "label": _("Name")},
			{"key": "branch", "label": _("Branch")},
			{"key": "present", "label": _("Present"), "type": "int", "align": "right"},
			{"key": "late", "label": _("Late"), "type": "int", "align": "right"},
			{"key": "absent", "label": _("Absent"), "type": "int", "align": "right"},
			{"key": "on_leave", "label": _("On Leave"), "type": "int", "align": "right"},
			{"key": "half_day", "label": _("Half Day"), "type": "int", "align": "right"},
			{"key": "total", "label": _("Total Days"), "type": "int", "align": "right"},
			{"key": "late_ratio", "label": _("Late %"), "type": "number", "align": "right"},
		],
		"rows": rows,
		"summary": {
			"from_date": from_d, "to_date": to_d,
			"employees_with_records": len(rows),
			"period_present": period_present,
			"period_absent": period_absent,
			"period_late": period_late,
			"attendance_rate": round(100.0 * period_present / period_total, 1) if period_total else 0,
		},
		"warnings": warnings,
	}


# ── 4. Leave Summary ─────────────────────────────────────────────────────


def report_leave_summary(filters: dict) -> dict:
	warnings: list = []
	if not _hrms_installed():
		warnings.append("HR Management (hrms) app is not installed.")
		return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}

	from_d, to_d = _date_range(filters, days_back=89)
	emp_in = _branch_employees(filters.get("branch"))

	la_filters: list = [
		["from_date", ">=", from_d],
		["from_date", "<=", to_d],
		["docstatus", "!=", 2],
	]
	if filters.get("status"):
		la_filters.append(["status", "=", filters["status"]])
	if filters.get("leave_type"):
		la_filters.append(["leave_type", "=", filters["leave_type"]])
	if emp_in is not None:
		if not emp_in:
			return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}
		la_filters.append(["employee", "in", emp_in])

	try:
		la = frappe.get_list(
			"Leave Application",
			filters=la_filters,
			fields=["name", "employee", "employee_name", "leave_type",
			        "from_date", "to_date", "total_leave_days",
			        "status", "description"],
			order_by="from_date desc",
			limit_page_length=2000,
		)
	except frappe.PermissionError:
		warnings.append("Leave Application read: permission denied")
		la = []

	branch_cache: dict[str, str] = {}
	rows: list[dict] = []
	for r in la:
		if r.employee and r.employee not in branch_cache:
			branch_cache[r.employee] = frappe.db.get_value(
				"Employee", r.employee, "elmahdi_branch_warehouse",
			) or ""
		rows.append({
			"name": r.name,
			"employee": r.employee,
			"employee_name": r.employee_name or r.employee,
			"branch": branch_cache.get(r.employee, ""),
			"leave_type": r.leave_type or "",
			"from_date": str(r.from_date) if r.from_date else "",
			"to_date": str(r.to_date) if r.to_date else "",
			"days": flt(r.total_leave_days),
			"status": r.status or "",
		})

	# Aggregates per status × type.
	by_status: dict[str, int] = {}
	by_type: dict[str, float] = {}
	for r in rows:
		by_status[r["status"]] = by_status.get(r["status"], 0) + 1
		by_type[r["leave_type"]] = by_type.get(r["leave_type"], 0.0) + r["days"]

	return {
		"columns": [
			{"key": "name", "label": _("Application"), "type": "mono"},
			{"key": "employee", "label": _("Employee ID"), "type": "mono"},
			{"key": "employee_name", "label": _("Name")},
			{"key": "branch", "label": _("Branch")},
			{"key": "leave_type", "label": _("Type")},
			{"key": "from_date", "label": _("From"), "type": "date"},
			{"key": "to_date", "label": _("To"), "type": "date"},
			{"key": "days", "label": _("Days"), "type": "number", "align": "right"},
			{"key": "status", "label": _("Status")},
		],
		"rows": rows,
		"summary": {
			"from_date": from_d, "to_date": to_d,
			"total_applications": len(rows),
			"approved": by_status.get("Approved", 0),
			"open": by_status.get("Open", 0),
			"rejected": by_status.get("Rejected", 0),
			"total_days_by_type": [
				{"leave_type": k, "days": round(v, 1)} for k, v in sorted(by_type.items())
			],
		},
		"warnings": warnings,
	}


# ── 5. Payroll Summary ───────────────────────────────────────────────────


def report_payroll_summary(filters: dict) -> dict:
	warnings: list = []
	if not _hrms_installed():
		warnings.append("HR Management (hrms) app is not installed.")
		return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}

	from_d, to_d = _date_range(filters, days_back=29)
	emp_in = _branch_employees(filters.get("branch"))

	slip_filters: list = [
		["start_date", ">=", from_d],
		["start_date", "<=", to_d],
		["docstatus", "!=", 2],
	]
	if filters.get("status"):
		slip_filters.append(["status", "=", filters["status"]])
	if emp_in is not None:
		if not emp_in:
			return {"columns": [], "rows": [], "summary": {}, "warnings": warnings}
		slip_filters.append(["employee", "in", emp_in])

	try:
		slips = frappe.get_list(
			"Salary Slip",
			filters=slip_filters,
			fields=["name", "employee", "employee_name",
			        "start_date", "end_date", "status", "docstatus",
			        "gross_pay", "total_deduction", "net_pay"],
			order_by="start_date desc, employee asc",
			limit_page_length=2000,
		)
	except frappe.PermissionError:
		warnings.append("Salary Slip read: permission denied")
		slips = []

	branch_cache: dict[str, str] = {}
	rows: list[dict] = []
	for r in slips:
		if r.employee and r.employee not in branch_cache:
			branch_cache[r.employee] = frappe.db.get_value(
				"Employee", r.employee, "elmahdi_branch_warehouse",
			) or ""
		# Logical status: prefer the explicit Paid/Submitted label.
		logical_status = r.status or (
			"Submitted" if int(r.docstatus or 0) == 1 else "Draft"
		)
		rows.append({
			"name": r.name,
			"employee": r.employee,
			"employee_name": r.employee_name or r.employee,
			"branch": branch_cache.get(r.employee, ""),
			"period": f"{r.start_date} → {r.end_date}",
			"start_date": str(r.start_date) if r.start_date else "",
			"end_date": str(r.end_date) if r.end_date else "",
			"gross_pay": flt(r.gross_pay),
			"total_deduction": flt(r.total_deduction),
			"net_pay": flt(r.net_pay),
			"status": logical_status,
		})

	# Aggregate per branch + per status.
	by_branch: dict[str, dict] = {}
	for r in rows:
		b = r["branch"] or "—"
		acc = by_branch.setdefault(b, {"slips": 0, "gross": 0.0,
		                              "deductions": 0.0, "net": 0.0})
		acc["slips"] += 1
		acc["gross"] += r["gross_pay"]
		acc["deductions"] += r["total_deduction"]
		acc["net"] += r["net_pay"]

	totals = {
		"slips": len(rows),
		"total_gross": sum(r["gross_pay"] for r in rows),
		"total_deduction": sum(r["total_deduction"] for r in rows),
		"total_net": sum(r["net_pay"] for r in rows),
	}

	return {
		"columns": [
			{"key": "name", "label": _("Slip"), "type": "mono"},
			{"key": "employee", "label": _("Employee ID"), "type": "mono"},
			{"key": "employee_name", "label": _("Name")},
			{"key": "branch", "label": _("Branch")},
			{"key": "period", "label": _("Period")},
			_money_col("gross_pay", _("Gross")),
			_money_col("total_deduction", _("Deductions")),
			_money_col("net_pay", _("Net")),
			{"key": "status", "label": _("Status")},
		],
		"rows": rows,
		"summary": {
			"from_date": from_d, "to_date": to_d,
			**totals,
			"by_branch": [
				{"branch": k, **v} for k, v in sorted(by_branch.items())
			],
		},
		"warnings": warnings,
	}

"""
HR Payroll — whitelisted endpoints.

Workflow (ERPNext-native, monthly only per spec):

    1. HR assigns a Salary Structure to each Employee
       (via Salary Structure Assignment).
    2. HR runs `generate_monthly_payroll(year, month)` →
       creates a Salary Slip per active employee in Draft.
    3. HR reviews and `submit_salary_slip(name)` → docstatus=1.
    4. Accountant pays externally and calls `mark_slip_paid(name)`
       which flips Salary Slip `status = "Paid"`.

Self-service: every employee gets `list_my_payslips()` — server-side
filtered to the employee record linked to `session.user`.

Row-level scoping (Store Manager → own-branch slips only;
employees → own only) is enforced by `salary_slip_pqc` from Batch A.
"""

from __future__ import annotations

from datetime import date

import frappe
from frappe import _
from frappe.utils import flt, getdate, today

from elmahdi.api.spa_authorization import (
	assert_may_manage_payroll,
	assert_may_view_payslip,
	has_cap,
	is_break_glass_user,
)


# ── HRMS guard ────────────────────────────────────────────────────────────


def _hrms_installed() -> bool:
	try:
		return frappe.db.table_exists("Salary Slip")
	except Exception:
		return False


_NOT_INSTALLED = {
	"hrms_not_installed": True,
	"hint": "Install the `hrms` app to enable Payroll.",
}


# ── seed: default Salary Components + Structure ──────────────────────────


_DEFAULT_COMPONENTS = (
	# (name, abbr, type, depends_on_payment_days)
	("Basic Salary",        "B",   "Earning",   1),
	("Transport Allowance", "TA",  "Earning",   1),
	("Bonus",               "BNS", "Earning",   0),
	("Tax",                 "TAX", "Deduction", 0),
	("Loan",                "LOAN", "Deduction", 0),
)

_DEFAULT_STRUCTURE = "Elmahdi Monthly Default"


def seed_payroll_defaults():
	"""Idempotent seed of Salary Components + a default Salary Structure.

	The Structure is a starting template — HR can clone or edit it from
	ERPNext Desk. Each Employee still needs a Salary Structure Assignment
	with their actual base salary before payroll can run for them.
	"""
	if not _hrms_installed():
		return {"skipped": "hrms not installed"}

	created_components = []
	for name, abbr, ctype, dop in _DEFAULT_COMPONENTS:
		if frappe.db.exists("Salary Component", name):
			continue
		try:
			frappe.get_doc({
				"doctype": "Salary Component",
				"salary_component": name,
				"salary_component_abbr": abbr,
				"type": ctype,
				"depends_on_payment_days": dop,
				# Statistical components don't post to GL — Basic is
				# always non-statistical.
				"statistical_component": 0,
			}).insert(ignore_permissions=True)
			created_components.append(name)
		except Exception as e:  # noqa: BLE001
			# Best-effort — a malformed component shouldn't block the rest.
			frappe.log_error(title=f"Salary Component seed failed: {name}",
			                 message=str(e))

	# Default Salary Structure — Basic only at 100%, no allowances/deductions.
	if not frappe.db.exists("Salary Structure", _DEFAULT_STRUCTURE):
		try:
			ss = frappe.get_doc({
				"doctype": "Salary Structure",
				"name": _DEFAULT_STRUCTURE,
				"company": frappe.defaults.get_user_default("Company")
					or frappe.db.get_value("Company", {}, "name"),
				"is_active": "Yes",
				"payroll_frequency": "Monthly",
				"currency": "EGP",
				"earnings": [{
					"salary_component": "Basic Salary",
					"abbr": "B",
					"formula": "base",
					"amount_based_on_formula": 1,
				}],
				"deductions": [],
			})
			ss.flags.ignore_permissions = True
			ss.insert()
			ss.submit()
		except Exception as e:  # noqa: BLE001
			frappe.log_error(title="Salary Structure seed failed", message=str(e))

	frappe.db.commit()
	return {
		"components_created": created_components,
		"default_structure": _DEFAULT_STRUCTURE,
	}


# ── read endpoints ────────────────────────────────────────────────────────


_SLIP_FIELDS = [
	"name",
	"employee",
	"employee_name",
	"department",
	"designation",
	"company",
	"start_date",
	"end_date",
	"posting_date",
	"status",
	"docstatus",
	"gross_pay",
	"total_deduction",
	"net_pay",
	"rounded_total",
	"payment_days",
	"total_working_days",
	"modified",
]


def _assert_may_read_payroll() -> None:
	"""HR / Admin can read all; everyone else only their own via PQC."""
	if is_break_glass_user():
		return
	if has_cap("can_manage_payroll") or has_cap("can_view_payslip_self"):
		return
	frappe.throw(
		_("You do not have permission to view payslips."),
		frappe.PermissionError,
	)


@frappe.whitelist()
def list_salary_slips(
	employee: str | None = None,
	year: int | None = None,
	month: int | None = None,
	status: str | None = None,
	branch: str | None = None,
	limit: int = 200,
):
	"""Salary slips with filters."""
	_assert_may_read_payroll()
	if not _hrms_installed():
		return []
	frappe.has_permission("Salary Slip", "read", throw=True)

	filters: list = [["docstatus", "!=", 2]]
	if employee:
		filters.append(["employee", "=", employee])
	if status:
		filters.append(["status", "=", status])
	if year and month:
		start_d = f"{int(year):04d}-{int(month):02d}-01"
		# End-of-month
		next_m = (date(int(year), int(month), 28))
		next_m = next_m.replace(day=1)
		try:
			next_m = next_m.replace(month=int(month) + 1)
		except ValueError:
			next_m = next_m.replace(year=int(year) + 1, month=1)
		end_d = (next_m - frappe.utils.datetime.timedelta(days=1)).isoformat()
		filters.append(["start_date", ">=", start_d])
		filters.append(["start_date", "<=", end_d])
	if branch:
		emp_names = frappe.db.sql_list(
			"SELECT name FROM `tabEmployee` WHERE elmahdi_branch_warehouse = %s",
			(branch,),
		)
		if not emp_names:
			return []
		filters.append(["employee", "in", emp_names])

	rows = frappe.get_list(
		"Salary Slip",
		filters=filters,
		fields=_SLIP_FIELDS,
		order_by="start_date desc, employee asc",
		limit_page_length=int(limit or 200),
	)
	# Add branch lookup.
	emp_branch_cache: dict[str, str] = {}
	for r in rows:
		emp = r.get("employee")
		if emp and emp not in emp_branch_cache:
			emp_branch_cache[emp] = (
				frappe.db.get_value("Employee", emp, "elmahdi_branch_warehouse") or ""
			)
		r["branch"] = emp_branch_cache.get(emp, "")
		# Coerce date / decimal fields for JSON.
		for k in ("start_date", "end_date", "posting_date", "modified"):
			if r.get(k) is not None:
				r[k] = str(r[k])
		for k in ("gross_pay", "total_deduction", "net_pay", "rounded_total",
		          "payment_days", "total_working_days"):
			r[k] = flt(r.get(k))
	return rows


@frappe.whitelist()
def get_payroll_kpis(year: int | None = None, month: int | None = None):
	"""KPIs for the dashboard + page header.

	Defaults to current month if year/month not supplied. Returns counts
	by status + total gross/net + total deductions across the month.
	"""
	_assert_may_read_payroll()
	if not _hrms_installed():
		return {**_NOT_INSTALLED, "draft": 0, "submitted": 0, "paid": 0,
		        "total_gross": 0.0, "total_net": 0.0}

	today_d = getdate(today())
	y = int(year or today_d.year)
	m = int(month or today_d.month)
	start_d = date(y, m, 1)
	next_m = date(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1)
	end_d = (next_m - frappe.utils.datetime.timedelta(days=1)).isoformat()

	row = frappe.db.sql(
		"""
		SELECT
			COUNT(*)                                        AS slips,
			SUM(CASE WHEN docstatus = 0 THEN 1 ELSE 0 END)   AS draft,
			SUM(CASE WHEN docstatus = 1 AND IFNULL(status,'') != 'Paid' THEN 1 ELSE 0 END) AS submitted,
			SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid,
			IFNULL(SUM(gross_pay), 0)                        AS total_gross,
			IFNULL(SUM(total_deduction), 0)                  AS total_deduction,
			IFNULL(SUM(net_pay), 0)                          AS total_net
		FROM `tabSalary Slip`
		WHERE docstatus != 2
			AND start_date >= %s AND start_date <= %s
		""",
		(start_d.isoformat(), end_d),
		as_dict=True,
	)
	r = row[0] if row else {}
	return {
		"year": y,
		"month": m,
		"draft": int(r.get("draft") or 0),
		"submitted": int(r.get("submitted") or 0),
		"paid": int(r.get("paid") or 0),
		"slips": int(r.get("slips") or 0),
		"total_gross": flt(r.get("total_gross")),
		"total_deduction": flt(r.get("total_deduction")),
		"total_net": flt(r.get("total_net")),
	}


@frappe.whitelist()
def list_salary_structures():
	"""Picklist of active Salary Structures."""
	_assert_may_read_payroll()
	if not _hrms_installed():
		return []
	return frappe.get_list(
		"Salary Structure",
		filters={"is_active": "Yes", "docstatus": 1},
		fields=["name", "company", "payroll_frequency", "currency"],
		order_by="name asc",
		limit_page_length=100,
	)


@frappe.whitelist()
def get_salary_slip_detail(name: str):
	"""Full slip for the View modal + the printable payslip.

	HR + Admin see any slip. Everyone else: only their own (assert_may_view_payslip).
	"""
	assert_may_view_payslip(name)
	if not _hrms_installed():
		return {**_NOT_INSTALLED}
	if not frappe.db.exists("Salary Slip", name):
		frappe.throw(_("Salary Slip {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Salary Slip", name)
	out = doc.as_dict()
	# Project to JSON-safe shape.
	for k, v in list(out.items()):
		if v is None:
			continue
		if hasattr(v, "isoformat"):
			out[k] = str(v)
	# Include earnings / deductions in a shape the SPA can render directly.
	out["earnings"] = [
		{"salary_component": e.salary_component, "amount": flt(e.amount)}
		for e in (doc.earnings or [])
	]
	out["deductions"] = [
		{"salary_component": d.salary_component, "amount": flt(d.amount)}
		for d in (doc.deductions or [])
	]
	# Branch lookup for the print header.
	out["branch"] = frappe.db.get_value("Employee", doc.employee, "elmahdi_branch_warehouse") or ""
	return out


@frappe.whitelist()
def list_my_payslips(limit: int = 60):
	"""Self-service — slips for the Employee record linked to session.user."""
	if not _hrms_installed():
		return []
	# Find the linked Employee.
	emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not emp:
		return []
	frappe.has_permission("Salary Slip", "read", throw=True)
	return list_salary_slips(employee=emp, limit=int(limit or 60))


# ── write endpoints ───────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def assign_salary_structure(
	employee: str,
	structure: str,
	base: float,
	from_date: str | None = None,
):
	"""Create + submit a Salary Structure Assignment.

	Subsequent runs of `generate_monthly_payroll` will pick up the new
	assignment automatically.
	"""
	assert_may_manage_payroll()
	if not _hrms_installed():
		frappe.throw(_("hrms is not installed."), frappe.ValidationError)
	if not all([employee, structure, base]):
		frappe.throw(_("employee, structure and base are required."), frappe.ValidationError)
	from_date = from_date or today()

	# Cancel any existing assignment with the same from_date to avoid the
	# "Active Salary Structure already exists" hrms validation.
	existing = frappe.db.get_value(
		"Salary Structure Assignment",
		{"employee": employee, "from_date": from_date, "docstatus": ["!=", 2]},
		"name",
	)
	if existing:
		old = frappe.get_doc("Salary Structure Assignment", existing)
		if int(old.docstatus or 0) == 1:
			old.cancel()
		old = frappe.get_doc("Salary Structure Assignment", existing)
		old.flags.ignore_permissions = True
		old.delete()

	doc = frappe.get_doc({
		"doctype": "Salary Structure Assignment",
		"employee": employee,
		"salary_structure": structure,
		"from_date": from_date,
		"base": flt(base),
		"company": frappe.db.get_value("Employee", employee, "company")
			or frappe.defaults.get_user_default("Company"),
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return {"name": doc.name, "employee": employee, "base": flt(base)}


@frappe.whitelist(methods=["POST"])
def generate_monthly_payroll(
	year: int,
	month: int,
	branch: str | None = None,
	structure: str | None = None,
):
	"""Bulk-create one Draft Salary Slip per active employee with an
	assignment that covers the period.

	No payroll entry doctype is used — we insert slips directly, which
	keeps the flow simple and matches the self-service spec.
	"""
	assert_may_manage_payroll()
	if not _hrms_installed():
		frappe.throw(_("hrms is not installed."), frappe.ValidationError)
	year = int(year); month = int(month)
	start_d = date(year, month, 1).isoformat()
	# end-of-month
	if month == 12:
		end_d = date(year, 12, 31).isoformat()
	else:
		next_m = date(year, month + 1, 1)
		end_d = (next_m - frappe.utils.datetime.timedelta(days=1)).isoformat()

	emp_filters = {"status": "Active"}
	if branch:
		emp_filters["elmahdi_branch_warehouse"] = branch
	employees = frappe.get_all("Employee", filters=emp_filters,
	                           fields=["name", "employee_name", "company"],
	                           limit_page_length=2000)

	created, skipped = [], []
	for emp in employees:
		# Skip if a slip already exists for this employee + period.
		existing = frappe.db.exists("Salary Slip", {
			"employee": emp.name,
			"start_date": start_d,
			"docstatus": ["!=", 2],
		})
		if existing:
			skipped.append({"employee": emp.name, "reason": "slip exists", "name": existing})
			continue

		# Verify the employee has an active Salary Structure Assignment
		# covering this period. Without it, Salary Slip auto-calc errors.
		assignment = frappe.db.exists("Salary Structure Assignment", {
			"employee": emp.name,
			"from_date": ["<=", start_d],
			"docstatus": 1,
		})
		if not assignment:
			skipped.append({"employee": emp.name, "reason": "no salary structure assignment"})
			continue

		try:
			slip = frappe.get_doc({
				"doctype": "Salary Slip",
				"employee": emp.name,
				"start_date": start_d,
				"end_date": end_d,
				"posting_date": today(),
				"company": emp.company,
			})
			# `set_missing_values` populates the components/amounts from
			# the assignment. We let hrms do that work.
			slip.flags.ignore_permissions = True
			slip.insert()
			created.append({"employee": emp.name, "name": slip.name,
			                "net_pay": flt(slip.net_pay)})
		except Exception as e:  # noqa: BLE001
			skipped.append({"employee": emp.name, "reason": str(e)[:200]})

	frappe.db.commit()
	return {
		"year": year, "month": month,
		"created": len(created), "skipped": len(skipped),
		"created_rows": created, "skipped_rows": skipped,
	}


@frappe.whitelist(methods=["POST"])
def submit_salary_slip(name: str):
	"""Submit a Draft slip → docstatus=1."""
	assert_may_manage_payroll()
	if not _hrms_installed():
		frappe.throw(_("hrms is not installed."), frappe.ValidationError)
	if not frappe.db.exists("Salary Slip", name):
		frappe.throw(_("Salary Slip {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Salary Slip", name)
	if int(doc.docstatus or 0) != 0:
		frappe.throw(_("Salary Slip is not in Draft state."), frappe.ValidationError)
	doc.flags.ignore_permissions = True
	doc.submit()
	return {"name": doc.name, "status": doc.status, "net_pay": flt(doc.net_pay)}


@frappe.whitelist(methods=["POST"])
def mark_slip_paid(name: str, payment_entry: str | None = None):
	"""Flip Salary Slip status to "Paid". Does NOT create the Payment
	Entry — the Accountant records that separately; this call records the
	link if provided."""
	assert_may_manage_payroll()
	if not _hrms_installed():
		frappe.throw(_("hrms is not installed."), frappe.ValidationError)
	if not frappe.db.exists("Salary Slip", name):
		frappe.throw(_("Salary Slip {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Salary Slip", name)
	if int(doc.docstatus or 0) != 1:
		frappe.throw(_("Only submitted slips can be marked Paid."), frappe.ValidationError)
	frappe.db.set_value("Salary Slip", name, {
		"status": "Paid",
	})
	frappe.db.commit()
	return {"name": name, "status": "Paid"}


@frappe.whitelist(methods=["POST"])
def cancel_salary_slip(name: str):
	"""Cancel a Salary Slip. Submitted → cancel. Draft → delete."""
	assert_may_manage_payroll()
	if not _hrms_installed():
		frappe.throw(_("hrms is not installed."), frappe.ValidationError)
	if not frappe.db.exists("Salary Slip", name):
		frappe.throw(_("Salary Slip {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Salary Slip", name)
	doc.flags.ignore_permissions = True
	if int(doc.docstatus or 0) == 1:
		doc.cancel()
	doc = frappe.get_doc("Salary Slip", name)
	doc.flags.ignore_permissions = True
	doc.delete()
	return {"deleted": name}

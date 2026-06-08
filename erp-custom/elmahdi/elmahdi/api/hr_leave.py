"""
HR Leave Management — whitelisted endpoints.

Workflow (ERPNext-native):
    Draft (docstatus=0)  →  Submitted/Open (docstatus=1, status="Open")
        └─ Approver decision: status="Approved" or "Rejected"

Approver = HR Officer (any branch) OR Store Manager (own branch only).
Row-level visibility is governed by `row_scoping.leave_application_pqc`
from Batch A.

Notifications fire on:
    • application submit  → Store Manager + HR (notify_leave_pending)
    • decision            → requester                (notify_leave_decision)

The four default Leave Types (Annual / Sick / Emergency / Unpaid) are
seeded by `seed_leave_types()` — wired into hooks.after_migrate.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, getdate, today

from elmahdi.api.spa_authorization import (
	assert_may_approve_leave,
	assert_may_request_leave_for,
	has_cap,
	is_break_glass_user,
)


# ── HRMS install guard ───────────────────────────────────────────────────


def _hrms_installed() -> bool:
	try:
		return frappe.db.table_exists("Leave Application")
	except Exception:
		return False


_NOT_INSTALLED = {
	"hrms_not_installed": True,
	"hint": "Install the `hrms` app to enable Leave Management.",
}


# ── default Leave Types seed (idempotent) ────────────────────────────────


_DEFAULT_LEAVE_TYPES = (
	# (name, is_lwp, max_continuous_days, max_leaves_allowed)
	("Annual Leave",    0, 30, 21),
	("Sick Leave",      0, 14, 14),
	("Emergency Leave", 0, 7,  5),
	("Unpaid Leave",    1, 60, 60),
)


def seed_leave_types():
	"""Create the four default Leave Types + a stub Holiday List + attach
	the list to every Company (so Leave Applications can be submitted out
	of the box). Everything is idempotent."""
	if not _hrms_installed():
		return {"skipped": "hrms not installed"}

	# 1. Leave types
	created_types = []
	for name, is_lwp, max_cont, max_leaves in _DEFAULT_LEAVE_TYPES:
		if frappe.db.exists("Leave Type", name):
			continue
		frappe.get_doc({
			"doctype": "Leave Type",
			"leave_type_name": name,
			"is_lwp": is_lwp,
			"max_continuous_days_allowed": max_cont,
			"max_leaves_allowed": max_leaves,
			"include_holiday": 0,
		}).insert(ignore_permissions=True)
		created_types.append(name)

	# 2. Stub Holiday List — just covers the current year with no actual
	#    holidays. HR Officer can edit it later via ERPNext Desk.
	year = frappe.utils.now_datetime().year
	hl_name = f"Elmahdi {year}"
	if not frappe.db.exists("Holiday List", hl_name):
		hl = frappe.get_doc({
			"doctype": "Holiday List",
			"holiday_list_name": hl_name,
			"from_date": f"{year}-01-01",
			"to_date": f"{year}-12-31",
			"weekly_off": "Friday",
		})
		hl.flags.ignore_permissions = True
		hl.insert()
		# Frappe Desk usually auto-adds weekly offs via `get_weekly_off_date_list`.
		try:
			hl.get_weekly_off_dates()
			hl.save()
		except Exception:
			pass

	# 3. Attach to every Company that doesn't already have one.
	attached = []
	for company in frappe.get_all("Company", fields=["name", "default_holiday_list"]):
		if not company.default_holiday_list:
			frappe.db.set_value("Company", company.name, "default_holiday_list", hl_name)
			attached.append(company.name)

	frappe.db.commit()
	return {
		"types_created": created_types,
		"holiday_list": hl_name,
		"companies_attached": attached,
	}


# ── read endpoints ────────────────────────────────────────────────────────


_LIST_FIELDS = [
	"name",
	"employee",
	"employee_name",
	"leave_type",
	"from_date",
	"to_date",
	"total_leave_days",
	"status",
	"docstatus",
	"description",
	"company",
	"leave_approver",
	"posting_date",
	"creation",
	"owner",
	"modified",
]


def _assert_may_read_leave() -> None:
	"""Accept HR officers, Store Managers, Admin, or anyone with a linked
	Employee record (self-service). Row scoping further restricts."""
	if is_break_glass_user():
		return
	if has_cap("can_access_hr_workspace") or has_cap("can_approve_leave"):
		return
	if frappe.db.exists("Employee", {"user_id": frappe.session.user}):
		return
	frappe.throw(
		_("You do not have permission to view leave applications."),
		frappe.PermissionError,
	)


@frappe.whitelist()
def list_leave_applications(
	status: str | None = None,
	employee: str | None = None,
	leave_type: str | None = None,
	date_from: str | None = None,
	date_to: str | None = None,
	branch: str | None = None,
	limit: int = 200,
):
	"""Leave applications with filters. Defaults to last 90 days by
	`from_date`. Cancelled records are hidden."""
	_assert_may_read_leave()
	if not _hrms_installed():
		return []
	frappe.has_permission("Leave Application", "read", throw=True)

	to_d = date_to or today()
	from_d = date_from or add_days(to_d, -89)

	filters: list = [
		["from_date", ">=", str(from_d)],
		["from_date", "<=", str(to_d)],
		["docstatus", "!=", 2],
	]
	if status:
		filters.append(["status", "=", status])
	if employee:
		filters.append(["employee", "=", employee])
	if leave_type:
		filters.append(["leave_type", "=", leave_type])
	if branch:
		emp_names = frappe.db.sql_list(
			"SELECT name FROM `tabEmployee` WHERE elmahdi_branch_warehouse = %s",
			(branch,),
		)
		if not emp_names:
			return []
		filters.append(["employee", "in", emp_names])

	rows = frappe.get_list(
		"Leave Application",
		filters=filters,
		fields=_LIST_FIELDS,
		order_by="modified desc",
		limit_page_length=int(limit or 200),
	)
	# Add branch lookup for the table column.
	emp_branch_cache: dict[str, str] = {}
	for r in rows:
		emp = r.get("employee")
		if emp and emp not in emp_branch_cache:
			emp_branch_cache[emp] = (
				frappe.db.get_value("Employee", emp, "elmahdi_branch_warehouse") or ""
			)
		r["branch"] = emp_branch_cache.get(emp, "")
		r["from_date"] = str(r.from_date) if r.from_date else ""
		r["to_date"] = str(r.to_date) if r.to_date else ""
		r["posting_date"] = str(r.posting_date) if r.posting_date else ""
		r["creation"] = str(r.creation) if r.creation else ""
		r["modified"] = str(r.modified) if r.modified else ""
	return rows


@frappe.whitelist()
def get_leave_kpis():
	"""KPIs for the dashboard and the page header.

	    pending    — Open applications waiting on a decision (any date)
	    approved_month — Approved that overlap the current month
	    rejected_month — Rejected that overlap the current month
	    on_leave_today — Approved + covers today
	"""
	_assert_may_read_leave()
	if not _hrms_installed():
		return {**_NOT_INSTALLED, "pending": 0, "approved_month": 0,
		        "rejected_month": 0, "on_leave_today": 0}
	frappe.has_permission("Leave Application", "read", throw=True)

	d = getdate(today())
	month_start = d.replace(day=1)
	# end-of-month: add 31 days then snap back to the 1st - 1 day.
	next_month = (d.replace(day=28) + frappe.utils.datetime.timedelta(days=4))
	month_end = next_month.replace(day=1) - frappe.utils.datetime.timedelta(days=1)

	def _count(filters):
		return int(frappe.db.count("Leave Application", filters=filters) or 0)

	return {
		"pending": _count({
			"status": "Open",
			"docstatus": ["!=", 2],
		}),
		"approved_month": _count({
			"status": "Approved",
			"docstatus": 1,
			"from_date": ["<=", str(month_end)],
			"to_date": [">=", str(month_start)],
		}),
		"rejected_month": _count({
			"status": "Rejected",
			"from_date": ["<=", str(month_end)],
			"to_date": [">=", str(month_start)],
		}),
		"on_leave_today": _count({
			"status": "Approved",
			"docstatus": 1,
			"from_date": ["<=", str(d)],
			"to_date": [">=", str(d)],
		}),
	}


@frappe.whitelist()
def list_leave_types():
	"""Picklist of enabled Leave Types."""
	_assert_may_read_leave()
	if not _hrms_installed():
		return []
	return frappe.get_list(
		"Leave Type",
		fields=["name", "leave_type_name", "is_lwp", "max_continuous_days_allowed", "max_leaves_allowed"],
		order_by="name asc",
		limit_page_length=100,
	)


@frappe.whitelist()
def get_leave_balance(employee: str, leave_type: str | None = None):
	"""Remaining allocation for an employee (current fiscal period).

	Reads via ERPNext's leave-balance helper. If the helper is not
	available (older hrms versions), returns 0 silently so the SPA still
	renders.
	"""
	_assert_may_read_leave()
	if not _hrms_installed():
		return {"hrms_not_installed": True}
	if not employee:
		frappe.throw(_("employee is required"), frappe.ValidationError)

	try:
		from hrms.hr.doctype.leave_application.leave_application import (
			get_leave_balance_on,
		)
	except Exception:
		return {"balance": 0, "note": "helper unavailable"}

	d = today()
	if leave_type:
		try:
			bal = get_leave_balance_on(employee, leave_type, d)
		except Exception:
			bal = 0
		return {"employee": employee, "leave_type": leave_type, "balance": float(bal or 0)}

	# All types
	types = frappe.get_list("Leave Type", fields=["name"], limit_page_length=100)
	out = []
	for t in types:
		try:
			bal = get_leave_balance_on(employee, t.name, d)
		except Exception:
			bal = 0
		out.append({"leave_type": t.name, "balance": float(bal or 0)})
	return {"employee": employee, "balances": out}


# ── write endpoints ───────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def submit_leave_application(
	employee: str,
	leave_type: str,
	from_date: str,
	to_date: str,
	description: str | None = None,
):
	"""Create + submit a Leave Application.

	The asserter enforces self-only unless the user holds
	`can_manage_employees` (HR/Admin). Notification fires to HR + the
	employee's branch's Store Managers.
	"""
	assert_may_request_leave_for(employee)
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed."),
			frappe.ValidationError,
		)
	if not all([employee, leave_type, from_date, to_date]):
		frappe.throw(
			_("employee, leave_type, from_date and to_date are required."),
			frappe.ValidationError,
		)
	# ERPNext's Leave Application doctype only allows submit (docstatus=1)
	# once the status is Approved or Rejected. The "Open" state lives at
	# docstatus=0 (draft). We insert as draft and let the approver flip +
	# submit via decide_leave_application().
	doc = frappe.get_doc({
		"doctype": "Leave Application",
		"employee": employee,
		"leave_type": leave_type,
		"from_date": str(from_date),
		"to_date": str(to_date),
		"description": description or "",
		"status": "Open",
		"company": frappe.db.get_value("Employee", employee, "company")
			or frappe.defaults.get_user_default("Company"),
	})
	doc.flags.ignore_permissions = True
	doc.insert()

	# Notify HR + Store Manager — best-effort, doesn't block on failure.
	try:
		from elmahdi.api.hr_notifications import notify_leave_pending
		notify_leave_pending(doc.name, employee, leave_type, from_date, to_date)
	except Exception:
		pass

	return {
		"name": doc.name,
		"status": doc.status,
		"total_leave_days": float(doc.total_leave_days or 0),
	}


@frappe.whitelist(methods=["POST"])
def decide_leave_application(
	name: str,
	decision: str,
	notes: str | None = None,
):
	"""Approve or reject a Leave Application.

	`decision` must be "Approved" or "Rejected". Notifies the requester.
	"""
	assert_may_approve_leave()
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed."),
			frappe.ValidationError,
		)
	if decision not in ("Approved", "Rejected"):
		frappe.throw(_("decision must be Approved or Rejected"), frappe.ValidationError)

	if not frappe.db.exists("Leave Application", name):
		frappe.throw(_("Leave Application {0} not found.").format(name), frappe.DoesNotExistError)

	doc = frappe.get_doc("Leave Application", name)
	if doc.status not in ("Open", "Approved", "Rejected"):
		frappe.throw(
			_("Cannot decide a leave application in state {0}").format(doc.status),
			frappe.ValidationError,
		)

	# Approver = current user. ERPNext requires the leave_approver to be
	# set on the doc before status flips.
	doc.leave_approver = frappe.session.user
	doc.status = decision
	if notes:
		doc.description = (doc.description or "") + "\n[Decision] " + notes
	doc.flags.ignore_permissions = True
	# Draft → submit. Already-submitted records just save the status change
	# (ERPNext allows it because `status` is a permitted-after-submit field).
	if int(doc.docstatus or 0) == 0:
		doc.save()
		doc.submit()
	else:
		doc.save()

	try:
		from elmahdi.api.hr_notifications import notify_leave_decision
		notify_leave_decision(doc.name, doc.owner, decision, notes)
	except Exception:
		pass

	return {"name": doc.name, "status": doc.status}


# ─── Phase 4.b · Domain 2 — Batch leave decisions ──────────────────────────
#
# `batch_decide_leave_applications` drives the existing single-doc
# `decide_leave_application` logic for every item. Inheriting that path
# means HRMS install gate, state guard, notifier, and approver-binding
# all stay in one place.
#
# Branch + employee scoping: row_scoping.leave_application_pqc already
# limits which Leave Applications a Store Manager / Self user can read.
# We re-enforce that on the WRITE path with a per-row
# `has_permission("Leave Application", "write", doc=name)` check so a
# motivated caller cannot decide a record outside their scope by
# guessing the name. The check also stops a Store Manager from
# approving leave for employees outside their branch (their write perm
# returns False for those rows via the same pqc).


def _batch_leave_decision_row(item, _index, *, default_decision: str, default_notes: str = ""):
	"""Per-row callback used by `batch_decide_leave_applications`.

	`item` may be a bare leave-application name string OR a dict
	``{name, decision?, notes?}`` so a caller can mix approve/reject in
	one batch (rare today, but the shape is cheap and forward-compatible).
	"""
	if isinstance(item, str):
		name = item
		decision = default_decision
		notes = default_notes
	elif isinstance(item, dict):
		name = item.get("name") or item.get("docname")
		decision = item.get("decision") or default_decision
		notes = item.get("notes") or default_notes
	else:
		frappe.throw(_("Invalid batch item shape."), frappe.ValidationError)

	if not name:
		frappe.throw(_("Missing leave application name."), frappe.ValidationError)
	if decision not in ("Approved", "Rejected"):
		frappe.throw(_("decision must be Approved or Rejected"), frappe.ValidationError)

	# Branch + employee scope guard. write perm goes through the same
	# permission_query_conditions as the queue listing.
	if not frappe.has_permission("Leave Application", "write", doc=name):
		frappe.throw(
			_("Leave application {0} is not in your branch scope.").format(name),
			frappe.PermissionError,
		)

	result = decide_leave_application(name, decision, notes)
	# Tighten the row payload for the SPA; keep the same shape that the
	# single-doc path returns plus the decision so BatchResultToast can
	# differentiate approved vs. rejected if needed.
	return {
		"name": result.get("name") or name,
		"status": result.get("status") or decision,
		"decision": decision,
	}


@frappe.whitelist(methods=["POST"])
def batch_decide_leave_applications(items=None, decision: str = "", notes: str = ""):
	"""Approve OR reject N Leave Applications in one call.

	Parameters
	----------
	items : list
	    A list of leave-application names OR a list of
	    ``{name, decision?, notes?}`` dicts. JSON-deserialized by Frappe
	    if posted as the request body.
	decision : str
	    "Approved" or "Rejected". Required when `items` is a list of
	    bare names; ignored when each item carries its own decision.
	notes : str, optional
	    Default decision notes applied to every row that doesn't carry
	    its own ``notes``. Stored in the Leave Application's
	    ``description`` as a "[Decision]" footer (existing single-doc
	    behavior).

	Returns the standard run_row_batch envelope.

	Caller must hold `can_approve_leave` (HR Officer + Store Manager +
	Admin). Per-row branch scope is enforced by `has_permission("write")`
	which composes with the existing permission_query_conditions.
	"""
	assert_may_approve_leave()
	from elmahdi.api._batch import run_row_batch

	if isinstance(items, str):
		import json as _json
		try:
			items = _json.loads(items)
		except ValueError:
			items = []

	# Default-decision validation only applies to plain-name items.
	# Mixed batches can carry per-row decisions; the row callback
	# validates each one.
	is_mixed = any(isinstance(i, dict) and i.get("decision") for i in (items or []))
	if not is_mixed and decision not in ("Approved", "Rejected"):
		frappe.throw(_("decision must be Approved or Rejected"), frappe.ValidationError)

	return run_row_batch(
		items or [],
		lambda item, idx: _batch_leave_decision_row(
			item, idx,
			default_decision=decision or "Approved",
			default_notes=notes or "",
		),
		action=(
			"leave.batch_approve_leave_applications"
			if (decision == "Approved" and not is_mixed)
			else "leave.batch_reject_leave_applications"
			if (decision == "Rejected" and not is_mixed)
			else "leave.batch_decide_leave_applications"
		),
		doctype="Leave Application",
		summary_extra={"decision": decision, "notes": notes or "", "mixed": is_mixed},
	)


@frappe.whitelist(methods=["POST"])
def cancel_leave_application(name: str):
	"""Cancel an Open leave application. Owner or HR/Admin only."""
	if not _hrms_installed():
		frappe.throw(
			_("The HR Management (hrms) app is not installed."),
			frappe.ValidationError,
		)
	if not frappe.db.exists("Leave Application", name):
		frappe.throw(_("Leave Application {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc("Leave Application", name)
	# Owner or HR/Admin
	if (
		not is_break_glass_user()
		and not has_cap("can_manage_employees")
		and doc.owner != frappe.session.user
	):
		frappe.throw(
			_("You may only cancel your own leave applications."),
			frappe.PermissionError,
		)
	# ERPNext auto-creates an `Attendance` record (status="On Leave") for
	# every day of an approved Leave Application. We have to cancel those
	# linked records first or the cancel/delete fails with a link-exists
	# error.
	linked_att = frappe.get_all(
		"Attendance",
		filters={"leave_application": name, "docstatus": ["!=", 2]},
		fields=["name", "docstatus"],
	)
	for att in linked_att:
		try:
			att_doc = frappe.get_doc("Attendance", att.name)
			att_doc.flags.ignore_permissions = True
			if int(att_doc.docstatus or 0) == 1:
				att_doc.cancel()
			att_doc = frappe.get_doc("Attendance", att.name)
			att_doc.flags.ignore_permissions = True
			att_doc.delete()
		except Exception:
			# Best-effort — if a single linked attendance can't be removed
			# the leave delete will surface the error anyway.
			pass

	doc.flags.ignore_permissions = True
	if doc.docstatus == 1:
		doc.cancel()
	doc = frappe.get_doc("Leave Application", name)
	doc.flags.ignore_permissions = True
	doc.delete()
	return {"deleted": name, "cancelled_attendances": len(linked_att)}

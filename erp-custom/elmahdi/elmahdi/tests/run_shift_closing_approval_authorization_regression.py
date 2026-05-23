"""
Regression: POS shift closing approve/reject — accountant (+ break-glass) only.

Run:
  bench --site <site> execute elmahdi.tests.run_shift_closing_approval_authorization_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _

from elmahdi.api.shift_authorization import (
	may_act_as_pos_closing_approver,
	may_view_shift_reports,
)
from elmahdi.api.spa_authorization import has_cap
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

MANAGER = "manager@elmahdi.com"
ACCOUNTANT = "accountant@elmahdi.com"
PURCHASING = "purchasing@elmahdi.com"
CASHIER = "cashier@elmahdi.com"
INVENTORY = "inventory@elmahdi.com"
HR = "hr@elmahdi.com"


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
		return "Permission" in type(exc).__name__ or "permission" in str(exc).lower()
	return False


def _probe_approve_api(user: str) -> bool:
	"""Returns True if PermissionError (denied as expected)."""
	frappe.set_user(user)
	return _expect_permission_error(
		lambda: frappe.call(
			"elmahdi.api.pos_closing_approval.approve_pos_closing_entry",
			name="__regression_nonexistent__",
			notes="regression",
		)
	)


def _probe_reject_api(user: str) -> bool:
	frappe.set_user(user)
	return _expect_permission_error(
		lambda: frappe.call(
			"elmahdi.api.pos_closing_approval.reject_pos_closing_entry",
			name="__regression_nonexistent__",
			notes="regression",
		)
	)


def _probe_list_pending_api(user: str) -> bool:
	frappe.set_user(user)
	return _expect_permission_error(
		lambda: frappe.call("elmahdi.api.pos_closing_approval.list_pending_shift_closings", limit=1)
	)


def probe_live_approve(name: str, user: str = ACCOUNTANT) -> dict:
	"""One-off: full approve path for a real draft closing (bench execute)."""
	frappe.set_user(user)
	from elmahdi.api.pos_closing_approval import approve_pos_closing_entry

	try:
		result = approve_pos_closing_entry(name, notes="live-probe")
		frappe.db.commit()
		return {"ok": True, "user": user, "result": result}
	except Exception as exc:
		frappe.db.rollback()
		import traceback

		return {
			"ok": False,
			"user": user,
			"error": type(exc).__name__,
			"message": str(exc) or frappe.get_traceback(),
			"traceback": traceback.format_exc(),
		}


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		# --- Policy matrix (may_act_as_pos_closing_approver) -----------------
		_step(
			steps,
			step="accountant_may_approve",
			ok=may_act_as_pos_closing_approver(ACCOUNTANT) if frappe.db.exists("User", ACCOUNTANT) else True,
			message=f"may_approve={may_act_as_pos_closing_approver(ACCOUNTANT) if frappe.db.exists('User', ACCOUNTANT) else 'skip'}",
		)
		_step(
			steps,
			step="manager_may_not_approve",
			ok=not may_act_as_pos_closing_approver(MANAGER) if frappe.db.exists("User", MANAGER) else True,
			message=f"may_approve={may_act_as_pos_closing_approver(MANAGER) if frappe.db.exists('User', MANAGER) else 'skip'}",
		)
		_step(
			steps,
			step="purchasing_may_not_approve",
			ok=not may_act_as_pos_closing_approver(PURCHASING) if frappe.db.exists("User", PURCHASING) else True,
			message="",
		)
		_step(
			steps,
			step="cashier_may_not_approve",
			ok=not may_act_as_pos_closing_approver(CASHIER) if frappe.db.exists("User", CASHIER) else True,
			message="",
		)
		_step(
			steps,
			step="inventory_may_not_approve",
			ok=not may_act_as_pos_closing_approver(INVENTORY) if frappe.db.exists("User", INVENTORY) else True,
			message="",
		)
		if frappe.db.exists("User", HR):
			_step(
				steps,
				step="hr_may_not_approve",
				ok=not may_act_as_pos_closing_approver(HR),
				message="",
			)

		# --- SPA caps -------------------------------------------------------
		if frappe.db.exists("User", MANAGER):
			_step(
				steps,
				step="manager_no_can_approve_shift_cap",
				ok=not has_cap("can_approve_shift", MANAGER),
				message=f"can_approve_shift={has_cap('can_approve_shift', MANAGER)}",
			)
			_step(
				steps,
				step="manager_can_view_shift_reports",
				ok=has_cap("can_view_shift_reports", MANAGER) or may_view_shift_reports(MANAGER),
				message=f"monitor read ok",
			)
		if frappe.db.exists("User", ACCOUNTANT):
			_step(
				steps,
				step="accountant_can_approve_shift_cap",
				ok=has_cap("can_approve_shift", ACCOUNTANT),
				message="",
			)

		# --- Whitelisted APIs (403 before get_doc) ----------------------------
		if frappe.db.exists("User", MANAGER):
			_step(
				steps,
				step="manager_approve_api_403",
				ok=_probe_approve_api(MANAGER),
				message="approve_pos_closing_entry must deny store manager",
			)
			_step(
				steps,
				step="manager_reject_api_403",
				ok=_probe_reject_api(MANAGER),
				message="reject_pos_closing_entry must deny store manager",
			)
			_step(
				steps,
				step="manager_list_pending_api_403",
				ok=_probe_list_pending_api(MANAGER),
				message="list_pending_shift_closings must deny store manager",
			)

		if frappe.db.exists("User", PURCHASING):
			_step(
				steps,
				step="purchasing_approve_api_403",
				ok=_probe_approve_api(PURCHASING),
				message="",
			)

		if frappe.db.exists("User", ACCOUNTANT):
			frappe.set_user(ACCOUNTANT)
			denied = _probe_approve_api(ACCOUNTANT)
			# Permission passes; expect DoesNotExist or ValidationError for fake name
			_step(
				steps,
				step="accountant_approve_api_not_permission_denied",
				ok=not denied,
				message="accountant passes auth gate (doc may not exist)",
			)
			draft = frappe.get_all(
				"POS Closing Entry",
				filters={"docstatus": 0},
				pluck="name",
				limit=1,
			)
			if draft:
				live = probe_live_approve(draft[0], ACCOUNTANT)
				_step(
					steps,
					step="accountant_live_approve_draft_closing",
					ok=bool(live.get("ok")),
					message=live.get("error") or live.get("result", ""),
				)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Shift closing approval authorization regression failed"), frappe.ValidationError)
	return summary

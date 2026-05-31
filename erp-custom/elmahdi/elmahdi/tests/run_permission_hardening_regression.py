"""
Regression: backend permission hardening (audit-driven).

Run:
  bench --site <site> execute elmahdi.tests.run_permission_hardening_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.permissions import has_permission

from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

MANAGER = "manager@elmahdi.com"
CASHIER = "cashier@elmahdi.com"
PURCHASING = "purchasing@elmahdi.com"
ACCOUNTANT = "accountant@elmahdi.com"


def _step(steps, *, step, ok, message=""):
	steps.append(audit_record(step=step, passed=ok, message=message))
	return ok


def _expect_permission_error(fn) -> bool:
	try:
		fn()
	except frappe.PermissionError:
		return True
	except Exception as exc:
		return "Permission" in type(exc).__name__ or "not permitted" in str(exc).lower()
	return False


def execute():
	steps: list[dict] = []
	orig = frappe.session.user

	try:
		if frappe.db.exists("User", MANAGER):
			frappe.set_user(MANAGER)
			_step(
				steps,
				step="manager_pos_closing_no_submit",
				ok=not has_permission("POS Closing Entry", "submit"),
				message=f"submit={has_permission('POS Closing Entry', 'submit')}",
			)
			_step(
				steps,
				step="manager_pos_closing_read",
				ok=has_permission("POS Closing Entry", "read"),
				message="",
			)
			_step(
				steps,
				step="manager_journal_entry_denied",
				ok=not has_permission("Journal Entry", "read"),
				message="",
			)

		if frappe.db.exists("User", CASHIER):
			frappe.set_user(CASHIER)
			_step(
				steps,
				step="cashier_pos_closing_no_submit",
				ok=not has_permission("POS Closing Entry", "submit"),
				message="",
			)

		if frappe.db.exists("User", PURCHASING):
			frappe.set_user(PURCHASING)
			_step(
				steps,
				step="purchasing_pr_no_submit",
				ok=not has_permission("Purchase Receipt", "submit"),
				message="",
			)
			_step(
				steps,
				step="purchasing_direct_submit_blocked",
				ok=_expect_permission_error(
					lambda: frappe.call(
						"elmahdi.api.erp_submit.submit_document",
						name="__regression__",
						doctype="Purchase Receipt",
					)
				),
				message="generic submit must deny purchasing",
			)

		if frappe.db.exists("User", ACCOUNTANT):
			frappe.set_user(ACCOUNTANT)
			_step(
				steps,
				step="accountant_pos_closing_submit",
				ok=has_permission("POS Closing Entry", "submit"),
				message="accountant may finalize closings",
			)
			_step(
				steps,
				step="accountant_journal_entry_denied",
				ok=not has_permission("Journal Entry", "create"),
				message="",
			)

		if frappe.db.exists("User", MANAGER):
			frappe.set_user(MANAGER)
			if frappe.get_meta("User").has_field("desk_access"):
				desk = frappe.db.get_value("User", MANAGER, "desk_access")
				_step(
					steps,
					step="manager_desk_access_off",
					ok=desk == 0,
					message=f"desk_access={desk}",
				)

	finally:
		frappe.set_user(orig)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Permission hardening regression failed"), frappe.ValidationError)
	return summary

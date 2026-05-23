"""
Regression: Purchase Receipt approve/reject — store manager (+ break-glass) only.

Run:
  bench --site <site> execute elmahdi.tests.run_purchase_approval_authorization_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from elmahdi.api.purchase_authorization import may_act_as_purchase_approver
from elmahdi.api.spa_authorization import (
	assert_may_access_finance,
	assert_may_record_supplier_payment,
	has_cap,
)
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

MANAGER = "manager@elmahdi.com"
ACCOUNTANT = "accountant@elmahdi.com"
PURCHASING = "purchasing@elmahdi.com"
COMPANY = "Elmahdi Supermarket"


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


def _probe_approve(user: str) -> bool:
	frappe.set_user(user)
	return _expect_permission_error(
		lambda: frappe.call(
			"elmahdi.api.purchasing.approve_purchase_receipt",
			name="__regression_missing_pr__",
			action="approve",
		)
	)


def _probe_reject(user: str) -> bool:
	frappe.set_user(user)
	return _expect_permission_error(
		lambda: frappe.call(
			"elmahdi.api.purchasing.approve_purchase_receipt",
			name="__regression_missing_pr__",
			action="reject",
		)
	)


def _create_draft_pr_as_purchasing():
	frappe.set_user(PURCHASING)
	from elmahdi.api.purchasing import create_purchase_receipt_workflow, get_expected_buying_rate

	wh = frappe.db.get_value("Warehouse", {"company": COMPANY, "is_group": 0}, "name")
	supplier = frappe.db.get_value("Supplier", {}, "name")
	item = frappe.db.get_value("Item", {"disabled": 0, "is_stock_item": 1}, "name")
	rate = flt(get_expected_buying_rate(item)) or flt(frappe.db.get_value("Item", item, "standard_rate")) or 10.0
	result = create_purchase_receipt_workflow(
		supplier=supplier,
		company=COMPANY,
		warehouse=wh,
		lines=[{"item_code": item, "qty": 1, "rate": rate, "expected_rate": rate}],
	)
	return result.get("name")


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user
	pr_name = None

	try:
		if frappe.db.exists("User", ACCOUNTANT):
			_step(
				steps,
				step="accountant_may_not_approve_policy",
				ok=not may_act_as_purchase_approver(ACCOUNTANT),
				message=f"may_approve={may_act_as_purchase_approver(ACCOUNTANT)}",
			)
			_step(
				steps,
				step="accountant_no_approve_cap",
				ok=not has_cap("can_approve_purchasing", ACCOUNTANT)
				and not has_cap("can_approve_purchasing_accountant", ACCOUNTANT),
				message="",
			)
			_step(
				steps,
				step="accountant_approve_api_403",
				ok=_probe_approve(ACCOUNTANT),
				message="approve_purchase_receipt denied for accountant",
			)
			_step(
				steps,
				step="accountant_reject_api_403",
				ok=_probe_reject(ACCOUNTANT),
				message="",
			)

		if frappe.db.exists("User", MANAGER):
			_step(
				steps,
				step="manager_may_approve_policy",
				ok=may_act_as_purchase_approver(MANAGER),
				message="",
			)
			_step(
				steps,
				step="manager_has_approve_cap",
				ok=has_cap("can_approve_purchasing", MANAGER),
				message="",
			)

		if frappe.db.exists("User", PURCHASING):
			_step(
				steps,
				step="purchasing_may_not_approve",
				ok=not may_act_as_purchase_approver(PURCHASING),
				message="",
			)

		# Accountant retains finance authority (unchanged)
		if frappe.db.exists("User", ACCOUNTANT):
			frappe.set_user(ACCOUNTANT)
			finance_ok = False
			try:
				assert_may_access_finance()
				assert_may_record_supplier_payment()
				finance_ok = True
			except frappe.PermissionError:
				pass
			_step(
				steps,
				step="accountant_finance_authority_preserved",
				ok=finance_ok,
				message="AP / payment gates still pass for accountant",
			)

		# End-to-end manager approve on draft PR
		if frappe.db.exists("User", PURCHASING) and frappe.db.exists("User", MANAGER):
			pr_name = _create_draft_pr_as_purchasing()
			_step(steps, step="draft_pr_created", ok=bool(pr_name), message=pr_name or "")
			if pr_name:
				frappe.set_user(MANAGER)
				denied = _probe_approve(MANAGER)
				_step(
					steps,
					step="manager_approve_api_not_permission_denied",
					ok=not denied,
					message="auth gate passes for manager",
				)
				try:
					result = frappe.call(
						"elmahdi.api.purchasing.approve_purchase_receipt",
						name=pr_name,
						action="approve",
						notes="regression",
					)
					submitted = cint(result.get("docstatus")) == 1 if result else False
					if not submitted:
						submitted = cint(frappe.db.get_value("Purchase Receipt", pr_name, "docstatus")) == 1
					_step(
						steps,
						step="manager_approve_submits_pr",
						ok=submitted,
						message=json.dumps(result or {}, default=str)[:180],
					)
				except Exception as exc:
					_step(
						steps,
						step="manager_approve_submits_pr",
						ok=False,
						message=str(exc)[:200],
					)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Purchase approval authorization regression failed"), frappe.ValidationError)
	return summary

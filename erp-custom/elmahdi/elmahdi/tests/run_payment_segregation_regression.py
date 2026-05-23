"""
Regression: purchasing vs accounts payment segregation.

Run:
  bench --site <site> execute elmahdi.tests.run_payment_segregation_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _

from elmahdi.api.spa_authorization import (
	assert_may_manage_supplier_payable,
	assert_may_record_supplier_payment,
	may_manage_supplier_payable,
	may_record_supplier_payment,
)
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

PURCHASING_USER = "purchasing@elmahdi.com"
ACCOUNTANT_USER = "accountant@elmahdi.com"
MANAGER_USER = "manager@elmahdi.com"


def _user_exists(email: str) -> bool:
	return bool(email and frappe.db.exists("User", email))


def _step(steps, *, step, ok, message="", **extra):
	row = audit_record(step=step, passed=ok, message=message, **extra)
	steps.append(row)
	return ok


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		# --- Role matrix (no side effects) ---------------------------------
		_step(
			steps,
			step="01_purchasing_cannot_pay",
			ok=not may_record_supplier_payment(PURCHASING_USER),
			message="Purchase User excluded from supplier payment",
		)
		_step(
			steps,
			step="02_accountant_may_pay",
			ok=may_record_supplier_payment(ACCOUNTANT_USER),
			message="Accounts staff may pay",
		)
		_step(
			steps,
			step="03_purchasing_cannot_retry_payable_api",
			ok=not may_manage_supplier_payable(PURCHASING_USER),
			message="Purchase User excluded from payable retry API",
		)
		_step(
			steps,
			step="04_manager_cannot_retry_payable_api",
			ok=not may_manage_supplier_payable(MANAGER_USER),
			message="Store manager excluded from payable retry API (SPA aligned)",
		)

		# --- API throws for purchasing user ----------------------------------
		if _user_exists(PURCHASING_USER):
			frappe.set_user(PURCHASING_USER)
			pay_blocked = False
			try:
				assert_may_record_supplier_payment()
			except frappe.PermissionError:
				pay_blocked = True
			_step(
				steps,
				step="05_purchasing_create_payment_blocked",
				ok=pay_blocked,
				message="create_supplier_payment policy gate",
			)

			retry_blocked = False
			try:
				assert_may_manage_supplier_payable()
			except frappe.PermissionError:
				retry_blocked = True
			_step(
				steps,
				step="06_purchasing_retry_payable_blocked",
				ok=retry_blocked,
				message="retry_auto_payable policy gate",
			)

			api_blocked = False
			try:
				from elmahdi.api.invoice_matching import retry_auto_payable_for_receipt

				retry_auto_payable_for_receipt("__nonexistent_pr__")
			except frappe.PermissionError:
				api_blocked = True
			except Exception as exc:
				if "Permission" in type(exc).__name__:
					api_blocked = True
			_step(
				steps,
				step="07_purchasing_whitelist_retry_blocked",
				ok=api_blocked,
				message="Whitelisted retry rejects purchasing user before lookup",
			)
		else:
			_step(
				steps,
				step="05_purchasing_user_skipped",
				ok=True,
				message=f"User {PURCHASING_USER} not on site — matrix checks only",
			)

		# --- Accountant may pass payment gate --------------------------------
		if _user_exists(ACCOUNTANT_USER):
			frappe.set_user(ACCOUNTANT_USER)
			allowed = False
			try:
				assert_may_record_supplier_payment()
				allowed = True
			except frappe.PermissionError:
				pass
			_step(
				steps,
				step="08_accountant_payment_gate_pass",
				ok=allowed,
				message="Accountant passes supplier payment policy gate",
			)
		else:
			_step(
				steps,
				step="08_accountant_skipped",
				ok=True,
				message=f"User {ACCOUNTANT_USER} not on site",
			)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Payment segregation regression failed"), frappe.ValidationError)
	return summary

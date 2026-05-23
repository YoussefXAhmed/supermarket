"""
Regression: SPA-aligned backend authorization (Phase 3).

Run:
  bench --site <site> execute elmahdi.tests.run_spa_authorization_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _

from elmahdi.api.spa_authorization import (
	assert_may_access_finance,
	assert_may_access_hr_workspace,
	assert_may_access_invoice_matching,
	assert_may_access_purchasing,
	assert_may_manage_operational_users,
	assert_may_manage_supplier_payable,
	assert_may_operate_inventory,
	assert_may_operate_pos,
	assert_may_record_supplier_payment,
	assert_may_submit_doctype,
	get_capabilities,
	has_cap,
	may_manage_supplier_payable,
	may_record_supplier_payment,
	may_view_financial_kpis,
)
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

PURCHASING_USER = "purchasing@elmahdi.com"
ACCOUNTANT_USER = "accountant@elmahdi.com"
MANAGER_USER = "manager@elmahdi.com"
CASHIER_USER = "cashier@elmahdi.com"
INVENTORY_USER = "inventory@elmahdi.com"
HR_USER = "hr@elmahdi.com"


def _user_exists(email: str) -> bool:
	return bool(email and frappe.db.exists("User", email))


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
		return "Permission" in type(exc).__name__
	return False


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		# --- Capability matrix ------------------------------------------------
		_step(
			steps,
			step="01_purchasing_no_finance_cap",
			ok=not has_cap("can_access_accountant_workspace", PURCHASING_USER),
			message="Purchasing profile lacks finance workspace",
		)
		_step(
			steps,
			step="02_accountant_has_finance_cap",
			ok=has_cap("can_access_accountant_workspace", ACCOUNTANT_USER),
			message="Accountant profile has finance workspace",
		)
		_step(
			steps,
			step="03_manager_no_payable_cap",
			ok=not may_manage_supplier_payable(MANAGER_USER),
			message="Store manager cannot manage payables via API policy",
		)
		_step(
			steps,
			step="04_manager_no_financial_kpis",
			ok=not may_view_financial_kpis(MANAGER_USER),
			message="Store manager cannot view financial KPI fields",
		)
		_step(
			steps,
			step="05_accountant_financial_kpis",
			ok=may_view_financial_kpis(ACCOUNTANT_USER),
			message="Accountant may view financial KPI fields",
		)
		_step(
			steps,
			step="06_cashier_operate_pos",
			ok=has_cap("can_operate_pos", CASHIER_USER),
			message="Cashier may operate POS",
		)
		_step(
			steps,
			step="07_inventory_operate_stock",
			ok=has_cap("can_operate_inventory", INVENTORY_USER),
			message="Inventory clerk may operate stock",
		)

		# --- Generic submit allowlist -----------------------------------------
		if _user_exists(PURCHASING_USER):
			frappe.set_user(PURCHASING_USER)
			_step(
				steps,
				step="08_purchasing_generic_submit_payment_blocked",
				ok=_expect_permission_error(lambda: assert_may_submit_doctype("Payment Entry")),
				message="Generic submit policy blocks Payment Entry for purchasing",
			)
			_step(
				steps,
				step="09_purchasing_generic_submit_stock_blocked",
				ok=_expect_permission_error(lambda: assert_may_submit_doctype("Stock Entry")),
				message="Generic submit policy blocks Stock Entry for purchasing",
			)
			_step(
				steps,
				step="10_purchasing_unknown_doctype_blocked",
				ok=_expect_permission_error(lambda: assert_may_submit_doctype("Journal Entry")),
				message="Unknown doctype blocked on generic submit policy",
			)

		# --- Whitelisted API gates ------------------------------------------
		if _user_exists(PURCHASING_USER):
			frappe.set_user(PURCHASING_USER)
			_step(
				steps,
				step="11_purchasing_ap_read_blocked",
				ok=_expect_permission_error(assert_may_access_finance),
				message="Purchasing blocked from AP reads",
			)
			_step(
				steps,
				step="12_purchasing_matching_blocked",
				ok=_expect_permission_error(assert_may_access_invoice_matching),
				message="Purchasing blocked from invoice matching",
			)
			_step(
				steps,
				step="13_purchasing_payable_api_blocked",
				ok=_expect_permission_error(assert_may_manage_supplier_payable),
				message="Purchasing blocked from payable mutations",
			)

		if _user_exists(MANAGER_USER):
			frappe.set_user(MANAGER_USER)
			_step(
				steps,
				step="14_manager_payable_api_blocked",
				ok=_expect_permission_error(assert_may_manage_supplier_payable),
				message="Store manager blocked from payable mutations (SPA aligned)",
			)
			_step(
				steps,
				step="15_manager_matching_blocked",
				ok=_expect_permission_error(assert_may_access_invoice_matching),
				message="Store manager blocked from invoice matching",
			)
			manager_caps = get_capabilities(MANAGER_USER)
			_step(
				steps,
				step="16_manager_no_execution_caps",
				ok=not manager_caps.get("can_operate_inventory")
				and not manager_caps.get("can_access_purchasing"),
				message="Store manager profile lacks inventory/purchasing execution caps",
			)

		if _user_exists(ACCOUNTANT_USER):
			frappe.set_user(ACCOUNTANT_USER)
			allowed = False
			try:
				assert_may_access_finance()
				assert_may_record_supplier_payment()
				allowed = True
			except frappe.PermissionError:
				pass
			_step(
				steps,
				step="17_accountant_finance_apis_allowed",
				ok=allowed,
				message="Accountant passes finance/payment policy gates",
			)

		if _user_exists(CASHIER_USER):
			frappe.set_user(CASHIER_USER)
			_step(
				steps,
				step="18_cashier_stock_submit_blocked",
				ok=_expect_permission_error(lambda: assert_may_operate_inventory()),
				message="Cashier blocked from stock submit policy",
			)
			_step(
				steps,
				step="19_cashier_operate_pos_allowed",
				ok=not _expect_permission_error(assert_may_operate_pos),
				message="Cashier passes POS operate gate",
			)

		if _user_exists(INVENTORY_USER):
			frappe.set_user(INVENTORY_USER)
			_step(
				steps,
				step="20_inventory_finance_blocked",
				ok=_expect_permission_error(assert_may_access_finance),
				message="Inventory blocked from finance reads",
			)
			_step(
				steps,
				step="21_inventory_purchasing_blocked",
				ok=_expect_permission_error(assert_may_access_purchasing),
				message="Inventory blocked from purchasing workspace",
			)

		if _user_exists(HR_USER):
			frappe.set_user(HR_USER)
			_step(
				steps,
				step="22_hr_workspace_allowed",
				ok=not _expect_permission_error(assert_may_access_hr_workspace),
				message="HR passes HR workspace gate",
			)
			_step(
				steps,
				step="23_hr_manage_operational_users_allowed",
				ok=not _expect_permission_error(assert_may_manage_operational_users),
				message="HR passes operational user management gate",
			)
			_step(
				steps,
				step="24_hr_finance_blocked",
				ok=_expect_permission_error(assert_may_access_finance),
				message="HR blocked from finance",
			)
			_step(
				steps,
				step="25_hr_no_admin_cap",
				ok=not has_cap("can_access_admin_workspace", HR_USER)
				and not has_cap("can_manage_system", HR_USER),
				message="HR profile lacks admin escalation caps",
			)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("SPA authorization regression failed"), frappe.ValidationError)
	return summary

"""
Regression: Purchase Receipt submit only via approve_purchase_receipt workflow.

Run:
  bench --site <site> execute elmahdi.tests.run_purchase_receipt_submit_hardening_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.permissions import has_permission
from frappe.utils import cint, flt

from elmahdi.setup.operational_permissions import apply_permission_matrix
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

PURCHASING = "purchasing@elmahdi.com"
MANAGER = "manager@elmahdi.com"
COMPANY = "Elmahdi Supermarket"


def _step(steps, *, step, ok, message="", **extra):
	row = audit_record(step=step, passed=ok, message=message, **extra)
	steps.append(row)
	return ok


def _company_warehouse_supplier_item():
	company = COMPANY
	wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	supplier = frappe.db.get_value("Supplier", {}, "name")
	item = frappe.db.get_value("Item", {"disabled": 0, "is_stock_item": 1}, "name")
	if not (wh and supplier and item):
		frappe.throw(_("Site missing warehouse, supplier, or stock item for PR regression"))
	return company, wh, supplier, item


def _create_draft_pr_as(user: str):
	frappe.set_user(user)
	company, wh, supplier, item = _company_warehouse_supplier_item()
	from elmahdi.api.purchasing import create_purchase_receipt_workflow, get_expected_buying_rate

	rate = flt(get_expected_buying_rate(item))
	if rate <= 0:
		rate = flt(frappe.db.get_value("Item", item, "standard_rate")) or 10.0

	result = create_purchase_receipt_workflow(
		supplier=supplier,
		company=company,
		warehouse=wh,
		lines=[{"item_code": item, "qty": 1, "rate": rate, "expected_rate": rate}],
	)
	name = result.get("name")
	if not name:
		frappe.throw(_("create_purchase_receipt_workflow did not return a document name"))
	return name


def _try_direct_submit(pr_name: str):
	doc = frappe.get_doc("Purchase Receipt", pr_name)
	doc.submit()


def _audit_buying_submit_leaks(steps):
	"""Purchase User must not submit other buying doctypes via REST."""
	probes = [
		("Purchase Receipt", "submit", True),
		("Purchase Invoice", "submit", True),
		("Purchase Invoice", "create", True),
		("Purchase Order", "submit", True),
		("Purchase Order", "create", True),
		("Payment Entry", "submit", True),
		("Purchase Receipt", "create", False),
	]
	frappe.set_user(PURCHASING)
	for doctype, perm, must_deny in probes:
		if not frappe.db.exists("DocType", doctype):
			continue
		actual = bool(has_permission(doctype, perm, user=PURCHASING))
		ok = (not actual) if must_deny else actual
		_step(
			steps,
			step=f"buying_leak_{doctype.replace(' ', '_')}_{perm}",
			ok=ok,
			message=f"must_deny={must_deny} actual={actual}",
		)


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user
	pr_name = None

	try:
		apply_permission_matrix()
		frappe.db.commit()

		if not frappe.db.exists("User", PURCHASING):
			frappe.throw(_("User {0} missing on site").format(PURCHASING))

		_audit_buying_submit_leaks(steps)

		frappe.set_user(PURCHASING)
		_step(
			steps,
			step="purchasing_pr_submit_docperm",
			ok=not has_permission("Purchase Receipt", "submit", user=PURCHASING),
			message=f"submit={has_permission('Purchase Receipt', 'submit', user=PURCHASING)}",
		)
		_step(
			steps,
			step="purchasing_pr_create_docperm",
			ok=has_permission("Purchase Receipt", "create", user=PURCHASING),
			message=f"create={has_permission('Purchase Receipt', 'create', user=PURCHASING)}",
		)

		pr_name = _create_draft_pr_as(PURCHASING)
		_step(steps, step="purchasing_create_draft", ok=bool(pr_name), message=pr_name or "")

		direct_blocked = False
		try:
			_try_direct_submit(pr_name)
		except (frappe.PermissionError, frappe.ValidationError):
			direct_blocked = True
		except Exception as exc:
			direct_blocked = "approval" in str(exc).lower() or "permission" in str(exc).lower()
		_step(
			steps,
			step="purchasing_direct_submit_blocked",
			ok=direct_blocked,
			message="doc.submit() must fail for purchasing user",
		)

		frappe.set_user(PURCHASING)
		api_blocked = False
		try:
			frappe.call("elmahdi.api.erp_submit.submit_purchase_receipt", name=pr_name)
		except (frappe.PermissionError, frappe.ValidationError):
			api_blocked = True
		_step(
			steps,
			step="purchasing_typed_submit_api_blocked",
			ok=api_blocked,
			message="erp_submit.submit_purchase_receipt must fail",
		)

		frappe.set_user(PURCHASING)
		purchasing_cannot_approve = False
		try:
			frappe.call(
				"elmahdi.api.purchasing.approve_purchase_receipt",
				name=pr_name,
				action="approve",
			)
		except frappe.PermissionError:
			purchasing_cannot_approve = True
		_step(
			steps,
			step="purchasing_cannot_call_approve_api",
			ok=purchasing_cannot_approve,
			message="purchasing must not approve own receipt",
		)

		if frappe.db.exists("User", MANAGER):
			frappe.set_user(MANAGER)
			result = frappe.call(
				"elmahdi.api.purchasing.approve_purchase_receipt",
				name=pr_name,
				action="approve",
				notes="regression approve",
			)
			submitted = cint(result.get("docstatus")) == 1 if result else False
			if not submitted:
				submitted = cint(frappe.db.get_value("Purchase Receipt", pr_name, "docstatus")) == 1
			_step(
				steps,
				step="manager_approve_submits_pr",
				ok=submitted,
				message=json.dumps(result or {}, default=str)[:200],
			)
		else:
			_step(steps, step="manager_approve_submits_pr", ok=False, message="manager user missing")

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Purchase Receipt submit hardening regression failed"), frappe.ValidationError)
	return summary

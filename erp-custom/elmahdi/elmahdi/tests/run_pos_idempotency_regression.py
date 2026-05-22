"""
Regression: POS checkout idempotency — duplicate retry must not create a second invoice.

Run:
  bench --site <site> execute elmahdi.tests.run_pos_idempotency_regression.execute
"""

from __future__ import annotations

import json
import uuid

import frappe
from frappe import _
from frappe.utils import cint, flt, today

from elmahdi.api.pos_checkout import create_and_submit_pos_invoice
from elmahdi.api.shifts import open_pos_shift
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report


def _resolve_company(company=None):
	if company and frappe.db.exists("Company", company):
		return company
	row = frappe.db.get_value("Company", {}, "name")
	if not row:
		frappe.throw(_("No Company configured"), frappe.ValidationError)
	return row


def _resolve_warehouse(warehouse=None, pos_profile=None):
	if warehouse and frappe.db.exists("Warehouse", warehouse):
		return warehouse
	if pos_profile:
		wh = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
		if wh:
			return wh
	wh = frappe.db.get_value("Warehouse", {"is_group": 0}, "name")
	if not wh:
		frappe.throw(_("No Warehouse configured"), frappe.ValidationError)
	return wh


def _resolve_pos_profile(pos_profile=None, warehouse=None):
	if pos_profile and frappe.db.exists("POS Profile", pos_profile):
		return pos_profile
	row = frappe.db.get_value("POS Profile", {"disabled": 0, "warehouse": warehouse}, "name")
	if row:
		return row
	row = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
	if not row:
		frappe.throw(_("No POS Profile configured"), frappe.ValidationError)
	return row


def _resolve_customer(pos_profile):
	cust = frappe.db.get_value("POS Profile", pos_profile, "customer")
	if cust and frappe.db.exists("Customer", cust):
		return cust
	row = frappe.db.get_value("Customer", {}, "name")
	if not row:
		frappe.throw(_("No Customer configured"), frappe.ValidationError)
	return row


def _resolve_item(item_code=None):
	if item_code and frappe.db.exists("Item", item_code):
		return item_code
	for code in ("Pepsi 0001", "0001"):
		if frappe.db.exists("Item", code):
			return code
	frappe.throw(_("No stock item configured for test"), frappe.ValidationError)


def _ensure_stock(item_code, warehouse, qty=10):
	from elmahdi.api.erp_submit import native_submit

	actual = flt(
		frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty")
	)
	if actual >= qty:
		return

	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = "Material Receipt"
	se.company = frappe.db.get_value("Warehouse", warehouse, "company")
	se.set_warehouse = warehouse
	se.append("items", {"item_code": item_code, "qty": qty - actual, "t_warehouse": warehouse})
	se.insert(ignore_permissions=True)
	native_submit(se)
	frappe.db.commit()


def _step(report, row, stop_on_fail=True):
	report.append(row)
	if stop_on_fail and not row.get("pass"):
		raise frappe.ValidationError(row.get("message") or row.get("step"))


def execute(item_code=None, company=None, pos_profile=None, warehouse=None, stop_on_fail=1):
	stop_on_fail = bool(cint(stop_on_fail))
	frappe.set_user("Administrator")
	report = []

	company = _resolve_company(company)
	warehouse = _resolve_warehouse(warehouse, pos_profile)
	pos_profile = _resolve_pos_profile(pos_profile, warehouse)
	item_code = _resolve_item(item_code)
	customer = _resolve_customer(pos_profile)
	rate = flt(frappe.db.get_value("Item", item_code, "standard_rate")) or 10.0

	if not frappe.get_meta("POS Invoice").has_field("elmahdi_idempotency_key"):
		frappe.throw(
			_("Custom field elmahdi_idempotency_key missing on POS Invoice. Run migrate."),
			frappe.ValidationError,
		)

	_ensure_stock(item_code, warehouse, qty=5)

	shift = open_pos_shift(pos_profile=pos_profile, company=company, user=frappe.session.user, opening_amount=0)
	idempotency_key = f"reg-{uuid.uuid4()}"

	payload = {
		"customer": customer,
		"company": company,
		"pos_profile": pos_profile,
		"pos_opening_entry": shift.get("name"),
		"set_warehouse": warehouse,
		"is_pos": 1,
		"update_stock": 1,
		"idempotency_key": idempotency_key,
		"items": [{"item_code": item_code, "qty": 1, "rate": rate, "warehouse": warehouse}],
		"payments": [{"mode_of_payment": "Cash", "amount": rate}],
	}

	first = create_and_submit_pos_invoice(json.dumps(payload))
	first_name = first.get("name")

	_step(
		report,
		audit_record(
			step="01_first_checkout_submitted",
			passed=bool(first_name) and cint(first.get("docstatus")) == 1,
			document=first_name or "",
			doctype="POS Invoice",
			message=f"docstatus={first.get('docstatus')}",
		),
		stop_on_fail=stop_on_fail,
	)

	second = create_and_submit_pos_invoice(json.dumps(payload))
	second_name = second.get("name")

	same_invoice = first_name == second_name
	_step(
		report,
		audit_record(
			step="02_retry_returns_same_invoice",
			passed=same_invoice,
			document=second_name or "",
			doctype="POS Invoice",
			message=f"first={first_name}, second={second_name}, idempotent_replay={second.get('idempotent_replay')}",
			root_cause=None if same_invoice else "duplicate_pos_invoice_on_retry",
		),
		stop_on_fail=stop_on_fail,
	)

	count = frappe.db.count(
		"POS Invoice",
		{"company": company, "elmahdi_idempotency_key": idempotency_key, "docstatus": ["!=", 2]},
	)
	_step(
		report,
		audit_record(
			step="03_single_db_row_for_key",
			passed=count == 1,
			document=first_name or "",
			message=f"rows_with_key={count}",
			root_cause=None if count == 1 else "duplicate_pos_invoice_on_retry",
		),
		stop_on_fail=stop_on_fail,
	)

	summary = summarize_report(report)
	summary["config"] = {
		"company": company,
		"pos_profile": pos_profile,
		"idempotency_key": idempotency_key,
		"invoice": first_name,
	}
	print_report(summary)

	if not summary.get("success"):
		frappe.throw(
			_("POS idempotency regression failed: {0} step(s)").format(summary.get("failed")),
			frappe.ValidationError,
		)
	return summary

"""
Full ERP/POS integration flow test.

Run:
  bench --site <site> execute elmahdi.tests.run_full_pos_stock_flow.execute \
    --kwargs '{"item_code":"Pepsi 0001","receive_qty":5,"stop_on_fail":1}'
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, today

from elmahdi.api.accounts_payable import create_supplier_payment
from elmahdi.api.erp_submit import native_submit
from elmahdi.api.invoice_matching import auto_create_and_submit_purchase_invoice_for_receipt
from elmahdi.api.pos_checkout import create_and_submit_pos_invoice
from elmahdi.api.shifts import open_pos_shift
from elmahdi.tests.pos_stock_flow_audit import (
	audit_record,
	bin_state,
	classify_failure,
	frontend_display_qty,
	print_report,
	sle_count,
	gle_count,
	summarize_report,
)


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


def _resolve_supplier(supplier=None):
	if supplier and frappe.db.exists("Supplier", supplier):
		return supplier
	row = frappe.db.get_value("Supplier", {"disabled": 0}, "name")
	if not row:
		frappe.throw(_("No Supplier configured"), frappe.ValidationError)
	return row


def _resolve_customer(pos_profile):
	cust = frappe.db.get_value("POS Profile", pos_profile, "customer")
	if cust and frappe.db.exists("Customer", cust):
		return cust
	row = frappe.db.get_value("Customer", {}, "name")
	if not row:
		frappe.throw(_("No Customer configured"), frappe.ValidationError)
	return row


def _resolve_cash_account(company):
	for t in ("Cash", "Bank"):
		acc = frappe.db.get_value("Account", {"company": company, "is_group": 0, "account_type": t}, "name")
		if acc:
			return acc
	frappe.throw(_("No cash/bank account found for company {0}").format(company), frappe.ValidationError)


def _resolve_item(item_code=None):
	if item_code and frappe.db.exists("Item", item_code):
		if not cint(frappe.db.get_value("Item", item_code, "is_stock_item")):
			frappe.db.set_value("Item", item_code, "is_stock_item", 1)
		return item_code
	for code in ("Pepsi 0001", "0001"):
		if frappe.db.exists("Item", code):
			if not cint(frappe.db.get_value("Item", code, "is_stock_item")):
				frappe.db.set_value("Item", code, "is_stock_item", 1)
			return code
	# create fallback item
	code = item_code or "ITEM-E2E-STOCK-FLOW"
	it = frappe.new_doc("Item")
	it.item_code = code
	it.item_name = "E2E Stock Flow Item"
	it.item_group = frappe.db.get_value("Item Group", {}, "name") or "Products"
	it.stock_uom = "Nos"
	it.is_stock_item = 1
	it.standard_rate = 10
	it.insert(ignore_permissions=True)
	frappe.db.commit()
	return it.name


def _step(report, row, stop_on_fail=True):
	report.append(row)
	if stop_on_fail and not row.get("pass"):
		raise frappe.ValidationError(row.get("message") or row.get("step"))


def execute(
	item_code=None,
	receive_qty=50,
	stop_on_fail=1,
	warehouse=None,
	pos_profile=None,
	supplier=None,
	company=None,
	max_pos_sales=200,
):
	stop_on_fail = bool(cint(stop_on_fail))
	frappe.set_user("Administrator")
	report = []

	company = _resolve_company(company)
	warehouse = _resolve_warehouse(warehouse, pos_profile)
	pos_profile = _resolve_pos_profile(pos_profile, warehouse)
	supplier = _resolve_supplier(supplier)
	item_code = _resolve_item(item_code)
	customer = _resolve_customer(pos_profile)
	cash_account = _resolve_cash_account(company)
	rate = flt(frappe.db.get_value("Item", item_code, "standard_rate")) or 10.0
	qty_in = max(1.0, flt(receive_qty))

	# baseline
	base = bin_state(item_code, warehouse)
	base_actual = flt(base["actual_qty"])
	_step(
		report,
		audit_record(
			step="00_baseline",
			passed=True,
			item_code=item_code,
			warehouse=warehouse,
			actual_qty=base_actual,
			reserved_qty=flt(base["reserved_qty"]),
			projected_qty=flt(base["projected_qty"]),
			backend_sellable_qty=flt(base["sellable_qty"]),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
		),
		stop_on_fail=False,
	)

	# Purchase Receipt + native submit
	pr = frappe.new_doc("Purchase Receipt")
	pr.supplier = supplier
	pr.company = company
	pr.set_warehouse = warehouse
	pr.posting_date = today()
	pr.append("items", {"item_code": item_code, "qty": qty_in, "rate": max(rate * 0.8, 1), "warehouse": warehouse})
	pr.insert()
	frappe.flags.elmahdi_purchase_approval_submit = True
	try:
		native_submit(pr)
	finally:
		frappe.flags.elmahdi_purchase_approval_submit = False
	pr.reload()
	frappe.db.commit()

	_step(
		report,
		audit_record(
			step="01_purchase_receipt_submit",
			passed=cint(pr.docstatus) == 1,
			document=pr.name,
			doctype="Purchase Receipt",
			warehouse=warehouse,
			root_cause="draft_document" if cint(pr.docstatus) != 1 else None,
			message="" if cint(pr.docstatus) == 1 else f"docstatus={pr.docstatus}",
		),
		stop_on_fail=stop_on_fail,
	)
	_step(
		report,
		audit_record(
			step="01_purchase_receipt_sle",
			passed=sle_count("Purchase Receipt", pr.name) > 0,
			document=pr.name,
			doctype="Purchase Receipt",
			sle_count=sle_count("Purchase Receipt", pr.name),
			root_cause="missing_sle" if sle_count("Purchase Receipt", pr.name) <= 0 else None,
		),
		stop_on_fail=stop_on_fail,
	)
	after_pr = bin_state(item_code, warehouse)
	_step(
		report,
		audit_record(
			step="01_purchase_receipt_bin",
			passed=flt(after_pr["actual_qty"]) >= base_actual + qty_in - 0.01,
			item_code=item_code,
			warehouse=warehouse,
			qty_before=base_actual,
			qty_after=flt(after_pr["actual_qty"]),
			actual_qty=flt(after_pr["actual_qty"]),
			reserved_qty=flt(after_pr["reserved_qty"]),
			projected_qty=flt(after_pr["projected_qty"]),
			backend_sellable_qty=flt(after_pr["sellable_qty"]),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
			root_cause="frontend_backend_inconsistency"
			if flt(after_pr["actual_qty"]) < base_actual + qty_in - 0.01
			else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# Purchase Invoice auto-create + submit
	pi_result = auto_create_and_submit_purchase_invoice_for_receipt(pr.name)
	pi_name = pi_result.get("name")
	pi = frappe.get_doc("Purchase Invoice", pi_name) if pi_name else None
	_step(
		report,
		audit_record(
			step="02_purchase_invoice_submit",
			passed=bool(pi and cint(pi.docstatus) == 1),
			document=pi_name or "",
			doctype="Purchase Invoice",
			gl_count=gle_count("Purchase Invoice", pi_name) if pi_name else 0,
			root_cause="accounting_mismatch" if not pi_name or cint(pi.docstatus) != 1 else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# Supplier payment
	out_before = flt(frappe.db.get_value("Purchase Invoice", pi_name, "outstanding_amount"))
	pe = create_supplier_payment(
		supplier=supplier,
		company=company,
		paid_from=cash_account,
		allocations=json.dumps([{"invoice": pi_name, "amount": out_before}]),
		submit=1,
	)
	out_after = flt(frappe.db.get_value("Purchase Invoice", pi_name, "outstanding_amount"))
	_step(
		report,
		audit_record(
			step="03_supplier_payment",
			passed=out_after < out_before - 0.0001,
			document=pe.get("name", ""),
			doctype="Payment Entry",
			gl_count=gle_count("Payment Entry", pe.get("name")),
			message=f"outstanding {out_before} -> {out_after}",
			root_cause="accounting_mismatch" if out_after >= out_before else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# Open POS shift
	shift = open_pos_shift(pos_profile=pos_profile, company=company, user=frappe.session.user, opening_amount=0)
	_step(
		report,
		audit_record(
			step="04_open_shift",
			passed=cint(shift.get("docstatus")) == 1,
			document=shift.get("name", ""),
			doctype="POS Opening Entry",
			root_cause="missing_erp_native_submit" if cint(shift.get("docstatus")) != 1 else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# Sell until zero
	sales = 0
	while sales < int(max_pos_sales):
		st = bin_state(item_code, warehouse)
		sellable = flt(st["sellable_qty"])
		if sellable <= 0.0001:
			break
		before = flt(st["actual_qty"])
		payload = {
			"customer": customer,
			"company": company,
			"pos_profile": pos_profile,
			"pos_opening_entry": shift.get("name"),
			"set_warehouse": warehouse,
			"is_pos": 1,
			"update_stock": 1,
			"items": [{"item_code": item_code, "qty": 1, "rate": rate, "warehouse": warehouse}],
			"payments": [{"mode_of_payment": "Cash", "amount": rate}],
		}
		try:
			inv = create_and_submit_pos_invoice(payload)
		except Exception as exc:
			_step(
				report,
				audit_record(
					step=f"05_sale_{sales+1}",
					passed=False,
					item_code=item_code,
					warehouse=warehouse,
					message=str(exc),
					root_cause=classify_failure(exc, context={"frontend_qty": frontend_display_qty(item_code, warehouse), "backend_qty": sellable}),
				),
				stop_on_fail=stop_on_fail,
			)
			break
		sales += 1
		inv_doc = frappe.get_doc("POS Invoice", inv["name"])
		after = bin_state(item_code, warehouse)
		_step(
			report,
			audit_record(
				step=f"05_sale_{sales}",
				passed=(
					cint(inv_doc.docstatus) == 1
					and cint(inv_doc.update_stock) == 1
					and sle_count("POS Invoice", inv_doc.name) > 0
					and flt(after["actual_qty"]) <= before - 0.99
				),
				document=inv_doc.name,
				doctype="POS Invoice",
				item_code=item_code,
				warehouse=warehouse,
				qty_before=before,
				qty_after=flt(after["actual_qty"]),
				actual_qty=flt(after["actual_qty"]),
				reserved_qty=flt(after["reserved_qty"]),
				projected_qty=flt(after["projected_qty"]),
				backend_sellable_qty=flt(after["sellable_qty"]),
				frontend_display_qty=frontend_display_qty(item_code, warehouse),
				sle_count=sle_count("POS Invoice", inv_doc.name),
				root_cause="missing_sle" if sle_count("POS Invoice", inv_doc.name) <= 0 else None,
			),
			stop_on_fail=stop_on_fail,
		)

	# oversell attempt
	oversell_payload = {
		"customer": customer,
		"company": company,
		"pos_profile": pos_profile,
		"pos_opening_entry": shift.get("name"),
		"set_warehouse": warehouse,
		"is_pos": 1,
		"items": [{"item_code": item_code, "qty": 1, "rate": rate, "warehouse": warehouse}],
		"payments": [{"mode_of_payment": "Cash", "amount": rate}],
	}
	oversell_blocked = False
	oversell_message = ""
	try:
		create_and_submit_pos_invoice(oversell_payload)
		oversell_message = "Oversell was accepted unexpectedly"
	except Exception as exc:
		oversell_blocked = True
		oversell_message = str(exc)
	_step(
		report,
		audit_record(
			step="06_oversell_block",
			passed=oversell_blocked,
			item_code=item_code,
			warehouse=warehouse,
			actual_qty=flt(bin_state(item_code, warehouse)["actual_qty"]),
			backend_sellable_qty=flt(bin_state(item_code, warehouse)["sellable_qty"]),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
			message=oversell_message,
			root_cause=None if oversell_blocked else "negative_stock_blocked",
		),
		stop_on_fail=stop_on_fail,
	)

	summary = summarize_report(report)
	summary["config"] = {
		"item_code": item_code,
		"company": company,
		"warehouse": warehouse,
		"supplier": supplier,
		"pos_profile": pos_profile,
		"receive_qty": qty_in,
		"sales_done": sales,
	}
	print_report(summary)

	if not summary.get("success"):
		frappe.throw(_("E2E flow failed: {0} failed step(s)").format(summary.get("failed")), frappe.ValidationError)
	return summary

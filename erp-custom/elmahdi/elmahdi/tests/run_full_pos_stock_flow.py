"""
Full ERP/POS integration flow test.

ERPNext v15 POS lifecycle (authoritative):
  POS Invoice submit  → docstatus=1, NO SLE, NO GL, Bin.actual_qty UNCHANGED.
                         ERPNext does NOT write to Bin.reserved_qty_for_pos.
                         Reservation is tracked via a live SQL query:
                           get_pos_reserved_qty(item_code, warehouse)
                           = SUM(stock_qty) from submitted unconsolidated
                             POS Invoice Items (consolidated_invoice IS NULL).
                         validate_stock_availablility() calls this at validate()
                         time: available = actual_qty - pos_reserved_qty.
                         Overselling is blocked there, not via a Bin write.
  POS Closing submit  → consolidated Sales Invoice created, SLE posted,
                         GL posted, Bin.actual_qty decremented.

  pos_opening_entry is NOT a column on tabPOS Invoice in v15.
  Shift membership is tracked via pos_profile + posting_date + owner
  (see shifts._opening_filters).

Run:
  bench --site <site> execute elmahdi.tests.run_full_pos_stock_flow.execute \
    --kwargs '{"item_code":"Pepsi 0001","receive_qty":5,"stop_on_fail":1}'
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today

from elmahdi.api.accounts_payable import create_supplier_payment
from elmahdi.api.erp_submit import native_submit
from elmahdi.api.invoice_matching import auto_create_and_submit_purchase_invoice_for_receipt
from elmahdi.api.pos_checkout import create_and_submit_pos_invoice
from elmahdi.api.pos_closing_approval import approve_pos_closing_entry
from elmahdi.api.shifts import open_pos_shift, prepare_closing_entry
from erpnext.accounts.doctype.pos_invoice.pos_invoice import get_pos_reserved_qty
from elmahdi.tests.pos_stock_flow_audit import (
	audit_record,
	bin_state,
	classify_failure,
	frontend_display_qty,
	gle_count,
	print_report,
	sle_count,
	summarize_report,
)


# ---------------------------------------------------------------------------
# Resolvers (unchanged)
# ---------------------------------------------------------------------------

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


def _find_consolidated_si(pos_closing_name: str) -> str | None:
	"""
	Return the consolidated Sales Invoice created by POS Closing Entry.

	Tries two locations:
	1. Sales Invoice with pos_closing_entry == closing_name  (primary)
	2. POS Invoice Merge Log.sales_invoice                  (fallback)
	"""
	# primary: direct field on Sales Invoice (ERPNext v15)
	if frappe.db.has_column("Sales Invoice", "pos_closing_entry"):
		si = frappe.db.get_value(
			"Sales Invoice",
			{"pos_closing_entry": pos_closing_name, "docstatus": 1},
			"name",
		)
		if si:
			return si

	# fallback: POS Invoice Merge Log
	if frappe.db.table_exists("POS Invoice Merge Log"):
		si = frappe.db.get_value(
			"POS Invoice Merge Log",
			{"pos_closing_entry": pos_closing_name},
			"sales_invoice",
		)
		if si:
			return si

	return None


# ---------------------------------------------------------------------------
# Step helper (unchanged)
# ---------------------------------------------------------------------------

def _step(report, row, stop_on_fail=True):
	report.append(row)
	if stop_on_fail and not row.get("pass"):
		raise frappe.ValidationError(row.get("message") or row.get("step"))


# ---------------------------------------------------------------------------
# Main execute
# ---------------------------------------------------------------------------

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

	# ------------------------------------------------------------------ #
	# Step 00 — baseline                                                   #
	# ------------------------------------------------------------------ #
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

	# ------------------------------------------------------------------ #
	# Step 01 — Purchase Receipt                                           #
	# ------------------------------------------------------------------ #
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
	actual_after_pr = flt(after_pr["actual_qty"])
	_step(
		report,
		audit_record(
			step="01_purchase_receipt_bin",
			passed=actual_after_pr >= base_actual + qty_in - 0.01,
			item_code=item_code,
			warehouse=warehouse,
			qty_before=base_actual,
			qty_after=actual_after_pr,
			actual_qty=actual_after_pr,
			reserved_qty=flt(after_pr["reserved_qty"]),
			projected_qty=flt(after_pr["projected_qty"]),
			backend_sellable_qty=flt(after_pr["sellable_qty"]),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
			root_cause="frontend_backend_inconsistency"
			if actual_after_pr < base_actual + qty_in - 0.01
			else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# ------------------------------------------------------------------ #
	# Step 02 — Purchase Invoice                                           #
	# ------------------------------------------------------------------ #
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

	# ------------------------------------------------------------------ #
	# Step 03 — Supplier payment                                           #
	# ------------------------------------------------------------------ #
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

	# ------------------------------------------------------------------ #
	# Step 04 — Open POS shift                                             #
	# ------------------------------------------------------------------ #
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
	shift_name = shift.get("name", "")
	# period_start_date is the earliest posting_date that counts as part of this shift
	shift_posting_date = str(
		frappe.db.get_value("POS Opening Entry", shift_name, "period_start_date") or today()
	)

	# ------------------------------------------------------------------ #
	# Steps 05_sale_N — POS sales loop                                     #
	#                                                                      #
	# ERPNext v15 POS Invoice submit:                                      #
	#   - docstatus → 1 (submitted)                                        #
	#   - NO SLE created  (actual_qty UNCHANGED until POS Closing)         #
	#   - NO GL created   (deferred to POS Closing consolidation)          #
	#   - NO Bin write    (reserved_qty_for_pos column does not exist)     #
	#                                                                      #
	# Oversell protection: validate_stock_availablility() runs at          #
	# validate() time via get_pos_reserved_qty() — a live SQL sum of       #
	# stock_qty from submitted unconsolidated POS Invoice Items.           #
	# available = Bin.actual_qty - get_pos_reserved_qty()                  #
	#                                                                      #
	# Shift membership: tracked via pos_profile + posting_date + owner     #
	# (pos_opening_entry is not a column on tabPOS Invoice in v15).        #
	# ------------------------------------------------------------------ #
	qty_sold = 0
	pos_invoice_names: list[str] = []

	while qty_sold < qty_in and len(pos_invoice_names) < int(max_pos_sales):
		# Available for POS = actual_qty − live reserved (submitted unconsolidated invoices)
		pos_reserved_before = get_pos_reserved_qty(item_code, warehouse)
		pos_available_before = flt(bin_state(item_code, warehouse)["actual_qty"]) - pos_reserved_before
		if pos_available_before <= 0.0001:
			break

		payload = {
			"customer": customer,
			"company": company,
			"pos_profile": pos_profile,
			"pos_opening_entry": shift_name,
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
					step=f"05_sale_{qty_sold + 1}",
					passed=False,
					item_code=item_code,
					warehouse=warehouse,
					message=str(exc),
					root_cause=classify_failure(
						exc,
						context={
							"frontend_qty": frontend_display_qty(item_code, warehouse),
							"backend_qty": pos_available_before,
						},
					),
				),
				stop_on_fail=stop_on_fail,
			)
			break

		qty_sold += 1
		pos_invoice_names.append(inv["name"])
		inv_doc = frappe.get_doc("POS Invoice", inv["name"])

		pos_reserved_after = get_pos_reserved_qty(item_code, warehouse)
		actual_after_sale = flt(bin_state(item_code, warehouse)["actual_qty"])

		# --- per-sale assertions ---
		# 1. Invoice submitted.
		invoice_submitted = cint(inv_doc.docstatus) == 1
		# 2. Invoice is a POS invoice.
		invoice_is_pos = cint(inv_doc.is_pos) == 1
		# 3. Shift membership via pos_profile + posting_date + owner.
		#    pos_opening_entry is not a column on tabPOS Invoice in v15;
		#    _opening_filters() in shifts.py uses these three fields instead.
		linked_to_shift = (
			inv_doc.pos_profile == pos_profile
			and inv_doc.owner == frappe.session.user
			and getdate(inv_doc.posting_date) >= getdate(shift_posting_date)
		)
		# 4. ERPNext live reservation increased: get_pos_reserved_qty() now
		#    includes this invoice's stock_qty in its SQL sum.
		#    actual_qty is intentionally NOT expected to change here.
		reservation_increased = pos_reserved_after >= pos_reserved_before + 0.99

		_step(
			report,
			audit_record(
				step=f"05_sale_{qty_sold}",
				passed=invoice_submitted and invoice_is_pos and linked_to_shift and reservation_increased,
				document=inv_doc.name,
				doctype="POS Invoice",
				item_code=item_code,
				warehouse=warehouse,
				# actual_qty recorded for traceability; NOT asserted (deferred to closing)
				actual_qty=actual_after_sale,
				qty_before=actual_after_sale,
				qty_after=actual_after_sale,
				reserved_qty=flt(bin_state(item_code, warehouse)["reserved_qty"]),
				projected_qty=flt(bin_state(item_code, warehouse)["projected_qty"]),
				backend_sellable_qty=actual_after_sale - pos_reserved_after,
				frontend_display_qty=frontend_display_qty(item_code, warehouse),
				# SLE count is 0 by design — not checked
				message=(
					f"submitted={invoice_submitted}, is_pos={invoice_is_pos}, "
					f"shift_link={linked_to_shift} "
					f"(profile={inv_doc.pos_profile}=={pos_profile}, "
					f"owner={inv_doc.owner}=={frappe.session.user}, "
					f"date={inv_doc.posting_date}>={shift_posting_date}), "
					f"pos_reserved {pos_reserved_before:.2f}→{pos_reserved_after:.2f}"
				),
				root_cause=(
					"draft_document" if not invoice_submitted
					else "invoice_not_linked_to_shift" if not linked_to_shift
					else "pos_reservation_not_updated" if not reservation_increased
					else None
				),
			),
			stop_on_fail=stop_on_fail,
		)

	# ------------------------------------------------------------------ #
	# Step 06 — Oversell prevention                                        #
	# ------------------------------------------------------------------ #
	oversell_payload = {
		"customer": customer,
		"company": company,
		"pos_profile": pos_profile,
		"pos_opening_entry": shift_name,
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
			backend_sellable_qty=(
				flt(bin_state(item_code, warehouse)["actual_qty"])
				- get_pos_reserved_qty(item_code, warehouse)
			),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
			message=oversell_message,
			root_cause=None if oversell_blocked else "negative_stock_blocked",
		),
		stop_on_fail=stop_on_fail,
	)

	# ------------------------------------------------------------------ #
	# Step 07 — POS Closing Entry                                          #
	#                                                                      #
	# prepare_closing_entry creates the draft.                             #
	# approve_pos_closing_entry submits it (Administrator = break-glass,   #
	# bypasses both the self-approval guard and the cashier gate).         #
	# ERPNext then creates a consolidated Sales Invoice, posts SLE and GL. #
	# ------------------------------------------------------------------ #
	actual_cash_collected = flt(rate) * qty_sold
	closing_draft = prepare_closing_entry(
		pos_opening_entry=shift_name,
		actual_cash=actual_cash_collected,
	)
	closing_draft_name = closing_draft.get("name", "")

	closing_result = approve_pos_closing_entry(closing_draft_name)
	closing_submitted = cint(closing_result.get("docstatus")) == 1

	_step(
		report,
		audit_record(
			step="07_pos_closing_submit",
			passed=closing_submitted,
			document=closing_draft_name,
			doctype="POS Closing Entry",
			message=(
				f"docstatus={closing_result.get('docstatus')}, "
				f"status={closing_result.get('status')}, "
				f"invoices_closed={qty_sold}"
			),
			root_cause="missing_erp_native_submit" if not closing_submitted else None,
		),
		stop_on_fail=stop_on_fail,
	)
	frappe.db.commit()

	# ------------------------------------------------------------------ #
	# Steps 08 — Post-closing stock and ledger integrity                   #
	#                                                                      #
	# After POS Closing, the consolidated Sales Invoice carries the SLE    #
	# and GL entries.  Bin.actual_qty must now reflect all sold units.     #
	# ------------------------------------------------------------------ #
	consolidated_si = _find_consolidated_si(closing_draft_name)

	after_closing = bin_state(item_code, warehouse)
	actual_after_closing = flt(after_closing["actual_qty"])
	expected_actual_after = actual_after_pr - qty_sold

	actual_qty_ok = abs(actual_after_closing - expected_actual_after) < 0.5
	_step(
		report,
		audit_record(
			step="08_post_closing_actual_qty",
			passed=actual_qty_ok,
			item_code=item_code,
			warehouse=warehouse,
			qty_before=actual_after_pr,
			qty_after=actual_after_closing,
			actual_qty=actual_after_closing,
			reserved_qty=flt(after_closing["reserved_qty"]),
			projected_qty=flt(after_closing["projected_qty"]),
			backend_sellable_qty=flt(after_closing["sellable_qty"]),
			frontend_display_qty=frontend_display_qty(item_code, warehouse),
			message=(
				f"after_pr={actual_after_pr}, qty_sold={qty_sold}, "
				f"expected={expected_actual_after:.2f}, actual={actual_after_closing:.2f}"
			),
			root_cause="missing_sle" if not actual_qty_ok else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# SLE: expected on consolidated Sales Invoice
	si_sle = sle_count("Sales Invoice", consolidated_si) if consolidated_si else 0
	sle_ok = si_sle > 0
	_step(
		report,
		audit_record(
			step="08_post_closing_sle",
			passed=sle_ok,
			document=consolidated_si or "",
			doctype="Sales Invoice",
			sle_count=si_sle,
			message=(
				f"consolidated_si={consolidated_si or 'NOT_FOUND'}, sle_count={si_sle}"
			),
			root_cause="missing_sle" if not sle_ok else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# GL: expected on consolidated Sales Invoice
	si_gl = gle_count("Sales Invoice", consolidated_si) if consolidated_si else 0
	gl_ok = si_gl > 0
	_step(
		report,
		audit_record(
			step="08_post_closing_gl",
			passed=gl_ok,
			document=consolidated_si or "",
			doctype="Sales Invoice",
			gl_count=si_gl,
			message=(
				f"consolidated_si={consolidated_si or 'NOT_FOUND'}, gl_count={si_gl}"
			),
			root_cause="accounting_mismatch" if not gl_ok else None,
		),
		stop_on_fail=stop_on_fail,
	)

	# ------------------------------------------------------------------ #
	# Report                                                               #
	# ------------------------------------------------------------------ #
	summary = summarize_report(report)
	summary["config"] = {
		"item_code": item_code,
		"company": company,
		"warehouse": warehouse,
		"supplier": supplier,
		"pos_profile": pos_profile,
		"receive_qty": qty_in,
		"sales_done": qty_sold,
		"pos_invoices": pos_invoice_names,
		"consolidated_si": consolidated_si,
		"pos_closing": closing_draft_name,
	}
	print_report(summary)

	if not summary.get("success"):
		frappe.throw(_("E2E flow failed: {0} failed step(s)").format(summary.get("failed")), frappe.ValidationError)
	return summary

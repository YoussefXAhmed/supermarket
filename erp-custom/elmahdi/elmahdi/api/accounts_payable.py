"""
Accounts Payable — supplier payments via ERPNext Payment Entry (authoritative accounting).
"""

from __future__ import annotations

import json
from datetime import date, datetime

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, now_datetime, today

# Payment status keys returned to SPA (display mapping in apPaymentStatus.js)
PAY_STATUS_UNPAID = "unpaid"
PAY_STATUS_PARTIALLY_PAID = "partially_paid"
PAY_STATUS_PAID = "paid"
PAY_STATUS_OVERDUE = "overdue"
PAY_STATUS_CANCELLED = "cancelled"
PAY_STATUS_DRAFT = "draft"

AUDIT_FIELD = "elmahdi_payment_audit"


def _has_pe_audit_field() -> bool:
	return frappe.db.has_column("Payment Entry", AUDIT_FIELD)


def _parse_audit(doc) -> dict:
	raw = doc.get(AUDIT_FIELD) if _has_pe_audit_field() else ""
	if not raw:
		return {"events": []}
	try:
		data = json.loads(raw)
		return data if isinstance(data, dict) else {"events": []}
	except Exception:
		return {"events": []}


def _append_pe_audit(pe_name: str, event: dict) -> None:
	if not _has_pe_audit_field():
		return
	doc = frappe.get_doc("Payment Entry", pe_name)
	audit = _parse_audit(doc)
	events = audit.get("events") or []
	events.append({**event, "user": frappe.session.user, "at": now_datetime().isoformat()})
	audit["events"] = events[-50:]
	frappe.db.set_value(
		"Payment Entry",
		pe_name,
		AUDIT_FIELD,
		json.dumps(audit, default=str),
		update_modified=False,
	)


def _require_ap_read():
	from elmahdi.api.spa_authorization import assert_may_access_finance

	assert_may_access_finance()
	frappe.has_permission("Purchase Invoice", "read", throw=True)


def _require_payment_create():
	frappe.has_permission("Payment Entry", "create", throw=True)
	from elmahdi.api.spa_authorization import assert_may_record_supplier_payment

	assert_may_record_supplier_payment()


def _require_payment_read():
	from elmahdi.api.spa_authorization import assert_may_view_supplier_payments

	assert_may_view_supplier_payments()
	frappe.has_permission("Payment Entry", "read", throw=True)


def _default_company():
	return (
		frappe.defaults.get_user_default("Company")
		or frappe.db.get_single_value("Global Defaults", "default_company")
		or frappe.db.get_value("Company", {}, "name")
	)


def _invoice_payment_status(inv: dict) -> str:
	if inv.get("docstatus") == 2:
		return PAY_STATUS_CANCELLED
	if inv.get("docstatus") == 0:
		return PAY_STATUS_DRAFT
	outstanding = flt(inv.get("outstanding_amount"))
	grand = flt(inv.get("grand_total"))
	if outstanding <= 0.009:
		return PAY_STATUS_PAID
	due = inv.get("due_date")
	if due and getdate(due) < getdate(today()) and outstanding > 0:
		return PAY_STATUS_OVERDUE
	if outstanding < grand - 0.009:
		return PAY_STATUS_PARTIALLY_PAID
	return PAY_STATUS_UNPAID


def _paid_pct(inv: dict) -> float:
	grand = flt(inv.get("grand_total"))
	if grand <= 0:
		return 0.0
	paid = grand - flt(inv.get("outstanding_amount"))
	return round(max(0.0, min(100.0, paid / grand * 100)), 2)


def _due_window(due_value) -> tuple[int, int]:
	"""(days_remaining, days_overdue) — positive ints; one of them is always 0.

	`due_value` may be a date, datetime, ISO string, or None. Returns (0, 0)
	when no due date is set.
	"""
	if not due_value:
		return 0, 0
	try:
		d = getdate(due_value)
	except Exception:
		return 0, 0
	today_d = getdate(today())
	delta = (d - today_d).days
	if delta >= 0:
		return delta, 0
	return 0, -delta


def _linked_receipts_for_invoice(invoice_name: str) -> list[str]:
	"""Distinct Purchase Receipt names linked via Purchase Invoice Item rows."""
	rows = frappe.get_all(
		"Purchase Invoice Item",
		filters={"parent": invoice_name, "purchase_receipt": ["!=", ""]},
		fields=["purchase_receipt"],
		distinct=True,
	)
	return list({r.purchase_receipt for r in rows if r.purchase_receipt})


def _base_invoice_filters(company=None, supplier=None, include_paid=False):
	# Submitted only; restrict to open balances unless caller explicitly wants paid invoices
	filters = [["docstatus", "=", 1]]
	if not include_paid:
		filters.append(["outstanding_amount", ">", 0])
	if company:
		filters.append(["company", "=", company])
	if supplier:
		filters.append(["supplier", "=", supplier])
	return filters


def _fetch_invoices(company=None, supplier=None, status=None, limit=200):
	# Paid invoices (outstanding=0) must be included when listing "paid" or "all" tabs;
	# dashboard calls (status=None) stay open-payables-only so aging buckets are correct.
	include_paid = status in (PAY_STATUS_PAID, "all")
	filters = _base_invoice_filters(company, supplier, include_paid=include_paid)
	rows = frappe.get_all(
		"Purchase Invoice",
		filters=filters,
		fields=[
			"name",
			"supplier",
			"supplier_name",
			"company",
			"posting_date",
			"due_date",
			"bill_no",
			"grand_total",
			"outstanding_amount",
			"docstatus",
			"status",
			"currency",
			"set_warehouse",
			"cost_center",
			"owner",
			"creation",
		],
		order_by="due_date asc, posting_date desc",
		limit_page_length=int(limit or 200),
	)
	out = []
	for row in rows:
		ps = _invoice_payment_status(row)
		if status and status != "all" and ps != status:
			continue
		days_remaining, days_overdue = _due_window(row.due_date)
		receipts = _linked_receipts_for_invoice(row.name)
		out.append(
			{
				**row,
				"posting_date": str(row.posting_date) if row.posting_date else "",
				"due_date": str(row.due_date) if row.due_date else "",
				"grand_total": flt(row.grand_total),
				"outstanding_amount": flt(row.outstanding_amount),
				"paid_amount": round(flt(row.grand_total) - flt(row.outstanding_amount), 2),
				"paid_pct": _paid_pct(row),
				"payment_status": ps,
				"days_remaining": days_remaining,
				"days_overdue": days_overdue,
				"purchase_receipts": receipts,
				"purchase_receipt": receipts[0] if receipts else "",
				# Branch = warehouse in this single-company supermarket setup;
				# cost_center is kept as a secondary field for ERPNext fidelity.
				"branch": row.set_warehouse or row.cost_center or "",
				"created_by": row.owner or "",
				"creation": str(row.creation) if row.creation else "",
			}
		)
	return out


def _aging_buckets(invoices):
	buckets = {
		"current": 0.0,
		"days_1_30": 0.0,
		"days_31_60": 0.0,
		"days_61_90": 0.0,
		"days_90_plus": 0.0,
	}
	today_d = getdate(today())
	for inv in invoices:
		out = flt(inv.get("outstanding_amount"))
		if out <= 0:
			continue
		due = inv.get("due_date")
		if not due:
			buckets["current"] += out
			continue
		due_d = getdate(due)
		if due_d >= today_d:
			buckets["current"] += out
			continue
		days = (today_d - due_d).days
		if days <= 30:
			buckets["days_1_30"] += out
		elif days <= 60:
			buckets["days_31_60"] += out
		elif days <= 90:
			buckets["days_61_90"] += out
		else:
			buckets["days_90_plus"] += out
	return {k: round(v, 2) for k, v in buckets.items()}


def _payment_references_for_invoice(invoice_name: str) -> list[dict]:
	rows = frappe.db.sql(
		"""
		SELECT
			per.parent AS payment_entry,
			per.allocated_amount,
			pe.posting_date,
			pe.paid_from,
			pe.paid_to,
			pe.mode_of_payment,
			pe.reference_no,
			pe.docstatus,
			pe.owner,
			pe.creation
		FROM `tabPayment Entry Reference` per
		INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
		WHERE per.reference_doctype = 'Purchase Invoice'
			AND per.reference_name = %s
			AND pe.docstatus != 2
		ORDER BY pe.posting_date DESC, pe.creation DESC
		""",
		invoice_name,
		as_dict=True,
	)
	return [
		{
			"payment_entry": r.payment_entry,
			"allocated_amount": flt(r.allocated_amount),
			"posting_date": str(r.posting_date) if r.posting_date else "",
			"paid_from": r.paid_from,
			"paid_to": r.paid_to,
			"mode_of_payment": r.mode_of_payment,
			"reference_no": r.reference_no,
			"docstatus": r.docstatus,
			"created_by": r.owner,
			"created_at": str(r.creation) if r.creation else "",
		}
		for r in rows
	]


@frappe.whitelist()
def get_ap_dashboard(company=None, supplier=None):
	"""Summary KPIs, aging, supplier exposure — all from ERP Purchase Invoice / Payment Entry."""
	_require_ap_read()
	company = company or _default_company()
	invoices = _fetch_invoices(company=company, supplier=supplier, limit=500)

	unpaid = [i for i in invoices if i["payment_status"] in (PAY_STATUS_UNPAID, PAY_STATUS_OVERDUE)]
	partial = [i for i in invoices if i["payment_status"] == PAY_STATUS_PARTIALLY_PAID]
	paid = [i for i in invoices if i["payment_status"] == PAY_STATUS_PAID]
	overdue = [i for i in invoices if i["payment_status"] == PAY_STATUS_OVERDUE]

	total_outstanding = round(sum(flt(i["outstanding_amount"]) for i in invoices), 2)
	overdue_amount = round(sum(flt(i["outstanding_amount"]) for i in overdue), 2)

	supplier_map = {}
	for inv in invoices:
		out = flt(inv["outstanding_amount"])
		if out <= 0:
			continue
		key = inv["supplier"]
		if key not in supplier_map:
			supplier_map[key] = {
				"supplier": key,
				"supplier_name": inv.get("supplier_name") or key,
				"outstanding": 0.0,
				"invoice_count": 0,
				"overdue_amount": 0.0,
			}
		supplier_map[key]["outstanding"] += out
		supplier_map[key]["invoice_count"] += 1
		if inv["payment_status"] == PAY_STATUS_OVERDUE:
			supplier_map[key]["overdue_amount"] += out

	suppliers = sorted(
		supplier_map.values(),
		key=lambda x: -x["outstanding"],
	)[:20]
	for s in suppliers:
		s["outstanding"] = round(s["outstanding"], 2)
		s["overdue_amount"] = round(s["overdue_amount"], 2)

	# Today's payments — sum of Payment Entries posted today (Pay type only).
	today_payments_row = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(paid_amount), 0) AS total, COUNT(*) AS cnt
		FROM `tabPayment Entry`
		WHERE docstatus = 1
			AND payment_type = 'Pay'
			AND posting_date = %s
			AND (%s IS NULL OR company = %s)
		""",
		(today(), company, company),
		as_dict=True,
	)
	today_total = flt(today_payments_row[0].total) if today_payments_row else 0.0
	today_count = int(today_payments_row[0].cnt) if today_payments_row else 0

	# Cash-in-hand / bank balances — read live from ERPNext GL Entry, grouped
	# by the account_type set on each Account record.
	cash_total = _account_type_balance("Cash", company)
	bank_total = _account_type_balance("Bank", company)

	return {
		"company": company,
		"counts": {
			"unpaid": len(unpaid),
			"partially_paid": len(partial),
			"paid": len(paid),
			"overdue": len(overdue),
			"total_invoices": len(invoices),
			"today_payment_count": today_count,
		},
		"amounts": {
			"total_outstanding": total_outstanding,
			"overdue_amount": overdue_amount,
			"today_payments": round(today_total, 2),
			"cash_in_hand": round(cash_total, 2),
			"bank_balance": round(bank_total, 2),
		},
		"aging": _aging_buckets(invoices),
		"top_suppliers": suppliers,
	}


def _account_type_balance(account_type: str, company: str) -> float:
	"""Live ledger balance for all Cash or Bank accounts in a company.

	Uses GL Entry so the result reflects every posted transaction (POS sales,
	supplier payments, journal entries) without the user having to reconcile
	per account first.
	"""
	row = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(gle.debit - gle.credit), 0) AS bal
		FROM `tabGL Entry` gle
		INNER JOIN `tabAccount` a ON a.name = gle.account
		WHERE gle.is_cancelled = 0
			AND gle.docstatus = 1
			AND a.account_type = %s
			AND (%s IS NULL OR gle.company = %s)
		""",
		(account_type, company, company),
		as_dict=True,
	)
	return flt(row[0].bal) if row else 0.0


@frappe.whitelist()
def list_ap_invoices(
	company=None,
	supplier=None,
	status="all",
	due_from=None,
	due_to=None,
	limit=200,
):
	_require_ap_read()
	company = company or _default_company()
	rows = _fetch_invoices(company=company, supplier=supplier, status=status, limit=limit)
	if due_from:
		rows = [r for r in rows if r.get("due_date") and r["due_date"] >= str(due_from)]
	if due_to:
		rows = [r for r in rows if r.get("due_date") and r["due_date"] <= str(due_to)]
	if status and status != "all":
		rows = [r for r in rows if r["payment_status"] == status]
	return rows


@frappe.whitelist()
def get_ap_invoice_detail(invoice_name):
	_require_ap_read()
	if not frappe.db.exists("Purchase Invoice", invoice_name):
		frappe.throw(_("Purchase Invoice {0} not found.").format(invoice_name), frappe.DoesNotExistError)
	inv = frappe.get_doc("Purchase Invoice", invoice_name)
	days_remaining, days_overdue = _due_window(inv.due_date)
	receipts = _linked_receipts_for_invoice(invoice_name)
	items = []
	for line in inv.items or []:
		items.append({
			"item_code": line.item_code,
			"item_name": line.item_name,
			"qty": flt(line.qty),
			"rate": flt(line.rate),
			"amount": flt(line.amount),
			"uom": line.uom,
			"purchase_receipt": line.purchase_receipt or "",
		})
	row = {
		"name": inv.name,
		"supplier": inv.supplier,
		"supplier_name": inv.supplier_name,
		"company": inv.company,
		"posting_date": str(inv.posting_date),
		"due_date": str(inv.due_date) if inv.due_date else "",
		"bill_no": inv.bill_no,
		"grand_total": flt(inv.grand_total),
		"net_total": flt(inv.net_total),
		"total_taxes_and_charges": flt(inv.total_taxes_and_charges),
		"outstanding_amount": flt(inv.outstanding_amount),
		"paid_amount": round(flt(inv.grand_total) - flt(inv.outstanding_amount), 2),
		"docstatus": inv.docstatus,
		"currency": inv.currency or "EGP",
		"payment_status": _invoice_payment_status(
			{
				"docstatus": inv.docstatus,
				"outstanding_amount": inv.outstanding_amount,
				"grand_total": inv.grand_total,
				"due_date": inv.due_date,
			}
		),
		"paid_pct": _paid_pct(
			{"grand_total": inv.grand_total, "outstanding_amount": inv.outstanding_amount}
		),
		"days_remaining": days_remaining,
		"days_overdue": days_overdue,
		"purchase_receipts": receipts,
		"purchase_receipt": receipts[0] if receipts else "",
		"items": items,
		"remarks": inv.remarks or "",
	}
	payments = _payment_references_for_invoice(invoice_name)
	return {
		"invoice": row,
		"payments": payments,
		"payment_timeline": payments,
	}


@frappe.whitelist()
def get_supplier_ap_summary(supplier, company=None):
	_require_ap_read()
	company = company or _default_company()
	invoices = _fetch_invoices(company=company, supplier=supplier, limit=500)
	outstanding = round(sum(flt(i["outstanding_amount"]) for i in invoices), 2)
	overdue = round(
		sum(
			flt(i["outstanding_amount"])
			for i in invoices
			if i["payment_status"] == PAY_STATUS_OVERDUE
		),
		2,
	)

	last_payment = frappe.db.sql(
		"""
		SELECT pe.name, pe.posting_date, pe.paid_amount, pe.paid_from, pe.mode_of_payment
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1
			AND pe.party_type = 'Supplier'
			AND pe.party = %s
			AND pe.company = %s
			AND pe.payment_type = 'Pay'
		ORDER BY pe.posting_date DESC, pe.creation DESC
		LIMIT 1
		""",
		(supplier, company),
		as_dict=True,
	)

	payments = frappe.get_all(
		"Payment Entry",
		filters={
			"docstatus": 1,
			"party_type": "Supplier",
			"party": supplier,
			"company": company,
			"payment_type": "Pay",
		},
		fields=["name", "posting_date", "paid_amount", "paid_from", "mode_of_payment", "reference_no"],
		order_by="posting_date desc",
		limit_page_length=25,
	)

	awaiting_payable_count = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT pr.name)
		FROM `tabPurchase Receipt` pr
		WHERE pr.docstatus = 1
			AND pr.supplier = %s
			AND pr.company = %s
			AND IFNULL(pr.per_billed, 0) < 99.99
			AND NOT EXISTS (
				SELECT 1
				FROM `tabPurchase Invoice Item` pii
				INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
				WHERE pii.purchase_receipt = pr.name AND pi.docstatus = 1
			)
		""",
		(supplier, company),
	)[0][0]
	paid_invoice_count = len([i for i in invoices if flt(i["outstanding_amount"]) <= 0.009])
	paid_invoice_names = [
		i["name"] for i in invoices if flt(i["outstanding_amount"]) <= 0.009
	][:5]

	return {
		"supplier": supplier,
		"company": company,
		"outstanding": outstanding,
		"overdue_amount": overdue,
		"invoice_count": len(invoices),
		"open_invoice_count": len([i for i in invoices if flt(i["outstanding_amount"]) > 0.009]),
		"awaiting_payable_count": int(awaiting_payable_count or 0),
		"paid_invoice_count": paid_invoice_count,
		"paid_invoice_names": paid_invoice_names,
		"last_payment": last_payment[0] if last_payment else None,
		"recent_payments": payments,
		"aging": _aging_buckets(invoices),
	}


@frappe.whitelist()
def list_payment_accounts(company=None, account_type=None):
	"""Cash and bank accounts for Payment Entry paid_from."""
	_require_ap_read()
	company = company or _default_company()
	types = ["Bank", "Cash"]
	if account_type and account_type in types:
		types = [account_type]
	rows = frappe.get_all(
		"Account",
		filters={
			"company": company,
			"account_type": ["in", types],
			"is_group": 0,
			"disabled": 0,
		},
		fields=["name", "account_name", "account_type"],
		order_by="account_type asc, name asc",
	)
	return [
		{
			"name": r.name,
			"label": f"{r.account_name or r.name} ({r.account_type})",
			"account_type": r.account_type,
		}
		for r in rows
	]


@frappe.whitelist()
def list_supplier_payment_history(supplier=None, company=None, limit=50):
	_require_payment_read()
	company = company or _default_company()
	filters = {
		"docstatus": ["!=", 2],
		"party_type": "Supplier",
		"payment_type": "Pay",
		"company": company,
	}
	if supplier:
		filters["party"] = supplier
	rows = frappe.get_all(
		"Payment Entry",
		filters=filters,
		fields=[
			"name",
			"party",
			"posting_date",
			"paid_amount",
			"paid_from",
			"paid_to",
			"mode_of_payment",
			"reference_no",
			"remarks",
			"docstatus",
			"owner",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=int(limit or 50),
	)
	out = []
	for pe in rows:
		refs = frappe.get_all(
			"Payment Entry Reference",
			filters={"parent": pe.name},
			fields=["reference_doctype", "reference_name", "allocated_amount"],
		)
		out.append(
			{
				**pe,
				"posting_date": str(pe.posting_date) if pe.posting_date else "",
				"paid_amount": flt(pe.paid_amount),
				"references": refs,
				"docstatus_label": "Submitted" if pe.docstatus == 1 else "Draft",
			}
		)
	return out


def _validate_allocations(supplier, company, allocations):
	if isinstance(allocations, str):
		allocations = json.loads(allocations)
	if not allocations:
		frappe.throw(_("Select at least one purchase invoice to pay."), frappe.ValidationError)

	seen = set()
	total = 0.0
	normalized = []

	for row in allocations:
		inv_name = (row.get("invoice") or row.get("reference_name") or "").strip()
		amount = flt(row.get("amount") or row.get("allocated_amount"))
		if not inv_name:
			frappe.throw(_("Invoice reference is required on each allocation."), frappe.ValidationError)
		if inv_name in seen:
			frappe.throw(
				_("Duplicate allocation for invoice {0}.").format(inv_name),
				frappe.ValidationError,
			)
		seen.add(inv_name)
		if amount <= 0:
			frappe.throw(
				_("Payment amount must be greater than zero for {0}.").format(inv_name),
				frappe.ValidationError,
			)

		if not frappe.db.exists("Purchase Invoice", inv_name):
			frappe.throw(_("Purchase Invoice {0} not found.").format(inv_name), frappe.DoesNotExistError)

		inv = frappe.get_doc("Purchase Invoice", inv_name)
		if inv.docstatus != 1:
			frappe.throw(
				_("Invoice {0} must be submitted before payment.").format(inv_name),
				frappe.ValidationError,
			)
		if inv.docstatus == 2:
			frappe.throw(_("Invoice {0} is cancelled.").format(inv_name), frappe.ValidationError)
		if inv.supplier != supplier:
			frappe.throw(
				_("Invoice {0} supplier does not match selected supplier.").format(inv_name),
				frappe.ValidationError,
			)
		if inv.company != company:
			frappe.throw(
				_("Invoice {0} company does not match payment company.").format(inv_name),
				frappe.ValidationError,
			)

		outstanding = flt(inv.outstanding_amount)
		if outstanding <= 0:
			frappe.throw(_("Invoice {0} has no outstanding balance.").format(inv_name), frappe.ValidationError)
		if amount > outstanding + 0.009:
			frappe.throw(
				_("Payment {0} exceeds outstanding {1} on invoice {2}.").format(
					amount, outstanding, inv_name
				),
				frappe.ValidationError,
			)

		total += amount
		normalized.append(
			{
				"invoice": inv_name,
				"amount": amount,
				"outstanding_before": outstanding,
				"due_date": inv.due_date,
				"grand_total": flt(inv.grand_total),
			}
		)

	return normalized, round(total, 2)


@frappe.whitelist(methods=["POST"])
def create_supplier_payment(
	supplier,
	company=None,
	paid_from=None,
	posting_date=None,
	reference_no=None,
	reference_date=None,
	remarks=None,
	allocations=None,
	submit=1,
	idempotency_key=None,
	mode_of_payment=None,
):
	"""
	Create ERPNext Payment Entry (Pay) against Purchase Invoice(s) and submit.
	allocations: JSON list of {invoice, amount}

	idempotency_key: optional client-supplied key. If a Payment Entry was
	already created for the same key within the last 24h, that entry is
	returned instead of creating a duplicate. Protects against double-clicks
	and network retries.
	"""
	_require_payment_create()
	company = company or _default_company()
	if not supplier:
		frappe.throw(_("Supplier is required."), frappe.ValidationError)
	if not paid_from:
		frappe.throw(_("Payment account (cash/bank) is required."), frappe.ValidationError)

	# Idempotency check — return existing payment if key matches a recent entry.
	if idempotency_key:
		cached_key = f"elmahdi:supplier_payment:{frappe.session.user}:{idempotency_key}"
		existing = frappe.cache().get_value(cached_key)
		if existing:
			if frappe.db.exists("Payment Entry", existing):
				pe_existing = frappe.get_doc("Payment Entry", existing)
				return {
					"name": pe_existing.name,
					"docstatus": pe_existing.docstatus,
					"paid_amount": flt(pe_existing.paid_amount),
					"idempotent_replay": True,
				}

	if not frappe.db.exists("Account", paid_from):
		frappe.throw(_("Payment account {0} not found.").format(paid_from), frappe.DoesNotExistError)

	acc = frappe.get_doc("Account", paid_from)
	if acc.company != company:
		frappe.throw(_("Payment account must belong to company {0}.").format(company), frappe.ValidationError)
	if acc.account_type not in ("Bank", "Cash"):
		frappe.throw(_("Payment account must be a Bank or Cash account."), frappe.ValidationError)

	normalized, total_paid = _validate_allocations(supplier, company, allocations)

	try:
		from erpnext.accounts.party import get_party_account
	except ImportError:
		get_party_account = None

	paid_to = None
	if get_party_account:
		paid_to = get_party_account("Supplier", supplier, company)
	if not paid_to:
		paid_to = frappe.get_cached_value("Company", company, "default_payable_account")
	if not paid_to:
		frappe.throw(
			_("No payable account configured for supplier payments."),
			frappe.ValidationError,
		)

	pe = frappe.new_doc("Payment Entry")
	pe.payment_type = "Pay"
	pe.party_type = "Supplier"
	pe.party = supplier
	pe.company = company
	pe.posting_date = posting_date or today()
	pe.paid_from = paid_from
	pe.paid_to = paid_to
	pe.paid_amount = total_paid
	pe.received_amount = total_paid
	pe.target_exchange_rate = 1
	pe.source_exchange_rate = 1
	if reference_no:
		pe.reference_no = reference_no
	if reference_date:
		pe.reference_date = reference_date
	if remarks:
		pe.remarks = remarks
	if mode_of_payment:
		# Validate that the requested mode is enabled — silently dropping
		# unknown methods would hide a UI/backend mismatch.
		if not frappe.db.exists("Mode of Payment", {"name": mode_of_payment, "enabled": 1}):
			frappe.throw(
				_("Payment method '{0}' is not enabled.").format(mode_of_payment),
				frappe.ValidationError,
			)
		pe.mode_of_payment = mode_of_payment

	for row in normalized:
		pe.append(
			"references",
			{
				"reference_doctype": "Purchase Invoice",
				"reference_name": row["invoice"],
				"due_date": row.get("due_date"),
				"total_amount": row["grand_total"],
				"outstanding_amount": row["outstanding_before"],
				"allocated_amount": row["amount"],
			},
		)

	# Let ERPNext populate currencies, exchange rates, party account fields, and validate references.
	# This is critical for correct outstanding updates and allocation behavior.
	try:
		pe.set_missing_values()
	except Exception:
		# Some ERPNext versions use a different helper; safe to ignore and rely on submit validation.
		pass
	pe.validate()

	pe.insert()

	_append_pe_audit(
		pe.name,
		{
			"action": "created",
			"supplier": supplier,
			"allocations": normalized,
			"paid_from": paid_from,
			"paid_amount": total_paid,
		},
	)

	submitted = False
	if cint(submit):
		from elmahdi.api.erp_submit import assert_submitted_side_effects

		frappe.has_permission("Payment Entry", "submit", doc=pe, throw=True)
		pe.submit()
		pe.reload()
		assert_submitted_side_effects(pe)
		submitted = True
		_append_pe_audit(pe.name, {"action": "submitted", "paid_amount": total_paid})

	frappe.db.commit()

	pe.reload()
	# Ensure invoice outstanding/status updated (ERP should do this automatically on submit).
	# Returning fresh outstanding helps UI verify allocation succeeded.
	invoices_after = {}
	for r in pe.references or []:
		try:
			inv = frappe.db.get_value(
				"Purchase Invoice",
				r.reference_name,
				["name", "outstanding_amount", "status", "docstatus"],
				as_dict=True,
			)
			if inv:
				invoices_after[inv.name] = {
					"outstanding_amount": flt(inv.outstanding_amount),
					"status": inv.status,
					"docstatus": inv.docstatus,
				}
		except Exception:
			continue

	# Cache idempotency key after successful creation (24h TTL).
	if idempotency_key:
		try:
			frappe.cache().set_value(
				f"elmahdi:supplier_payment:{frappe.session.user}:{idempotency_key}",
				pe.name,
				expires_in_sec=24 * 3600,
			)
		except Exception:
			pass

	try:
		from elmahdi.api.notifications import notify_supplier_payment
		notify_supplier_payment(pe.name, supplier, flt(pe.paid_amount), frappe.session.user)
	except Exception:
		pass

	return {
		"name": pe.name,
		"docstatus": pe.docstatus,
		"submitted": submitted,
		"paid_amount": flt(pe.paid_amount),
		"party": pe.party,
		"posting_date": str(pe.posting_date),
		"mode_of_payment": pe.mode_of_payment or "",
		"paid_from": pe.paid_from,
		"reference_no": pe.reference_no or "",
		"invoices_after": invoices_after,
		"references": [
			{
				"invoice": r.reference_name,
				"allocated_amount": flt(r.allocated_amount),
			}
			for r in (pe.references or [])
		],
	}


# ─── Phase 4.b · Domain 4 — Batch supplier payments ───────────────────────
#
# `batch_create_supplier_payments` creates one Payment Entry per selected
# Purchase Invoice, paying the full outstanding amount from a shared
# `paid_from` account in a single submit. Inherits the entire
# `create_supplier_payment` path — allocation validation, account-type
# check, supplier-party-account resolution, idempotency, audit JSON
# append, and submit + post-submit notifications.
#
# Why is this the right shape for "bulk pay"?
#   - Each Payment Entry is bound to ONE supplier. Mixed-supplier
#     selections naturally land as N separate PEs, each correctly
#     attributed.
#   - Partial payments would need a per-row amount picker in the UI —
#     deferred. The dominant workflow ("clear all my open invoices for
#     today") is fully covered by "pay full outstanding per row".
#   - Idempotency: a single client-supplied `batch_idempotency_key` is
#     combined with each invoice name to derive the per-row key, so a
#     network retry doesn't create duplicate PEs.
#
# Branch scoping: no Purchase Invoice permission_query_conditions are
# installed (accountants legitimately see all branches). The role gate
# `assert_may_record_supplier_payment` is what enforces who may act;
# the per-row `has_permission("Purchase Invoice", "read")` check rejects
# any stale or otherwise-blocked invoice cleanly.


def _batch_payment_row(
	item,
	index,
	*,
	paid_from: str,
	posting_date: str | None,
	reference_no: str | None,
	mode_of_payment: str | None,
	remarks: str | None,
	company: str | None,
	batch_idempotency_key: str | None,
):
	"""Per-row callback used by batch_create_supplier_payments.

	`item` may be a bare invoice-name string OR a dict
	``{name, amount?}``. When `amount` is given it allocates exactly
	that — useful for partial-pay flows once the UI surfaces them.
	When omitted the row pays the full current outstanding amount.
	"""
	if isinstance(item, str):
		invoice_name = item
		amount = None
	elif isinstance(item, dict):
		invoice_name = item.get("name") or item.get("invoice")
		amount = item.get("amount")
	else:
		frappe.throw(_("Invalid batch item shape."), frappe.ValidationError)

	if not invoice_name:
		frappe.throw(_("Missing invoice name."), frappe.ValidationError)

	# DocPerm-level scope guard — surfaces stale / blocked invoices as
	# clean per-row failures instead of leaking through to the mutating
	# call.
	if not frappe.has_permission("Purchase Invoice", "read", doc=invoice_name):
		frappe.throw(
			_("Invoice {0} is not in your scope.").format(invoice_name),
			frappe.PermissionError,
		)

	inv = frappe.db.get_value(
		"Purchase Invoice",
		invoice_name,
		["supplier", "company", "outstanding_amount", "docstatus"],
		as_dict=True,
	)
	if not inv:
		frappe.throw(_("Invoice {0} not found.").format(invoice_name), frappe.DoesNotExistError)
	if int(inv.docstatus or 0) != 1:
		frappe.throw(
			_("Invoice {0} is not submitted — cannot pay against an unsubmitted invoice.").format(invoice_name),
			frappe.ValidationError,
		)
	outstanding = flt(inv.outstanding_amount)
	if outstanding <= 0:
		frappe.throw(
			_("Invoice {0} has no outstanding balance.").format(invoice_name),
			frappe.ValidationError,
		)

	pay_amount = flt(amount) if amount is not None else outstanding
	if pay_amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero."), frappe.ValidationError)
	if pay_amount > outstanding + 0.005:  # half-cent tolerance for fp
		frappe.throw(
			_("Allocation {0} exceeds outstanding {1} on {2}.").format(
				pay_amount, outstanding, invoice_name,
			),
			frappe.ValidationError,
		)

	# Derive a stable per-row idempotency key so a retried batch
	# request doesn't double-create PEs.
	row_idempotency = None
	if batch_idempotency_key:
		row_idempotency = f"{batch_idempotency_key}:{invoice_name}"

	result = create_supplier_payment(
		supplier=inv.supplier,
		company=company or inv.company,
		paid_from=paid_from,
		posting_date=posting_date,
		reference_no=reference_no,
		remarks=remarks,
		allocations=[{"invoice": invoice_name, "amount": pay_amount}],
		submit=1,
		idempotency_key=row_idempotency,
		mode_of_payment=mode_of_payment,
	)
	return {
		"name": result.get("name"),
		"invoice": invoice_name,
		"supplier": inv.supplier,
		"paid_amount": flt(result.get("paid_amount") or pay_amount),
		"docstatus": result.get("docstatus"),
		"idempotent_replay": bool(result.get("idempotent_replay")),
	}


@frappe.whitelist(methods=["POST"])
def batch_create_supplier_payments(
	items=None,
	paid_from: str = "",
	posting_date: str | None = None,
	reference_no: str | None = None,
	mode_of_payment: str | None = None,
	remarks: str | None = None,
	company: str | None = None,
	batch_idempotency_key: str | None = None,
):
	"""Create N Payment Entries against N Purchase Invoices in one call.

	Parameters
	----------
	items : list
	    Either a list of Purchase Invoice names (strings) or a list of
	    ``{name, amount?}`` dicts. JSON-deserialized by Frappe when posted
	    as the request body.
	paid_from : str
	    Account name (Bank or Cash) to pay from. Shared across every row.
	posting_date : str, optional
	    Defaults to today on the single-doc path.
	reference_no, mode_of_payment, remarks : str, optional
	    Applied uniformly to every row.
	company : str, optional
	    Overrides the per-invoice company resolution; leave empty in
	    multi-company sites so each PE inherits its invoice's company.
	batch_idempotency_key : str, optional
	    Client-supplied UUID. Combined with each invoice name to derive
	    per-row idempotency keys so a retried request never duplicates.

	Returns the standard `run_row_batch` envelope.

	Caller must hold `can_manage_supplier_payments` (Accountant + Admin).
	"""
	_require_payment_create()
	if not paid_from:
		frappe.throw(_("Payment account (cash/bank) is required."), frappe.ValidationError)

	from elmahdi.api._batch import run_row_batch

	if isinstance(items, str):
		import json as _json
		try:
			items = _json.loads(items)
		except ValueError:
			items = []

	# Front-load the paid_from account validation. Doing it here once is
	# cheaper than failing it on every row, and the failure shape
	# (envelope-level error) is more honest than "all rows failed with
	# the same message".
	if not frappe.db.exists("Account", paid_from):
		frappe.throw(_("Payment account {0} not found.").format(paid_from), frappe.DoesNotExistError)

	return run_row_batch(
		items or [],
		lambda item, idx: _batch_payment_row(
			item, idx,
			paid_from=paid_from,
			posting_date=posting_date,
			reference_no=reference_no,
			mode_of_payment=mode_of_payment,
			remarks=remarks,
			company=company,
			batch_idempotency_key=batch_idempotency_key,
		),
		action="payment.batch_create_supplier_payments",
		doctype="Payment Entry",
		summary_extra={
			"paid_from": paid_from,
			"posting_date": posting_date or "",
			"mode_of_payment": mode_of_payment or "",
			"reference_no": reference_no or "",
		},
	)


def enrich_invoice_ap_lifecycle(invoice_name: str) -> dict:
	"""Payment lifecycle for invoice matching UI."""
	if not frappe.db.exists("Purchase Invoice", invoice_name):
		return {}
	inv = frappe.db.get_value(
		"Purchase Invoice",
		invoice_name,
		["name", "docstatus", "grand_total", "outstanding_amount", "due_date", "status"],
		as_dict=True,
	)
	ps = _invoice_payment_status(inv)
	return {
		"name": invoice_name,
		"payment_status": ps,
		"outstanding_amount": flt(inv.outstanding_amount),
		"paid_pct": _paid_pct(inv),
		"grand_total": flt(inv.grand_total),
	}


# ── Scheduler: daily overdue notifications ─────────────────────────────────
#
# Sends one Notification Log per accountant per *newly* overdue invoice. We
# avoid spamming by storing the last-notified date on the PI's audit field
# (or by checking for an existing Notification Log row issued today for the
# same invoice). Best-effort — exceptions are logged, never raised, so the
# scheduler keeps running.


def _already_notified_today(invoice_name: str) -> bool:
	"""True if any Accountant already has a Notification Log row from today
	for this Purchase Invoice (avoids re-notifying every cron tick)."""
	return bool(
		frappe.db.sql(
			"""
			SELECT 1
			FROM `tabNotification Log`
			WHERE document_type = 'Purchase Invoice'
				AND document_name = %s
				AND DATE(creation) = CURDATE()
			LIMIT 1
			""",
			invoice_name,
		)
	)


def scan_and_notify_overdue_invoices() -> dict:
	"""Scheduled daily hook. Finds open invoices past due and sends one
	notification per invoice per day. Idempotent within the same day.
	Returns a small summary dict for observability.
	"""
	from elmahdi.api.notifications import notify_invoice_overdue

	today_d = getdate(today())
	rows = frappe.get_all(
		"Purchase Invoice",
		filters=[
			["docstatus", "=", 1],
			["outstanding_amount", ">", 0],
			["due_date", "<", str(today_d)],
		],
		fields=["name", "supplier", "due_date", "outstanding_amount"],
		limit_page_length=500,
	)
	notified = 0
	skipped = 0
	for r in rows:
		if _already_notified_today(r.name):
			skipped += 1
			continue
		days = (today_d - getdate(r.due_date)).days
		try:
			notify_invoice_overdue(
				invoice_name=r.name,
				supplier=r.supplier,
				outstanding=flt(r.outstanding_amount),
				days_overdue=int(days),
			)
			notified += 1
		except Exception:
			frappe.log_error(
				title=f"overdue notification failed for {r.name}",
				message=frappe.get_traceback(),
			)
	return {"scanned": len(rows), "notified": notified, "skipped_today": skipped}


# ── New endpoints for the production AP workspace ─────────────────────────


@frappe.whitelist()
def get_general_ledger(
	from_date=None,
	to_date=None,
	account=None,
	branch=None,
	company=None,
	limit=500,
):
	"""General Ledger feed — straight from ERPNext GL Entry.

	Returns a list of postings within the date range with a running balance
	per ordering (date, creation). Designed for the Finance ▸ General Ledger
	page; the SPA can render directly without per-row backend calls.

	Filters:
	  • from_date / to_date — inclusive
	  • account — name of an Account (any leaf)
	  • branch — set_warehouse equivalence; we filter via the GL Entry's
	    `cost_center` field which is ERPNext's canonical branch dimension
	"""
	_require_ap_read()
	company = company or _default_company()
	from_date = from_date or add_days(today(), -30)
	to_date = to_date or today()

	where = ["gle.is_cancelled = 0", "gle.docstatus = 1"]
	params = []
	if company:
		where.append("gle.company = %s")
		params.append(company)
	if account:
		where.append("gle.account = %s")
		params.append(account)
	if branch:
		# Branch maps to cost_center in ERPNext.
		where.append("gle.cost_center = %s")
		params.append(branch)
	where.append("gle.posting_date >= %s")
	params.append(str(from_date))
	where.append("gle.posting_date <= %s")
	params.append(str(to_date))
	params.append(int(limit or 500))

	rows = frappe.db.sql(
		f"""
		SELECT
			gle.name,
			gle.posting_date,
			gle.voucher_type,
			gle.voucher_no,
			gle.account,
			gle.against,
			gle.debit,
			gle.credit,
			gle.cost_center,
			gle.party_type,
			gle.party,
			gle.remarks
		FROM `tabGL Entry` gle
		WHERE {' AND '.join(where)}
		ORDER BY gle.posting_date ASC, gle.creation ASC
		LIMIT %s
		""",
		params,
		as_dict=True,
	)

	# Compute running balance — debit minus credit, ordered as fetched.
	balance = 0.0
	out = []
	totals = {"debit": 0.0, "credit": 0.0}
	for r in rows:
		debit = flt(r.debit)
		credit = flt(r.credit)
		balance += debit - credit
		totals["debit"] += debit
		totals["credit"] += credit
		out.append({
			"name": r.name,
			"posting_date": str(r.posting_date) if r.posting_date else "",
			"voucher_type": r.voucher_type,
			"voucher_no": r.voucher_no,
			"account": r.account,
			"against": r.against or "",
			"debit": round(debit, 2),
			"credit": round(credit, 2),
			"balance": round(balance, 2),
			"branch": r.cost_center or "",
			"party_type": r.party_type or "",
			"party": r.party or "",
			"remarks": (r.remarks or "")[:120],
		})
	return {
		"rows": out,
		"totals": {
			"debit": round(totals["debit"], 2),
			"credit": round(totals["credit"], 2),
			"closing_balance": round(balance, 2),
		},
		"filters": {
			"from_date": str(from_date),
			"to_date": str(to_date),
			"account": account,
			"branch": branch,
		},
	}


@frappe.whitelist()
def get_ap_aging_by_supplier(company=None, supplier=None):
	"""AP Aging — per-supplier bucket breakdown for the dedicated report page.

	Each supplier row has: current / 1-30 / 31-60 / 61-90 / 90+ / total.
	"""
	_require_ap_read()
	company = company or _default_company()
	invoices = _fetch_invoices(company=company, supplier=supplier, limit=2000)
	supplier_buckets: dict[str, dict] = {}
	today_d = getdate(today())
	for inv in invoices:
		out = flt(inv.get("outstanding_amount"))
		if out <= 0:
			continue
		key = inv["supplier"]
		row = supplier_buckets.setdefault(key, {
			"supplier": key,
			"supplier_name": inv.get("supplier_name") or key,
			"current": 0.0,
			"days_1_30": 0.0,
			"days_31_60": 0.0,
			"days_61_90": 0.0,
			"days_90_plus": 0.0,
			"total": 0.0,
			"invoice_count": 0,
		})
		row["total"] += out
		row["invoice_count"] += 1
		due = inv.get("due_date")
		if not due or getdate(due) >= today_d:
			row["current"] += out
			continue
		days = (today_d - getdate(due)).days
		if days <= 30:
			row["days_1_30"] += out
		elif days <= 60:
			row["days_31_60"] += out
		elif days <= 90:
			row["days_61_90"] += out
		else:
			row["days_90_plus"] += out

	rows = sorted(supplier_buckets.values(), key=lambda r: -r["total"])
	for r in rows:
		for k in ("current", "days_1_30", "days_31_60", "days_61_90", "days_90_plus", "total"):
			r[k] = round(r[k], 2)

	# Footer totals
	totals = {"current": 0.0, "days_1_30": 0.0, "days_31_60": 0.0, "days_61_90": 0.0, "days_90_plus": 0.0, "total": 0.0}
	for r in rows:
		for k in totals:
			totals[k] += r[k]
	for k in totals:
		totals[k] = round(totals[k], 2)
	return {"rows": rows, "totals": totals, "as_of": str(today_d)}


@frappe.whitelist()
def get_top_suppliers_report(company=None, from_date=None, to_date=None, limit=50):
	"""Top suppliers by total purchase amount in the period, plus their
	outstanding balance + invoice count + last purchase date."""
	_require_ap_read()
	company = company or _default_company()
	from_date = from_date or add_days(today(), -180)
	to_date = to_date or today()

	# Sum grand totals across all submitted PIs in the period.
	rows = frappe.db.sql(
		"""
		SELECT
			pi.supplier,
			pi.supplier_name,
			SUM(pi.grand_total)        AS purchase_amount,
			SUM(pi.outstanding_amount) AS outstanding,
			COUNT(*)                   AS invoice_count,
			MAX(pi.posting_date)       AS last_purchase_date
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1
			AND (%s IS NULL OR pi.company = %s)
			AND pi.posting_date BETWEEN %s AND %s
		GROUP BY pi.supplier, pi.supplier_name
		ORDER BY purchase_amount DESC
		LIMIT %s
		""",
		(company, company, str(from_date), str(to_date), int(limit or 50)),
		as_dict=True,
	)
	out = []
	for r in rows:
		out.append({
			"supplier": r.supplier,
			"supplier_name": r.supplier_name or r.supplier,
			"purchase_amount": round(flt(r.purchase_amount), 2),
			"outstanding": round(flt(r.outstanding), 2),
			"invoice_count": int(r.invoice_count or 0),
			"last_purchase_date": str(r.last_purchase_date) if r.last_purchase_date else "",
		})
	return {"rows": out, "from_date": str(from_date), "to_date": str(to_date)}


@frappe.whitelist()
def get_payment_voucher_detail(payment_entry_name):
	"""Voucher-shaped view of a submitted Payment Entry for printing.

	Bundles the Payment Entry header + party (supplier) info + the linked
	Purchase Invoices so the SPA can render a single printable voucher.
	"""
	_require_payment_read()
	if not frappe.db.exists("Payment Entry", payment_entry_name):
		frappe.throw(_("Payment Entry {0} not found.").format(payment_entry_name), frappe.DoesNotExistError)
	pe = frappe.get_doc("Payment Entry", payment_entry_name)
	supplier_name = ""
	if pe.party_type == "Supplier" and pe.party:
		supplier_name = frappe.db.get_value("Supplier", pe.party, "supplier_name") or pe.party

	references = []
	for ref in (pe.references or []):
		references.append({
			"reference_doctype": ref.reference_doctype,
			"reference_name": ref.reference_name,
			"allocated_amount": flt(ref.allocated_amount),
			"outstanding_amount": flt(getattr(ref, "outstanding_amount", 0)),
			"total_amount": flt(getattr(ref, "total_amount", 0)),
		})

	return {
		"name": pe.name,
		"docstatus": pe.docstatus,
		"posting_date": str(pe.posting_date) if pe.posting_date else "",
		"company": pe.company,
		"supplier": pe.party,
		"supplier_name": supplier_name,
		"payment_type": pe.payment_type,
		"mode_of_payment": pe.mode_of_payment or "",
		"paid_amount": flt(pe.paid_amount),
		"paid_from": pe.paid_from,
		"paid_to": pe.paid_to,
		"reference_no": pe.reference_no or "",
		"reference_date": str(pe.reference_date) if pe.reference_date else "",
		"remarks": pe.remarks or "",
		"created_by": pe.owner,
		"creation": str(pe.creation) if pe.creation else "",
		"references": references,
	}


@frappe.whitelist()
def list_modes_of_payment():
	"""Whitelisted list of Modes of Payment for the supplier payment form."""
	_require_payment_read()
	rows = frappe.get_all(
		"Mode of Payment",
		filters={"enabled": 1},
		fields=["name", "type"],
		order_by="name asc",
	)
	return [{"name": r.name, "type": r.type or ""} for r in rows]

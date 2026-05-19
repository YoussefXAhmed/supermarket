"""
Accounts Payable — supplier payments via ERPNext Payment Entry (authoritative accounting).
"""

from __future__ import annotations

import json
from datetime import date, datetime

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, today

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
	frappe.has_permission("Purchase Invoice", "read", throw=True)


def _require_payment_create():
	frappe.has_permission("Payment Entry", "create", throw=True)


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


def _base_invoice_filters(company=None, supplier=None):
	filters = [["docstatus", "=", 1]]
	if company:
		filters.append(["company", "=", company])
	if supplier:
		filters.append(["supplier", "=", supplier])
	return filters


def _fetch_invoices(company=None, supplier=None, status=None, limit=200):
	filters = _base_invoice_filters(company, supplier)
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
		],
		order_by="due_date asc, posting_date desc",
		limit_page_length=int(limit or 200),
	)
	out = []
	for row in rows:
		ps = _invoice_payment_status(row)
		if status and status != "all" and ps != status:
			continue
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

	return {
		"company": company,
		"counts": {
			"unpaid": len(unpaid),
			"partially_paid": len(partial),
			"paid": len(paid),
			"overdue": len(overdue),
			"total_invoices": len(invoices),
		},
		"amounts": {
			"total_outstanding": total_outstanding,
			"overdue_amount": overdue_amount,
		},
		"aging": _aging_buckets(invoices),
		"top_suppliers": suppliers,
	}


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
	rows = _fetch_invoices(company=company, supplier=supplier, status=None if status == "all" else status, limit=limit)
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
	row = {
		"name": inv.name,
		"supplier": inv.supplier,
		"supplier_name": inv.supplier_name,
		"company": inv.company,
		"posting_date": str(inv.posting_date),
		"due_date": str(inv.due_date) if inv.due_date else "",
		"bill_no": inv.bill_no,
		"grand_total": flt(inv.grand_total),
		"outstanding_amount": flt(inv.outstanding_amount),
		"paid_amount": round(flt(inv.grand_total) - flt(inv.outstanding_amount), 2),
		"docstatus": inv.docstatus,
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

	return {
		"supplier": supplier,
		"company": company,
		"outstanding": outstanding,
		"overdue_amount": overdue,
		"invoice_count": len(invoices),
		"open_invoice_count": len([i for i in invoices if flt(i["outstanding_amount"]) > 0]),
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
	frappe.has_permission("Payment Entry", "read", throw=True)
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


@frappe.whitelist()
def create_supplier_payment(
	supplier,
	company=None,
	paid_from=None,
	posting_date=None,
	reference_no=None,
	remarks=None,
	allocations=None,
	submit=1,
):
	"""
	Create ERPNext Payment Entry (Pay) against Purchase Invoice(s) and submit.
	allocations: JSON list of {invoice, amount}
	"""
	_require_payment_create()
	company = company or _default_company()
	if not supplier:
		frappe.throw(_("Supplier is required."), frappe.ValidationError)
	if not paid_from:
		frappe.throw(_("Payment account (cash/bank) is required."), frappe.ValidationError)

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
	if remarks:
		pe.remarks = remarks

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
		frappe.has_permission("Payment Entry", "submit", doc=pe, throw=True)
		pe.submit()
		submitted = True
		_append_pe_audit(pe.name, {"action": "submitted", "paid_amount": total_paid})

	frappe.db.commit()

	pe.reload()
	return {
		"name": pe.name,
		"docstatus": pe.docstatus,
		"submitted": submitted,
		"paid_amount": flt(pe.paid_amount),
		"party": pe.party,
		"posting_date": str(pe.posting_date),
		"references": [
			{
				"invoice": r.reference_name,
				"allocated_amount": flt(r.allocated_amount),
			}
			for r in (pe.references or [])
		],
	}


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

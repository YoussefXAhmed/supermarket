"""
Purchase Receipt ↔ Purchase Invoice line-level matching.
ERPNext remains source of truth; all validation runs server-side.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

# Billing statuses returned to SPA (display mapping lives in frontend billingStatus.js)
BILLING_UNBILLED = "unbilled"
BILLING_PARTIALLY_BILLED = "partially_billed"
BILLING_FULLY_BILLED = "fully_billed"
BILLING_OVERBILLED = "overbilled"
BILLING_VARIANCE_DETECTED = "variance_detected"

RATE_EPSILON = 0.01
QTY_EPSILON = 0.0001
FULLY_BILLED_PCT = 99.99
OVERBILLED_PCT = 100.01


def _has_pr_field(fieldname: str) -> bool:
	return frappe.db.has_column("Purchase Receipt", fieldname)


def _parse_matching_audit(doc) -> dict:
	raw = ""
	if _has_pr_field("invoice_matching_audit") and doc.get("invoice_matching_audit"):
		raw = doc.invoice_matching_audit
	if not raw:
		return {"events": []}
	try:
		data = json.loads(raw)
		if isinstance(data, list):
			return {"events": data}
		return data if isinstance(data, dict) else {"events": []}
	except Exception:
		return {"events": []}


def _append_matching_audit(receipt_name: str, event: dict) -> None:
	if not _has_pr_field("invoice_matching_audit"):
		return
	doc = frappe.get_doc("Purchase Receipt", receipt_name)
	audit = _parse_matching_audit(doc)
	events = audit.get("events") or []
	events.append(
		{
			**event,
			"user": frappe.session.user,
			"at": now_datetime().isoformat(),
		}
	)
	audit["events"] = events[-100:]
	frappe.db.set_value(
		"Purchase Receipt",
		receipt_name,
		"invoice_matching_audit",
		json.dumps(audit, default=str),
		update_modified=False,
	)


def _line_billed_map(receipt_name: str) -> dict[str, dict]:
	"""Sum billed qty/amount per PR line from non-cancelled purchase invoices."""
	rows = frappe.db.sql(
		"""
		SELECT
			pii.pr_detail,
			pii.parent AS invoice,
			pii.item_code,
			SUM(pii.qty) AS billed_qty,
			SUM(pii.amount) AS billed_amount,
			AVG(pii.rate) AS avg_rate
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pii.purchase_receipt = %s
			AND pi.docstatus != 2
			AND IFNULL(pii.pr_detail, '') != ''
		GROUP BY pii.pr_detail, pii.parent, pii.item_code
		""",
		receipt_name,
		as_dict=True,
	)
	by_detail: dict[str, dict] = {}
	for row in rows:
		detail = row.pr_detail
		if not detail:
			continue
		entry = by_detail.setdefault(
			detail,
			{
				"billed_qty": 0.0,
				"billed_amount": 0.0,
				"links": [],
				"rates": [],
			},
		)
		qty = flt(row.billed_qty)
		amt = flt(row.billed_amount)
		entry["billed_qty"] += qty
		entry["billed_amount"] += amt
		entry["rates"].append(flt(row.avg_rate))
		entry["links"].append(
			{
				"invoice": row.invoice,
				"qty": qty,
				"amount": amt,
				"rate": flt(row.avg_rate),
			}
		)
	return by_detail


def _receipt_line_rows(pr_doc) -> list[dict]:
	lines = []
	for row in pr_doc.items or []:
		qty = flt(row.qty)
		rate = flt(row.rate)
		lines.append(
			{
				"name": row.name,
				"item_code": row.item_code,
				"qty": qty,
				"rate": rate,
				"amount": flt(row.amount) or round(qty * rate, 2),
				"warehouse": row.warehouse or pr_doc.set_warehouse,
			}
		)
	return lines


def _line_has_rate_variance(pr_rate: float, billed_rates: list[float]) -> bool:
	if not billed_rates:
		return False
	pr_rate = flt(pr_rate)
	for r in billed_rates:
		if abs(flt(r) - pr_rate) > RATE_EPSILON:
			return True
	return False


def _compute_receipt_billing(pr_doc, billed_by_detail: dict[str, dict]) -> dict:
	lines_out = []
	total_amount = flt(pr_doc.grand_total)
	billed_amount = 0.0
	has_variance = False
	has_overbill_line = False

	for line in _receipt_line_rows(pr_doc):
		detail = line["name"]
		billed = billed_by_detail.get(detail, {})
		billed_qty = flt(billed.get("billed_qty"))
		billed_line_amount = flt(billed.get("billed_amount"))
		remaining_qty = max(0.0, flt(line["qty"]) - billed_qty)
		line_variance = _line_has_rate_variance(line["rate"], billed.get("rates") or [])
		if line_variance:
			has_variance = True
		if billed_qty > flt(line["qty"]) + QTY_EPSILON:
			has_overbill_line = True

		billed_amount += billed_line_amount if billed_line_amount else round(billed_qty * flt(line["rate"]), 2)

		lines_out.append(
			{
				**line,
				"billed_qty": round(billed_qty, 4),
				"remaining_qty": round(remaining_qty, 4),
				"billed_amount": round(billed_line_amount, 2),
				"remaining_amount": round(remaining_qty * flt(line["rate"]), 2),
				"linked_invoices": billed.get("links") or [],
				"variance": line_variance,
			}
		)

	per_billed = flt(pr_doc.per_billed)
	remaining_amount = max(0.0, total_amount - billed_amount)
	billed_pct = per_billed if per_billed else (
		(billed_amount / total_amount * 100) if total_amount > 0 else 0.0
	)

	status = resolve_billing_status(
		per_billed=per_billed,
		billed_amount=billed_amount,
		total_amount=total_amount,
		has_variance=has_variance,
		has_overbill_line=has_overbill_line,
	)

	return {
		"lines": lines_out,
		"grand_total": total_amount,
		"billed_amount": round(billed_amount, 2),
		"remaining_amount": round(remaining_amount, 2),
		"billed_pct": round(billed_pct, 2),
		"per_billed": per_billed,
		"billing_status": status,
		"has_variance": has_variance,
		"has_overbill": has_overbill_line or per_billed > OVERBILLED_PCT,
	}


def resolve_billing_status(
	*,
	per_billed: float,
	billed_amount: float,
	total_amount: float,
	has_variance: bool,
	has_overbill_line: bool,
) -> str:
	per_billed = flt(per_billed)
	if has_variance:
		return BILLING_VARIANCE_DETECTED
	if has_overbill_line or per_billed > OVERBILLED_PCT:
		return BILLING_OVERBILLED
	if per_billed >= FULLY_BILLED_PCT:
		return BILLING_FULLY_BILLED
	if per_billed > 0 or (total_amount > 0 and billed_amount > QTY_EPSILON):
		return BILLING_PARTIALLY_BILLED
	return BILLING_UNBILLED


def _linked_invoices_for_receipt(receipt_name: str) -> list[dict]:
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT
			pi.name,
			pi.posting_date,
			pi.grand_total,
			pi.outstanding_amount,
			pi.due_date,
			pi.docstatus,
			pi.company
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pii.purchase_receipt = %s AND pi.docstatus != 2
		ORDER BY pi.modified DESC
		""",
		receipt_name,
		as_dict=True,
	)
	out = []
	try:
		from elmahdi.api.accounts_payable import _invoice_payment_status, _paid_pct
	except ImportError:
		_invoice_payment_status = None
		_paid_pct = None

	for r in rows:
		row = {
			"name": r.name,
			"posting_date": str(r.posting_date),
			"grand_total": flt(r.grand_total),
			"outstanding_amount": flt(r.outstanding_amount),
			"docstatus": r.docstatus,
			"company": r.company,
			"due_date": str(r.due_date) if r.due_date else "",
		}
		if _invoice_payment_status:
			inv = {
				"docstatus": r.docstatus,
				"outstanding_amount": r.outstanding_amount,
				"grand_total": r.grand_total,
				"due_date": r.due_date,
			}
			row["payment_status"] = _invoice_payment_status(inv)
			row["paid_pct"] = _paid_pct(inv)
		out.append(row)
	return out


def _score_invoice_for_receipt(pi: dict, pr: dict) -> float:
	score = 0.0
	if pi.get("supplier") == pr.get("supplier"):
		score += 40.0
	if pi.get("company") == pr.get("company"):
		score += 20.0
	pr_total = flt(pr.get("grand_total"))
	pi_total = flt(pi.get("grand_total"))
	if pr_total > 0 and pi_total > 0:
		diff_pct = abs(pi_total - pr_total) / pr_total * 100
		if diff_pct <= 2:
			score += 25.0
		elif diff_pct <= 10:
			score += 15.0
		elif diff_pct <= 25:
			score += 5.0
	try:
		pr_date = pr.get("posting_date")
		pi_date = pi.get("posting_date")
		if pr_date and pi_date:
			if isinstance(pr_date, str):
				pr_date = datetime.strptime(pr_date[:10], "%Y-%m-%d").date()
			if isinstance(pi_date, str):
				pi_date = datetime.strptime(pi_date[:10], "%Y-%m-%d").date()
			days = abs((pr_date - pi_date).days)
			if days <= 7:
				score += 15.0
			elif days <= 30:
				score += 8.0
	except Exception:
		pass
	return round(score, 2)


def _validate_receipt_for_matching(receipt_name: str):
	frappe.has_permission("Purchase Receipt", "read", throw=True)
	if not frappe.db.exists("Purchase Receipt", receipt_name):
		frappe.throw(_("Purchase Receipt {0} not found.").format(receipt_name), frappe.DoesNotExistError)
	pr = frappe.get_doc("Purchase Receipt", receipt_name)
	if pr.docstatus != 1:
		frappe.throw(
			_("Purchase Receipt must be submitted before invoice matching."),
			frappe.ValidationError,
		)
	if pr.docstatus == 2:
		frappe.throw(_("Cancelled Purchase Receipt cannot be matched."), frappe.ValidationError)
	return pr


def _validate_invoice_for_matching(invoice_name: str, pr_doc):
	frappe.has_permission("Purchase Invoice", "read", throw=True)
	if not frappe.db.exists("Purchase Invoice", invoice_name):
		frappe.throw(_("Purchase Invoice {0} not found.").format(invoice_name), frappe.DoesNotExistError)
	pi = frappe.get_doc("Purchase Invoice", invoice_name)
	if pi.docstatus == 2:
		frappe.throw(_("Cancelled Purchase Invoice cannot be used."), frappe.ValidationError)
	if pi.docstatus != 0:
		frappe.throw(
			_("Only draft Purchase Invoices can be linked. Submit after matching is complete."),
			frappe.ValidationError,
		)
	if pr_doc.supplier and pi.supplier and pr_doc.supplier != pi.supplier:
		frappe.throw(_("Supplier must match between receipt and invoice."), frappe.ValidationError)
	if pr_doc.company and pi.company and pr_doc.company != pi.company:
		frappe.throw(_("Company must match between receipt and invoice."), frappe.ValidationError)
	return pi


def _build_receipt_workspace_row(pr_doc, limit_suggestions: int = 5) -> dict:
	billed_by_detail = _line_billed_map(pr_doc.name)
	billing = _compute_receipt_billing(pr_doc, billed_by_detail)
	linked = _linked_invoices_for_receipt(pr_doc.name)
	suggestions = _suggest_matches_for_receipt(pr_doc, limit=limit_suggestions)

	audit = _parse_matching_audit(pr_doc)
	events = audit.get("events") or []

	can_link = billing["billing_status"] not in (BILLING_FULLY_BILLED, BILLING_OVERBILLED) and any(
		ln["remaining_qty"] > QTY_EPSILON for ln in billing["lines"]
	)

	submitted_invoices = [i for i in linked if i.get("docstatus") == 1]
	primary_invoice = submitted_invoices[0] if submitted_invoices else None
	is_exceptional = bool(
		billing["has_variance"]
		or billing["billing_status"] in (BILLING_PARTIALLY_BILLED, BILLING_OVERBILLED)
	)
	can_retry_auto_invoice = bool(
		pr_doc.docstatus == 1
		and not primary_invoice
		and not is_exceptional
		and billing["billing_status"] not in (BILLING_FULLY_BILLED, BILLING_OVERBILLED)
	)
	auto_invoiced = bool(primary_invoice) and not is_exceptional

	ap_stage = "invoice_pending"
	if primary_invoice:
		pay = primary_invoice.get("payment_status") or ""
		if pay == "paid":
			ap_stage = "settled"
		elif pay == "partially_paid":
			ap_stage = "partially_paid"
		else:
			ap_stage = "payment_pending"
	elif not linked and pr_doc.docstatus == 1:
		ap_stage = "invoice_pending"

	lifecycle_hint = (
		"Approved — supplier payable is created automatically after manager approval."
		if ap_stage == "invoice_pending" and pr_doc.docstatus == 1
		else "Goods received — awaiting manager approval and automatic payable creation."
		if ap_stage == "invoice_pending"
		else "Supplier bill submitted — record payment in Finance → Supplier payments."
		if ap_stage == "payment_pending"
		else "Partial supplier payment recorded — remaining balance in Finance → Supplier payments."
		if ap_stage == "partially_paid"
		else "Receipt billed and supplier invoices paid."
	)

	can_create_pi = frappe.has_permission("Purchase Invoice", "create")
	has_draft_for_receipt = False
	draft_invoice_name = None
	can_create_invoice = (
		is_exceptional
		and can_link
		and can_create_pi
		and billing["billing_status"] not in (BILLING_FULLY_BILLED, BILLING_OVERBILLED)
	)
	can_link = bool(is_exceptional and can_link)

	return {
		"receipt": pr_doc.name,
		"supplier": pr_doc.supplier,
		"company": pr_doc.company,
		"posting_date": str(pr_doc.posting_date),
		"grand_total": billing["grand_total"],
		"billed_amount": billing["billed_amount"],
		"remaining_amount": billing["remaining_amount"],
		"billed_pct": billing["billed_pct"],
		"per_billed": billing["per_billed"],
		"billing_status": billing["billing_status"],
		"has_variance": billing["has_variance"],
		"lines": billing["lines"],
		"linked_invoices": linked,
		"purchase_invoices": [i["name"] for i in linked],
		"suggested_invoices": suggestions,
		"audit_events": events[-20:],
		"can_link": can_link,
		"can_create_invoice": can_create_invoice,
		"has_draft_invoice": has_draft_for_receipt,
		"draft_invoice": draft_invoice_name,
		"can_create_pi_permission": can_create_pi,
		"ap_stage": ap_stage,
		"lifecycle_hint": lifecycle_hint,
		"auto_invoiced": auto_invoiced,
		"show_manual_billing": is_exceptional,
		"can_retry_auto_invoice": can_retry_auto_invoice,
		"primary_invoice": primary_invoice.get("name") if primary_invoice else None,
		"primary_invoice_outstanding": flt(primary_invoice.get("outstanding_amount")) if primary_invoice else 0,
		"primary_invoice_payment_status": primary_invoice.get("payment_status") if primary_invoice else "",
	}


@frappe.whitelist()
def get_invoice_matching_workspace(limit=150):
	"""Line-level matching workspace for submitted purchase receipts."""
	frappe.has_permission("Purchase Receipt", "read", throw=True)
	limit = int(limit or 150)
	receipts = frappe.get_all(
		"Purchase Receipt",
		filters={"docstatus": 1},
		fields=["name"],
		order_by="posting_date desc",
		limit_page_length=limit,
	)
	out = []
	for row in receipts:
		pr = frappe.get_doc("Purchase Receipt", row.name)
		out.append(_build_receipt_workspace_row(pr))
	return out


@frappe.whitelist()
def get_invoice_matching_rows(limit=150):
	"""Backward-compatible summary rows (delegates to workspace engine)."""
	workspace = get_invoice_matching_workspace(limit=limit)
	out = []
	for row in workspace:
		linked = bool(row.get("linked_invoices"))
		out.append(
			{
				"receipt": row["receipt"],
				"supplier": row["supplier"],
				"company": row.get("company"),
				"posting_date": row["posting_date"],
				"grand_total": row["grand_total"],
				"per_billed": row["per_billed"],
				"billed_pct": row["billed_pct"],
				"billed_amount": row["billed_amount"],
				"remaining_amount": row["remaining_amount"],
				"billing_status": row["billing_status"],
				"purchase_invoices": row.get("purchase_invoices") or [],
				"purchase_invoice": (row.get("purchase_invoices") or [""])[0],
				"linked": linked,
				"has_variance": row.get("has_variance"),
				"can_link": row.get("can_link"),
			}
		)
	return out


@frappe.whitelist()
def list_matchable_draft_invoices(receipt_name, search=None, limit=25):
	"""Draft purchase invoices: same supplier + company as receipt."""
	pr = _validate_receipt_for_matching(receipt_name)
	limit = min(int(limit or 25), 50)
	search = (search or "").strip()

	filters = {
		"docstatus": 0,
		"supplier": pr.supplier,
		"company": pr.company,
	}
	rows = frappe.get_all(
		"Purchase Invoice",
		filters=filters,
		fields=["name", "supplier", "company", "posting_date", "grand_total", "currency"],
		order_by="modified desc",
		limit_page_length=limit * 3,
	)

	if search:
		rows = [r for r in rows if search.lower() in (r.name or "").lower()]

	already = {i["name"] for i in _linked_invoices_for_receipt(pr.name)}
	out = []
	for row in rows[:limit]:
		out.append(
			{
				"name": row.name,
				"supplier": row.supplier,
				"company": row.company,
				"posting_date": str(row.posting_date),
				"grand_total": flt(row.grand_total),
				"currency": row.currency,
				"already_linked": row.name in already,
				"match_score": _score_invoice_for_receipt(row, pr),
			}
		)
	out.sort(key=lambda x: (-x["match_score"], x["name"]))
	return out


def _suggest_matches_for_receipt(pr, limit=5):
	limit = min(int(limit or 5), 10)

	rows = frappe.get_all(
		"Purchase Invoice",
		filters={"docstatus": 0, "supplier": pr.supplier, "company": pr.company},
		fields=["name", "supplier", "company", "posting_date", "grand_total"],
		order_by="modified desc",
		limit_page_length=50,
	)
	pr_row = {
		"supplier": pr.supplier,
		"company": pr.company,
		"grand_total": flt(pr.grand_total),
		"posting_date": str(pr.posting_date),
	}
	scored = []
	for row in rows:
		score = _score_invoice_for_receipt(row, pr_row)
		if score < 20:
			continue
		scored.append(
			{
				"name": row.name,
				"posting_date": str(row.posting_date),
				"grand_total": flt(row.grand_total),
				"match_score": score,
			}
		)
	scored.sort(key=lambda x: (-x["match_score"], x["name"]))
	return scored[:limit]


@frappe.whitelist()
def suggest_invoice_matches(receipt_name, limit=5):
	"""Rank draft invoices by supplier, amount, and date proximity."""
	pr = _validate_receipt_for_matching(receipt_name)
	return _suggest_matches_for_receipt(pr, limit=limit)


@frappe.whitelist()
def link_receipt_to_invoice(receipt_name, invoice_name, lines=None):
	"""
	Link PR lines to a draft PI (line-level).
	lines: optional JSON list of {pr_detail, qty} for partial billing.
	"""
	pr = _validate_receipt_for_matching(receipt_name)
	pi = _validate_invoice_for_matching(invoice_name, pr)

	if isinstance(lines, str):
		lines = json.loads(lines) if lines else None

	billed_by_detail = _line_billed_map(pr.name)
	pr_lines = {ln["name"]: ln for ln in _receipt_line_rows(pr)}

	# Detect duplicate header link (all lines already on this invoice)
	existing_on_invoice = [
		row
		for row in (pi.items or [])
		if row.purchase_receipt == pr.name
	]
	if existing_on_invoice and not lines:
		frappe.throw(
			_("Purchase Receipt {0} is already linked to invoice {1}.").format(pr.name, invoice_name),
			frappe.ValidationError,
		)

	requested = {}
	if lines:
		for row in lines:
			detail = (row.get("pr_detail") or "").strip()
			qty = flt(row.get("qty"))
			if not detail:
				frappe.throw(_("Each line must include pr_detail."), frappe.ValidationError)
			if qty <= 0:
				frappe.throw(_("Line quantity must be greater than zero."), frappe.ValidationError)
			requested[detail] = requested.get(detail, 0.0) + qty
	else:
		for detail, pr_line in pr_lines.items():
			billed_qty = flt((billed_by_detail.get(detail) or {}).get("billed_qty"))
			remaining = flt(pr_line["qty"]) - billed_qty
			if remaining > QTY_EPSILON:
				requested[detail] = remaining

	if not requested:
		frappe.throw(_("No remaining quantity to bill on this receipt."), frappe.ValidationError)

	frappe.has_permission("Purchase Invoice", "write", doc=pi, throw=True)

	new_items = []
	link_audit_lines = []
	total_new_amount = 0.0

	for detail, qty in requested.items():
		if detail not in pr_lines:
			frappe.throw(_("Invalid receipt line {0}.").format(detail), frappe.ValidationError)
		pr_line = pr_lines[detail]
		billed_qty = flt((billed_by_detail.get(detail) or {}).get("billed_qty"))
		remaining = flt(pr_line["qty"]) - billed_qty
		if qty > remaining + QTY_EPSILON:
			frappe.throw(
				_("Cannot bill {0} of {1} for {2}: only {3} remaining.").format(
					qty, pr_line["item_code"], detail, remaining
				),
				frappe.ValidationError,
			)

		# Duplicate line on same invoice
		for existing in pi.items or []:
			if existing.purchase_receipt == pr.name and existing.pr_detail == detail:
				frappe.throw(
					_("Line {0} is already linked on invoice {1}.").format(detail, invoice_name),
					frappe.ValidationError,
				)

		rate = flt(pr_line["rate"])
		amount = round(qty * rate, 2)
		total_new_amount += amount
		new_items.append(
			{
				"item_code": pr_line["item_code"],
				"qty": qty,
				"rate": rate,
				"warehouse": pr_line.get("warehouse"),
				"purchase_receipt": pr.name,
				"pr_detail": detail,
			}
		)
		link_audit_lines.append(
			{
				"pr_detail": detail,
				"item_code": pr_line["item_code"],
				"qty": qty,
				"rate": rate,
				"amount": amount,
			}
		)

	# Overbilling guard (receipt total)
	billing_before = _compute_receipt_billing(pr, billed_by_detail)
	projected_billed = flt(billing_before["billed_amount"]) + total_new_amount
	if projected_billed > flt(pr.grand_total) + RATE_EPSILON:
		frappe.throw(
			_("Linking would overbill this receipt (projected {0} vs receipt total {1}).").format(
				projected_billed, pr.grand_total
			),
			frappe.ValidationError,
		)

	for item in new_items:
		pi.append("items", item)

	pi.save()

	_append_matching_audit(
		pr.name,
		{
			"action": "link",
			"invoice": invoice_name,
			"lines": link_audit_lines,
			"projected_billed": projected_billed,
		},
	)

	frappe.db.commit()

	# Refresh PR per_billed from ERP
	pr.reload()
	workspace = _build_receipt_workspace_row(pr)

	return {
		"receipt": pr.name,
		"invoice": invoice_name,
		"linked_lines": link_audit_lines,
		"workspace": workspace,
	}


@frappe.whitelist()
def get_receipt_matching_detail(receipt_name):
	"""Single receipt workspace row (after link or for expand)."""
	pr = _validate_receipt_for_matching(receipt_name)
	return _build_receipt_workspace_row(pr)


def _draft_invoice_name_for_receipt(receipt_name: str) -> Optional[str]:
	row = frappe.db.sql(
		"""
		SELECT DISTINCT pi.name
		FROM `tabPurchase Invoice` pi
		INNER JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
		WHERE pii.purchase_receipt = %s AND pi.docstatus = 0
		ORDER BY pi.modified DESC
		LIMIT 1
		""",
		receipt_name,
	)
	return row[0][0] if row else None


def _receipt_action_state(workspace: dict) -> str:
	stage = workspace.get("ap_stage")
	if stage == "settled":
		return "settled"
	if stage == "partially_paid":
		return "partially_paid"
	if stage == "payment_pending":
		return "payment_pending"
	if workspace.get("billing_status") in (BILLING_FULLY_BILLED, BILLING_OVERBILLED):
		return "fully_billed"
	if workspace.get("show_manual_billing") and workspace.get("can_create_invoice"):
		return "exceptional"
	if workspace.get("show_manual_billing"):
		return "exceptional_review"
	return "invoice_pending"


def _submitted_invoice_name_for_receipt(receipt_name: str) -> Optional[str]:
	row = frappe.db.sql(
		"""
		SELECT DISTINCT pi.name
		FROM `tabPurchase Invoice` pi
		INNER JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name
		WHERE pii.purchase_receipt = %s AND pi.docstatus = 1
		ORDER BY pi.modified DESC
		LIMIT 1
		""",
		receipt_name,
	)
	return row[0][0] if row else None


def auto_create_and_submit_purchase_invoice_for_receipt(
	receipt_name: str,
	*,
	ignore_permissions: bool = False,
) -> dict:
	"""
	Post-approval payable creation: ERPNext make_purchase_invoice → insert → submit.
	Idempotent when a submitted PI already exists for this receipt.
	"""
	if not frappe.db.exists("Purchase Receipt", receipt_name):
		frappe.throw(_("Purchase Receipt {0} not found.").format(receipt_name), frappe.DoesNotExistError)

	pr = frappe.get_doc("Purchase Receipt", receipt_name)
	if pr.docstatus != 1:
		return {"skipped": True, "reason": "receipt_not_submitted", "receipt": receipt_name}

	existing = _submitted_invoice_name_for_receipt(receipt_name)
	if existing:
		pi = frappe.get_doc("Purchase Invoice", existing)
		return {
			"skipped": True,
			"reason": "already_invoiced",
			"name": existing,
			"docstatus": pi.docstatus,
			"outstanding_amount": flt(pi.outstanding_amount),
			"receipt": receipt_name,
		}

	prev_ignore = frappe.flags.ignore_permissions
	if ignore_permissions:
		frappe.flags.ignore_permissions = True

	try:
		draft_name = _draft_invoice_name_for_receipt(receipt_name)
		if draft_name:
			frappe.delete_doc("Purchase Invoice", draft_name, force=1)

		pi = _make_pi_from_receipt(receipt_name)
		pi.insert()
		invoice_name = pi.name
		_append_matching_audit(
			receipt_name,
			{
				"action": "invoice_auto_created",
				"invoice": invoice_name,
				"from_receipt": receipt_name,
			},
		)
		from elmahdi.api.erp_submit import assert_submitted_side_effects

		pi.submit()
		pi.reload()
		assert_submitted_side_effects(pi)
		_append_matching_audit(
			receipt_name,
			{"action": "invoice_auto_submitted", "invoice": invoice_name},
		)

		frappe.db.commit()
		pi.reload()
		pr.reload()
		workspace = _build_receipt_workspace_row(pr)

		return {
			"skipped": False,
			"name": invoice_name,
			"submitted": True,
			"docstatus": pi.docstatus,
			"grand_total": flt(pi.grand_total),
			"outstanding_amount": flt(pi.outstanding_amount),
			"billed_pct": workspace.get("billed_pct"),
			"per_billed": workspace.get("per_billed"),
			"receipt": receipt_name,
			"workspace": workspace,
			"message": _("Purchase Invoice {0} created and submitted.").format(invoice_name),
		}
	except frappe.ValidationError:
		raise
	except Exception as exc:
		frappe.log_error(message=frappe.get_traceback(), title="auto_create_and_submit_purchase_invoice")
		frappe.throw(
			_("Could not create payable from receipt: {0}").format(str(exc)[:200]),
			frappe.ValidationError,
		)
	finally:
		frappe.flags.ignore_permissions = prev_ignore


def _serialize_receipt_for_billing(pr_doc) -> dict:
	"""Row shape for Purchase Invoices → From receipt tab."""
	ws = _build_receipt_workspace_row(pr_doc, limit_suggestions=0)
	action_state = _receipt_action_state(ws)
	return {
		"receipt": ws["receipt"],
		"supplier": ws["supplier"],
		"company": ws["company"],
		"posting_date": ws["posting_date"],
		"grand_total": ws["grand_total"],
		"billed_amount": ws["billed_amount"],
		"remaining_amount": ws["remaining_amount"],
		"billed_pct": ws["billed_pct"],
		"per_billed": ws["per_billed"],
		"billing_status": ws["billing_status"],
		"can_create_invoice": action_state == "exceptional",
		"has_draft_invoice": False,
		"draft_invoice": None,
		"action_state": action_state,
		"action_label": {
			"payment_pending": _("Pending payment"),
			"partially_paid": _("Partially paid"),
			"settled": _("Settled"),
			"fully_billed": _("Fully billed"),
			"exceptional": _("Manual billing required"),
			"exceptional_review": _("Exception — review billing"),
			"invoice_pending": _("Awaiting payable"),
		}.get(action_state, action_state),
		"auto_invoiced": ws.get("auto_invoiced"),
		"show_manual_billing": ws.get("show_manual_billing"),
		"primary_invoice": ws.get("primary_invoice"),
		"primary_invoice_outstanding": ws.get("primary_invoice_outstanding"),
	}


def _make_pi_from_receipt(receipt_name: str):
	"""ERPNext official mapper — buying module path (stock path is legacy alias)."""
	last_error = None
	for import_path in (
		"erpnext.buying.doctype.purchase_receipt.purchase_receipt",
		"erpnext.stock.doctype.purchase_receipt.purchase_receipt",
	):
		try:
			module = frappe.get_module(import_path)
			make_fn = getattr(module, "make_purchase_invoice", None)
			if make_fn:
				return make_fn(receipt_name)
		except Exception as exc:
			last_error = exc
	frappe.throw(
		_("Could not load ERPNext purchase invoice mapper: {0}").format(last_error or "unknown"),
		frappe.ValidationError,
	)


@frappe.whitelist()
def get_receipts_ready_for_billing(company=None, supplier=None, limit=50):
	"""Submitted purchase receipts with billing eligibility for the From receipt tab."""
	frappe.has_permission("Purchase Receipt", "read", throw=True)
	limit = int(limit or 50)
	company = company or frappe.defaults.get_user_default("Company")
	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if supplier:
		filters["supplier"] = supplier

	receipts = frappe.get_all(
		"Purchase Receipt",
		filters=filters,
		fields=["name"],
		order_by="posting_date desc",
		limit_page_length=limit,
	)
	rows = [
		_serialize_receipt_for_billing(frappe.get_doc("Purchase Receipt", row.name))
		for row in receipts
	]
	return [r for r in rows if r.get("show_manual_billing")]


@frappe.whitelist()
def list_receipts_pending_invoice(company=None, supplier=None, limit=50):
	"""Backward-compatible alias for get_receipts_ready_for_billing."""
	return get_receipts_ready_for_billing(company=company, supplier=supplier, limit=limit)


@frappe.whitelist()
def retry_auto_payable_for_receipt(receipt_name):
	"""Retry payable creation when auto-invoice failed after approval.

	Restricted to manager/accountant roles — same authorization required as purchase approval.
	"""
	from elmahdi.api.purchasing import _can_approve_accountant, _can_approve_manager, _is_admin_user

	if not (_can_approve_manager() or _can_approve_accountant() or _is_admin_user()):
		frappe.throw(
			_("You do not have permission to retry payable creation."),
			frappe.PermissionError,
		)
	return auto_create_and_submit_purchase_invoice_for_receipt(receipt_name)


@frappe.whitelist()
def create_purchase_invoice_from_receipt(receipt_name, submit=0):
	"""Manual billing for exceptional cases; normal receipts use auto_create on approval."""
	pr = _validate_receipt_for_matching(receipt_name)
	frappe.has_permission("Purchase Invoice", "create", throw=True)
	ws_before = _build_receipt_workspace_row(pr)

	if not ws_before.get("show_manual_billing"):
		return auto_create_and_submit_purchase_invoice_for_receipt(receipt_name)

	if ws_before["billing_status"] in (BILLING_FULLY_BILLED, BILLING_OVERBILLED):
		frappe.throw(
			_("Purchase Receipt {0} is already fully billed.").format(receipt_name),
			frappe.ValidationError,
		)

	if _submitted_invoice_name_for_receipt(receipt_name):
		frappe.throw(
			_("A submitted purchase invoice already exists for this receipt."),
			frappe.ValidationError,
		)

	pi = _make_pi_from_receipt(receipt_name)
	pi.insert()
	invoice_name = pi.name
	_append_matching_audit(
		receipt_name,
		{"action": "invoice_created_manual", "invoice": invoice_name, "from_receipt": receipt_name},
	)

	submitted = False
	if cint(submit):
		from elmahdi.api.erp_submit import assert_submitted_side_effects

		pi.submit()
		pi.reload()
		assert_submitted_side_effects(pi)
		submitted = True
		_append_matching_audit(
			receipt_name,
			{"action": "invoice_submitted", "invoice": invoice_name},
		)

	frappe.db.commit()
	pi.reload()
	pr.reload()
	workspace = _build_receipt_workspace_row(pr)
	return {
		"name": invoice_name,
		"submitted": submitted,
		"docstatus": pi.docstatus,
		"grand_total": flt(pi.grand_total),
		"outstanding_amount": flt(pi.outstanding_amount),
		"billed_pct": workspace.get("billed_pct"),
		"per_billed": workspace.get("per_billed"),
		"receipt": receipt_name,
		"workspace": workspace,
		"message": (
			_("Purchase Invoice {0} submitted successfully.").format(invoice_name)
			if submitted
			else _("Purchase Invoice {0} created (submit in ERP).").format(invoice_name)
		),
	}

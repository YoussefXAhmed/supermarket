"""
Purchase Receipt ↔ Purchase Invoice line-level matching.
ERPNext remains source of truth; all validation runs server-side.
"""

from __future__ import annotations

import json
from datetime import date, datetime

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

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

	ap_stage = "payment_pending"
	if not linked:
		ap_stage = "invoice_pending"
	elif all((i.get("payment_status") == "paid") for i in linked):
		ap_stage = "settled"
	elif any((i.get("payment_status") in ("unpaid", "overdue", "partially_paid")) for i in linked):
		ap_stage = "payment_pending"

	lifecycle_hint = (
		"Goods received — create or link a supplier purchase invoice."
		if ap_stage == "invoice_pending"
		else "Invoice linked — record supplier payment in Finance → Supplier payments."
		if ap_stage == "payment_pending"
		else "Receipt billed and supplier invoices paid."
	)

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
		"ap_stage": ap_stage,
		"lifecycle_hint": lifecycle_hint,
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

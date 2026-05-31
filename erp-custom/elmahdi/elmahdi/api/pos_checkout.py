"""
POS checkout — authoritative create + submit via ERPNext document API.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, today

from elmahdi.api.erp_submit import consolidate_pos_invoice, document_response, native_submit

IDEMPOTENCY_FIELD = "elmahdi_idempotency_key"
IDEMPOTENCY_CACHE_PREFIX = "pos_idempotency:"
IDEMPOTENCY_CACHE_TTL = 120


def _parse_payload(payload) -> dict:
	if payload is None:
		return {}
	if isinstance(payload, str):
		payload = payload.strip()
		if not payload:
			return {}
		return json.loads(payload)
	if isinstance(payload, dict):
		return payload
	frappe.throw(_("Invalid checkout payload"), frappe.ValidationError)


def _pos_invoice_has_field(fieldname: str) -> bool:
	return frappe.get_meta("POS Invoice").has_field(fieldname)


def _build_pos_invoice(payload: dict):
	"""Build draft POS Invoice with update_stock forced before insert."""
	customer = (payload.get("customer") or "").strip()
	company = (payload.get("company") or "").strip()
	pos_profile = (payload.get("pos_profile") or "").strip()
	warehouse = (payload.get("set_warehouse") or payload.get("warehouse") or "").strip()

	if not customer:
		frappe.throw(_("Customer is required"), frappe.ValidationError)
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)
	if not pos_profile:
		frappe.throw(_("POS Profile is required"), frappe.ValidationError)
	if not warehouse:
		frappe.throw(_("Warehouse is required"), frappe.ValidationError)

	items = payload.get("items") or []
	if not items:
		frappe.throw(_("At least one item is required"), frappe.ValidationError)

	payments = payload.get("payments") or []
	if not payments:
		frappe.throw(_("At least one payment row is required"), frappe.ValidationError)

	doc = frappe.new_doc("POS Invoice")
	doc.customer = customer
	doc.company = company
	doc.pos_profile = pos_profile
	doc.is_pos = 1
	doc.update_stock = 1
	doc.set_warehouse = warehouse
	doc.posting_date = payload.get("posting_date") or today()

	if payload.get("selling_price_list"):
		doc.selling_price_list = payload["selling_price_list"]
	if payload.get("currency"):
		doc.currency = payload["currency"]

	opening = payload.get("pos_opening_entry")
	if opening and _pos_invoice_has_field("pos_opening_entry"):
		doc.pos_opening_entry = opening

	for key in (
		"national_id",
		"custom_national_id",
		"tax_id",
		"remarks",
		"owner",
	):
		val = payload.get(key)
		if val is not None and val != "" and _pos_invoice_has_field(key):
			setattr(doc, key, val)

	for row in items:
		code = (row.get("item_code") or row.get("item") or "").strip()
		if not code:
			frappe.throw(_("Item row missing item_code"), frappe.ValidationError)
		qty = flt(row.get("qty"))
		if qty <= 0:
			frappe.throw(_("Item quantity must be greater than zero"), frappe.ValidationError)
		doc.append(
			"items",
			{
				"item_code": code,
				"item_name": row.get("item_name"),
				"qty": qty,
				"rate": flt(row.get("rate")),
				"uom": row.get("uom") or row.get("stock_uom") or "Nos",
				"warehouse": (row.get("warehouse") or warehouse).strip(),
			},
		)

	for pay in payments:
		mode = (pay.get("mode_of_payment") or "Cash").strip()
		amount = flt(pay.get("amount"))
		if amount <= 0:
			continue
		doc.append(
			"payments",
			{
				"mode_of_payment": mode,
				"amount": amount,
			},
		)

	if not doc.get("payments"):
		frappe.throw(_("Payment amount must be greater than zero"), frappe.ValidationError)

	if hasattr(doc, "set_missing_values"):
		doc.set_missing_values()

	doc.update_stock = 1
	doc.is_pos = 1
	return doc


def _invoice_response(doc, *, idempotent_replay=False) -> dict:
	out = document_response(doc)
	out.update(
		{
			"customer": doc.customer,
			"posting_date": str(doc.posting_date) if doc.posting_date else None,
			"set_warehouse": doc.set_warehouse,
			"pos_profile": doc.pos_profile,
			"owner": doc.owner,
			"is_pos": cint(doc.is_pos),
			"idempotent_replay": bool(idempotent_replay),
		}
	)
	return out


def _normalize_idempotency_key(payload: dict) -> str | None:
	key = (payload.get("idempotency_key") or payload.get("client_request_id") or "").strip()
	if not key:
		return None
	if len(key) > 140:
		frappe.throw(_("Idempotency key is too long."), frappe.ValidationError)
	return key


def _find_pos_invoice_by_idempotency_key(company: str, key: str) -> str | None:
	if not key or not _pos_invoice_has_field(IDEMPOTENCY_FIELD):
		return None
	filters = {IDEMPOTENCY_FIELD: key, "docstatus": ["!=", 2]}
	if company:
		filters["company"] = company
	return frappe.db.get_value("POS Invoice", filters, "name")


def _submit_and_consolidate(doc):
	if cint(doc.docstatus) == 0:
		doc = native_submit(doc, force_update_stock=True)
	if cint(doc.docstatus) == 1 and not doc.get("consolidated_invoice"):
		consolidate_pos_invoice(doc)
		doc.reload()
	return doc


def _idempotency_cache_key(company: str, key: str) -> str:
	return f"{IDEMPOTENCY_CACHE_PREFIX}{company}:{key}"


def _resolve_idempotent_pos_invoice(company: str, key: str):
	existing_name = _find_pos_invoice_by_idempotency_key(company, key)
	if not existing_name:
		return None
	doc = frappe.get_doc("POS Invoice", existing_name)
	return _submit_and_consolidate(doc)


@frappe.whitelist(methods=["POST"])
def create_and_submit_pos_invoice(payload):
	"""
	Create POS Invoice, insert(), submit(), then consolidate it immediately so
	stock and accounting post in real time (see consolidate_pos_invoice).

	When idempotency_key is supplied, a retry with the same key returns the
	existing invoice instead of creating a duplicate (network timeout safe).

	If consolidation fails (e.g. insufficient stock / oversell), the whole
	request rolls back — leaving no submitted POS Invoice behind.
	"""
	from elmahdi.api.spa_authorization import assert_may_operate_pos

	assert_may_operate_pos()
	data = _parse_payload(payload)
	frappe.has_permission("POS Invoice", "create", throw=True)

	company = (data.get("company") or "").strip()
	idempotency_key = _normalize_idempotency_key(data)
	cache_key = None

	if idempotency_key and company:
		existing = _resolve_idempotent_pos_invoice(company, idempotency_key)
		if existing:
			return _invoice_response(existing, idempotent_replay=True)

		cache_key = _idempotency_cache_key(company, idempotency_key)
		if frappe.cache().get_value(cache_key):
			existing = _resolve_idempotent_pos_invoice(company, idempotency_key)
			if existing:
				return _invoice_response(existing, idempotent_replay=True)
			frappe.throw(
				_("Checkout already in progress for this sale. Please wait."),
				frappe.ValidationError,
			)
		frappe.cache().set_value(cache_key, 1, expires_in_sec=IDEMPOTENCY_CACHE_TTL)

	try:
		doc = _build_pos_invoice(data)
		if idempotency_key and _pos_invoice_has_field(IDEMPOTENCY_FIELD):
			doc.set(IDEMPOTENCY_FIELD, idempotency_key)
		try:
			doc.insert()
		except frappe.UniqueValidationError:
			frappe.db.rollback()
			if idempotency_key and company:
				existing = _resolve_idempotent_pos_invoice(company, idempotency_key)
				if existing:
					return _invoice_response(existing, idempotent_replay=True)
			raise
		doc = _submit_and_consolidate(doc)
		return _invoice_response(doc)
	finally:
		if cache_key:
			frappe.cache().delete_value(cache_key)


@frappe.whitelist(methods=["POST"])
def submit_pos_invoice(name):
	"""Submit an existing draft POS sale invoice (retry / recovery)."""
	from elmahdi.api.spa_authorization import assert_may_operate_pos

	if not name:
		frappe.throw(_("Invoice name is required"), frappe.ValidationError)

	assert_may_operate_pos()
	doc = frappe.get_doc("POS Invoice", name)
	if cint(getattr(doc, "is_return", 0)):
		frappe.throw(_("Use submit_pos_invoice_return for return documents"), frappe.ValidationError)
	doc = native_submit(doc, force_update_stock=True)
	return _invoice_response(doc)

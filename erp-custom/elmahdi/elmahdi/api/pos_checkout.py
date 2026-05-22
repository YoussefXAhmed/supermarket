"""
POS checkout — authoritative create + submit via ERPNext document API.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, today

from elmahdi.api.erp_submit import document_response, native_submit
from elmahdi.api.pos_profile_auth import (
	assert_invoice_warehouse_matches_profile,
	assert_user_authorized_for_pos_profile,
)


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

	# Profile authorization — fail closed before any document construction.
	assert_user_authorized_for_pos_profile(pos_profile)
	# Warehouse scope — block payload spoofing to a different branch warehouse.
	assert_invoice_warehouse_matches_profile(pos_profile, warehouse)

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


def _invoice_response(doc) -> dict:
	out = document_response(doc)
	out.update(
		{
			"customer": doc.customer,
			"posting_date": str(doc.posting_date) if doc.posting_date else None,
			"set_warehouse": doc.set_warehouse,
			"pos_profile": doc.pos_profile,
			"owner": doc.owner,
			"is_pos": cint(doc.is_pos),
		}
	)
	return out


@frappe.whitelist()
def create_and_submit_pos_invoice(payload):
	"""
	Create POS Invoice, force update_stock=1, insert(), submit() via ERPNext API.
	Verifies Stock Ledger Entry rows exist when stock items were sold.
	"""
	data = _parse_payload(payload)
	frappe.has_permission("POS Invoice", "create", throw=True)

	doc = _build_pos_invoice(data)
	doc.insert()
	doc = native_submit(doc, force_update_stock=True)
	return _invoice_response(doc)


@frappe.whitelist()
def submit_pos_invoice(name):
	"""Submit an existing draft POS sale invoice (retry / recovery)."""
	if not name:
		frappe.throw(_("Invoice name is required"), frappe.ValidationError)

	doc = frappe.get_doc("POS Invoice", name)
	if cint(getattr(doc, "is_return", 0)):
		frappe.throw(_("Use submit_pos_invoice_return for return documents"), frappe.ValidationError)

	# Re-assert profile authorization on the persisted document to block
	# a cashier from retrying a draft that belongs to a different profile.
	if doc.pos_profile:
		assert_user_authorized_for_pos_profile(doc.pos_profile)

	doc = native_submit(doc, force_update_stock=True)
	return _invoice_response(doc)

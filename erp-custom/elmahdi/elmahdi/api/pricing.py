"""
Controlled Item Price reads for SPA operational users.
Requires Item Price read permission (see grant_operational_item_price_read patch).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt


def _parse_item_codes(item_codes):
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes) if item_codes.strip().startswith("[") else [item_codes]
	return [str(c).strip() for c in (item_codes or []) if str(c).strip()]


def _assert_item_price_read():
	if not frappe.has_permission("Item Price", "read"):
		frappe.throw(_("Not permitted to read item prices."), frappe.PermissionError)


def selling_price_map(codes, price_list=None):
	filters = {"item_code": ["in", codes], "selling": 1, "price_list_rate": [">", 0]}
	if price_list:
		filters["price_list"] = price_list

	rows = frappe.get_all(
		"Item Price",
		filters=filters,
		fields=["item_code", "price_list_rate", "modified"],
		order_by="price_list_rate desc, modified desc",
		limit_page_length=len(codes) * 5,
	)

	out = {}
	for row in rows:
		if row.item_code not in out:
			out[row.item_code] = flt(row.price_list_rate)
	return out


def buying_price_map(codes):
	rows = frappe.get_all(
		"Item Price",
		filters={"item_code": ["in", codes], "buying": 1, "price_list_rate": [">", 0]},
		fields=["item_code", "price_list_rate", "modified"],
		order_by="modified desc",
		limit_page_length=len(codes) * 3,
	)

	out = {}
	for row in rows:
		if row.item_code not in out:
			out[row.item_code] = flt(row.price_list_rate)
	return out


@frappe.whitelist()
def get_selling_item_prices(item_codes, price_list=None):
	"""Return { item_code: price_list_rate } for selling prices (highest rate per item when no list)."""
	_assert_item_price_read()
	codes = _parse_item_codes(item_codes)
	if not codes:
		return {}
	return selling_price_map(codes, price_list=price_list or None)


@frappe.whitelist()
def get_buying_item_prices(item_codes):
	"""Return { item_code: price_list_rate } for buying prices."""
	_assert_item_price_read()
	codes = _parse_item_codes(item_codes)
	if not codes:
		return {}
	return buying_price_map(codes)

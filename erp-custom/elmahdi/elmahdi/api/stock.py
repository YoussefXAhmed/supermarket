"""
Authoritative warehouse stock reads for SPA (POS + inventory).
Source: Bin.actual_qty minus reserved_qty per warehouse.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt


def _parse_item_codes(item_codes):
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes) if item_codes.strip().startswith("[") else [item_codes]
	return [str(c).strip() for c in (item_codes or []) if str(c).strip()]


def _bin_row(item_code: str, warehouse: str) -> dict:
	actual = flt(
		frappe.db.get_value(
			"Bin",
			{"item_code": item_code, "warehouse": warehouse},
			["actual_qty", "reserved_qty", "projected_qty", "valuation_rate"],
			as_dict=True,
		)
	)
	if not actual:
		return {
			"item_code": item_code,
			"warehouse": warehouse,
			"actual_qty": 0.0,
			"reserved_qty": 0.0,
			"available_qty": 0.0,
			"valuation_rate": 0.0,
		}
	actual_qty = flt(actual.actual_qty)
	reserved_qty = flt(actual.reserved_qty)
	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"actual_qty": actual_qty,
		"reserved_qty": reserved_qty,
		"available_qty": max(0.0, actual_qty - reserved_qty),
		"valuation_rate": flt(actual.valuation_rate),
	}


@frappe.whitelist()
def get_warehouse_stock(warehouse, item_codes=None):
	"""Return { item_code: { actual_qty, reserved_qty, available_qty } } for one warehouse."""
	if not warehouse:
		frappe.throw(_("Warehouse is required"), frappe.ValidationError)
	if not frappe.has_permission("Bin", "read"):
		frappe.throw(_("Not permitted to read stock."), frappe.PermissionError)

	codes = _parse_item_codes(item_codes)
	out = {}
	if not codes:
		rows = frappe.get_all(
			"Bin",
			filters={"warehouse": warehouse},
			fields=["item_code", "actual_qty", "reserved_qty", "valuation_rate"],
			limit_page_length=5000,
		)
		for row in rows:
			actual_qty = flt(row.actual_qty)
			reserved_qty = flt(row.reserved_qty)
			out[row.item_code] = {
				"actual_qty": actual_qty,
				"reserved_qty": reserved_qty,
				"available_qty": max(0.0, actual_qty - reserved_qty),
				"valuation_rate": flt(row.valuation_rate),
			}
		return out

	for code in codes:
		row = _bin_row(code, warehouse)
		out[code] = {
			"actual_qty": row["actual_qty"],
			"reserved_qty": row["reserved_qty"],
			"available_qty": row["available_qty"],
			"valuation_rate": row["valuation_rate"],
		}
	return out


@frappe.whitelist()
def get_pos_profile_stock(pos_profile, item_codes=None):
	"""Stock for POS profile warehouse."""
	if not pos_profile:
		frappe.throw(_("POS Profile is required"), frappe.ValidationError)
	warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
	if not warehouse:
		frappe.throw(_("POS Profile has no warehouse"), frappe.ValidationError)
	return {
		"pos_profile": pos_profile,
		"warehouse": warehouse,
		"items": get_warehouse_stock(warehouse, item_codes),
	}

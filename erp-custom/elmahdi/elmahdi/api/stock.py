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
	row = frappe.db.get_value(
		"Bin",
		{"item_code": item_code, "warehouse": warehouse},
		["actual_qty", "reserved_qty", "projected_qty", "valuation_rate"],
		as_dict=True,
	)
	if not row:
		return {
			"item_code": item_code,
			"warehouse": warehouse,
			"actual_qty": 0.0,
			"reserved_qty": 0.0,
			"projected_qty": 0.0,
			"sellable_qty": 0.0,
			"has_stock": False,
			"valuation_rate": 0.0,
		}

	actual_qty = flt(row.actual_qty)
	reserved_qty = flt(row.reserved_qty)
	projected_qty = flt(row.projected_qty)
	sellable_qty = actual_qty - reserved_qty
	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"actual_qty": actual_qty,
		"reserved_qty": reserved_qty,
		"projected_qty": projected_qty,
		"sellable_qty": sellable_qty,
		"has_stock": sellable_qty > 0,
		"valuation_rate": flt(row.valuation_rate),
	}


def _require_stock_read() -> None:
	if not frappe.has_permission("Bin", "read"):
		frappe.throw(_("Not permitted to read stock."), frappe.PermissionError)


@frappe.whitelist()
def get_sellable_stock(item_code: str, warehouse: str) -> dict:
	"""
	Single-item authoritative stock read.

	Sellable stock logic:
	  sellable_qty = actual_qty - reserved_qty

	Fail-closed: if anything goes wrong, returns has_stock=false and sellable_qty=0.
	"""
	if not item_code:
		frappe.throw(_("Item Code is required"), frappe.ValidationError)
	if not warehouse:
		frappe.throw(_("Warehouse is required"), frappe.ValidationError)
	_require_stock_read()

	try:
		row = _bin_row(str(item_code).strip(), str(warehouse).strip())
		# Ensure required response shape (debug visibility fields included).
		return {
			"item_code": row["item_code"],
			"warehouse": row["warehouse"],
			"actual_qty": flt(row.get("actual_qty")),
			"reserved_qty": flt(row.get("reserved_qty")),
			"projected_qty": flt(row.get("projected_qty")),
			"sellable_qty": flt(row.get("sellable_qty")),
			"has_stock": bool(row.get("has_stock")),
		}
	except Exception:
		frappe.log_error(title="get_sellable_stock failed")
		return {
			"item_code": str(item_code).strip(),
			"warehouse": str(warehouse).strip(),
			"actual_qty": 0.0,
			"reserved_qty": 0.0,
			"projected_qty": 0.0,
			"sellable_qty": 0.0,
			"has_stock": False,
		}


@frappe.whitelist()
def get_sellable_stock_bulk(warehouse: str, item_codes=None) -> dict:
	"""
	Bulk authoritative stock read for one warehouse.

	Returns: { item_code: { actual_qty, reserved_qty, projected_qty, sellable_qty, has_stock, warehouse, item_code } }
	Fail-closed per item on unexpected errors.
	"""
	if not warehouse:
		frappe.throw(_("Warehouse is required"), frappe.ValidationError)
	_require_stock_read()

	codes = _parse_item_codes(item_codes)
	out: dict[str, dict] = {}
	if not codes:
		return out

	for code in codes:
		try:
			row = _bin_row(code, warehouse)
			out[code] = {
				"item_code": row["item_code"],
				"warehouse": row["warehouse"],
				"actual_qty": flt(row.get("actual_qty")),
				"reserved_qty": flt(row.get("reserved_qty")),
				"projected_qty": flt(row.get("projected_qty")),
				"sellable_qty": flt(row.get("sellable_qty")),
				"has_stock": bool(row.get("has_stock")),
			}
		except Exception:
			out[code] = {
				"item_code": str(code).strip(),
				"warehouse": str(warehouse).strip(),
				"actual_qty": 0.0,
				"reserved_qty": 0.0,
				"projected_qty": 0.0,
				"sellable_qty": 0.0,
				"has_stock": False,
			}
	return out


@frappe.whitelist()
def list_sellable_bins(
	warehouse: str | None = None,
	max_sellable_qty: float | None = None,
	min_sellable_qty: float | None = None,
	item_codes=None,
	limit: int = 800,
) -> list[dict]:
	"""
	List Bin-like rows with authoritative sellable_qty for dashboards/alerts/reports.

	- warehouse: optional filter (explicit warehouse for inventory pages; omit for "all")
	- max_sellable_qty: optional threshold filter on computed sellable_qty
	"""
	_require_stock_read()

	limit = int(limit or 800)
	limit = max(1, min(limit, 5000))

	filters = []
	if warehouse:
		filters.append(["warehouse", "=", warehouse])
	codes = _parse_item_codes(item_codes)
	if codes:
		filters.append(["item_code", "in", codes])

	rows = frappe.get_all(
		"Bin",
		filters=filters,
		fields=["item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty", "valuation_rate"],
		limit_page_length=limit,
	)

	out: list[dict] = []
	for r in rows:
		actual_qty = flt(r.actual_qty)
		reserved_qty = flt(r.reserved_qty)
		projected_qty = flt(r.projected_qty)
		sellable_qty = actual_qty - reserved_qty
		if min_sellable_qty is not None and sellable_qty < flt(min_sellable_qty):
			continue
		if max_sellable_qty is not None and sellable_qty > flt(max_sellable_qty):
			continue
		out.append(
			{
				"item_code": r.item_code,
				"warehouse": r.warehouse,
				"actual_qty": actual_qty,
				"reserved_qty": reserved_qty,
				"projected_qty": projected_qty,
				"sellable_qty": sellable_qty,
				"has_stock": sellable_qty > 0,
				"valuation_rate": flt(r.valuation_rate),
			}
		)
	return out


@frappe.whitelist()
def get_warehouse_stock(warehouse, item_codes=None):
	"""Return { item_code: { actual_qty, reserved_qty, projected_qty, sellable_qty, has_stock } } for one warehouse."""
	if not warehouse:
		frappe.throw(_("Warehouse is required"), frappe.ValidationError)
	_require_stock_read()

	codes = _parse_item_codes(item_codes)
	out = {}
	if not codes:
		rows = frappe.get_all(
			"Bin",
			filters={"warehouse": warehouse},
			fields=["item_code", "actual_qty", "reserved_qty", "projected_qty", "valuation_rate"],
			limit_page_length=5000,
		)
		for row in rows:
			actual_qty = flt(row.actual_qty)
			reserved_qty = flt(row.reserved_qty)
			projected_qty = flt(row.projected_qty)
			sellable_qty = actual_qty - reserved_qty
			out[row.item_code] = {
				"actual_qty": actual_qty,
				"reserved_qty": reserved_qty,
				"projected_qty": projected_qty,
				"sellable_qty": sellable_qty,
				"has_stock": sellable_qty > 0,
			}
		return out

	for code in codes:
		row = _bin_row(code, warehouse)
		out[code] = {
			"actual_qty": row["actual_qty"],
			"reserved_qty": row["reserved_qty"],
			"projected_qty": row["projected_qty"],
			"sellable_qty": row["sellable_qty"],
			"has_stock": row["has_stock"],
		}
	return out


@frappe.whitelist()
def get_pos_profile_stock(pos_profile, item_codes=None):
	"""Stock for POS profile warehouse."""
	if not pos_profile:
		frappe.throw(_("POS Profile is required"), frappe.ValidationError)
	_require_stock_read()
	warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
	if not warehouse:
		frappe.throw(_("POS Profile has no warehouse"), frappe.ValidationError)
	return {
		"pos_profile": pos_profile,
		"warehouse": warehouse,
		"items": get_warehouse_stock(warehouse, item_codes),
	}


@frappe.whitelist()
def get_pos_profile_warehouse(pos_profile: str) -> dict:
	"""Resolve the single authoritative POS warehouse for cashier flows."""
	if not pos_profile:
		frappe.throw(_("POS Profile is required"), frappe.ValidationError)
	warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
	if not warehouse:
		frappe.throw(_("POS Profile has no warehouse"), frappe.ValidationError)
	return {"pos_profile": pos_profile, "warehouse": warehouse}

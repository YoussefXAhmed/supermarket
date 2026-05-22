"""
Authoritative warehouse stock reads for SPA (POS + inventory).

sellable_qty = Bin.actual_qty
             - Bin.reserved_qty          (open Sales Order reservations)
             - pos_reserved_qty          (submitted unconsolidated POS Invoice items)

In ERPNext v15, POS Invoice submit does NOT post SLEs (deferred to POS Closing Entry
consolidation).  Bin.actual_qty is therefore stale until closing.  pos_reserved_qty
accounts for the "sold but not yet posted" stock in flight between individual invoice
submit and shift closing.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt


def _pos_reserved_qty_bulk(item_codes: list, warehouse: str) -> dict:
	"""
	Return {item_code: reserved_qty} for submitted, unconsolidated POS Invoices.

	In ERPNext v15, POSInvoice.on_submit() defers SLE posting to POS Closing Entry
	consolidation.  Until a POS Closing Entry is submitted, Bin.actual_qty does not
	reflect recent sales.  This query mirrors ERPNext's own get_pos_reserved_qty()
	and must be subtracted from actual_qty to give accurate real-time sellable stock.

	Consolidated invoices (consolidated_invoice != '') are excluded because their
	stock has already been posted via the consolidated Sales Invoice SLE.
	"""
	if not item_codes:
		return {}
	placeholders = ", ".join(["%s"] * len(item_codes))
	rows = frappe.db.sql(
		f"""
		SELECT pi_item.item_code, SUM(pi_item.stock_qty) AS reserved
		FROM `tabPOS Invoice Item` pi_item
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
		WHERE pi_item.docstatus = 1
		  AND IFNULL(pi.consolidated_invoice, '') = ''
		  AND pi_item.item_code IN ({placeholders})
		  AND pi_item.warehouse = %s
		GROUP BY pi_item.item_code
		""",
		tuple(item_codes) + (warehouse,),
		as_dict=True,
	)
	return {r.item_code: flt(r.reserved) for r in rows}


def _pos_reserved_qty(item_code: str, warehouse: str) -> float:
	"""Single-item version of _pos_reserved_qty_bulk."""
	rows = frappe.db.sql(
		"""
		SELECT SUM(pi_item.stock_qty) AS reserved
		FROM `tabPOS Invoice Item` pi_item
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pi_item.parent
		WHERE pi_item.docstatus = 1
		  AND IFNULL(pi.consolidated_invoice, '') = ''
		  AND pi_item.item_code = %s
		  AND pi_item.warehouse = %s
		""",
		(item_code, warehouse),
		as_dict=True,
	)
	return flt(rows[0].reserved) if rows and rows[0].reserved else 0.0


def _parse_item_codes(item_codes):
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes) if item_codes.strip().startswith("[") else [item_codes]
	return [str(c).strip() for c in (item_codes or []) if str(c).strip()]


def _bin_row(item_code: str, warehouse: str, pos_reserved: float = 0.0) -> dict:
	"""
	Build a stock row for one item/warehouse.

	pos_reserved: quantity already sold in submitted but not-yet-consolidated POS Invoices.
	In ERPNext v15, SLEs are posted at POS Closing Entry time, not at individual invoice
	submit.  Pass the result of _pos_reserved_qty / _pos_reserved_qty_bulk so that
	sellable_qty reflects real-time availability without waiting for closing.
	"""
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
			"pos_reserved_qty": flt(pos_reserved),
			"projected_qty": 0.0,
			"sellable_qty": 0.0,
			"has_stock": False,
			"valuation_rate": 0.0,
		}

	actual_qty = flt(row.actual_qty)
	reserved_qty = flt(row.reserved_qty)
	projected_qty = flt(row.projected_qty)
	pos_reserved = flt(pos_reserved)
	# actual_qty − SO-reserved − unconsolidated POS sales (not yet in SLE)
	sellable_qty = actual_qty - reserved_qty - pos_reserved
	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"actual_qty": actual_qty,
		"reserved_qty": reserved_qty,
		"pos_reserved_qty": pos_reserved,
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
		pos_reserved = _pos_reserved_qty(str(item_code).strip(), str(warehouse).strip())
		row = _bin_row(str(item_code).strip(), str(warehouse).strip(), pos_reserved)
		return {
			"item_code": row["item_code"],
			"warehouse": row["warehouse"],
			"actual_qty": flt(row.get("actual_qty")),
			"reserved_qty": flt(row.get("reserved_qty")),
			"pos_reserved_qty": flt(row.get("pos_reserved_qty")),
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
			"pos_reserved_qty": 0.0,
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

	pos_reserved_map = _pos_reserved_qty_bulk(codes, warehouse)

	for code in codes:
		try:
			row = _bin_row(code, warehouse, pos_reserved_map.get(code, 0.0))
			out[code] = {
				"item_code": row["item_code"],
				"warehouse": row["warehouse"],
				"actual_qty": flt(row.get("actual_qty")),
				"reserved_qty": flt(row.get("reserved_qty")),
				"pos_reserved_qty": flt(row.get("pos_reserved_qty")),
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
				"pos_reserved_qty": 0.0,
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
		all_codes = [r.item_code for r in rows]
		pos_reserved_map = _pos_reserved_qty_bulk(all_codes, warehouse)
		for row in rows:
			actual_qty = flt(row.actual_qty)
			reserved_qty = flt(row.reserved_qty)
			projected_qty = flt(row.projected_qty)
			pos_reserved = pos_reserved_map.get(row.item_code, 0.0)
			sellable_qty = actual_qty - reserved_qty - pos_reserved
			out[row.item_code] = {
				"actual_qty": actual_qty,
				"reserved_qty": reserved_qty,
				"pos_reserved_qty": pos_reserved,
				"projected_qty": projected_qty,
				"sellable_qty": sellable_qty,
				"has_stock": sellable_qty > 0,
			}
		return out

	pos_reserved_map = _pos_reserved_qty_bulk(codes, warehouse)
	for code in codes:
		row = _bin_row(code, warehouse, pos_reserved_map.get(code, 0.0))
		out[code] = {
			"actual_qty": row["actual_qty"],
			"reserved_qty": row["reserved_qty"],
			"pos_reserved_qty": row["pos_reserved_qty"],
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

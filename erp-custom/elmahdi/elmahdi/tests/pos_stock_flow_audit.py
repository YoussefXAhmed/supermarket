"""
Audit helpers for end-to-end POS/ERP stock integrity flow.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import cint, flt

from elmahdi.api.erp_submit import _gle_count, _sle_count


def sle_count(voucher_type: str, voucher_no: str) -> int:
	return _sle_count(voucher_type, voucher_no)


def gle_count(voucher_type: str, voucher_no: str) -> int:
	return _gle_count(voucher_type, voucher_no)


def bin_state(item_code: str, warehouse: str, qty_requested: float = 0) -> dict:
	row = frappe.db.get_value(
		"Bin",
		{"item_code": item_code, "warehouse": warehouse},
		["actual_qty", "reserved_qty", "projected_qty"],
		as_dict=True,
	)
	actual_qty = flt(row.actual_qty) if row else 0.0
	reserved_qty = flt(row.reserved_qty) if row else 0.0
	projected_qty = flt(row.projected_qty) if row else 0.0
	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"qty_requested": flt(qty_requested),
		"actual_qty": actual_qty,
		"reserved_qty": reserved_qty,
		"projected_qty": projected_qty,
		"sellable_qty": actual_qty - reserved_qty,
		"is_stock_item": bool(cint(frappe.db.get_value("Item", item_code, "is_stock_item"))),
	}


def frontend_display_qty(item_code: str, warehouse: str) -> float | None:
	row = bin_state(item_code, warehouse)
	if not row.get("is_stock_item"):
		return None
	return flt(row.get("sellable_qty"))


def classify_failure(error: BaseException | None, *, context: dict | None = None) -> str:
	msg = str(error or "").lower()
	ctx = context or {}
	if "permission" in msg:
		return "erp_permission_failure"
	if "warehouse mismatch" in msg or ctx.get("warehouse_mismatch"):
		return "warehouse_mismatch"
	if "without stock movement" in msg:
		return "missing_sle"
	if "without accounting" in msg:
		return "accounting_mismatch"
	if "update_stock" in msg:
		return "missing_update_stock"
	if "insufficient stock" in msg or "negative stock" in msg:
		return "reserved_stock_mismatch"
	if "docstatus" in msg or ctx.get("docstatus", 1) != 1:
		return "draft_document"
	if ctx.get("frontend_qty") is not None and ctx.get("backend_qty") is not None:
		if abs(flt(ctx["frontend_qty"]) - flt(ctx["backend_qty"])) > 0.0001:
			return "frontend_backend_inconsistency"
	return "unknown"


def audit_record(
	*,
	step: str,
	passed: bool,
	document: str = "",
	doctype: str = "",
	warehouse: str = "",
	item_code: str = "",
	qty_before: float | None = None,
	qty_after: float | None = None,
	frontend_display_qty: float | None = None,
	backend_sellable_qty: float | None = None,
	actual_qty: float | None = None,
	reserved_qty: float | None = None,
	projected_qty: float | None = None,
	sle_count: int | None = None,
	gl_count: int | None = None,
	message: str = "",
	root_cause: str | None = None,
	extra_debug: dict | None = None,
	# backward-compatible aliases
	sellable_qty: float | None = None,
	sle_count_val: int | None = None,
	gl_count_val: int | None = None,
	frontend_qty: float | None = None,
	extra: dict | None = None,
	**more_debug: Any,
) -> dict:
	"""
	Normalized audit schema; absorbs unknown debug kwargs safely.
	"""
	if backend_sellable_qty is None and sellable_qty is not None:
		backend_sellable_qty = sellable_qty
	if sle_count is None and sle_count_val is not None:
		sle_count = sle_count_val
	if gl_count is None and gl_count_val is not None:
		gl_count = gl_count_val
	if frontend_display_qty is None and frontend_qty is not None:
		frontend_display_qty = frontend_qty

	merged_debug = {}
	if extra:
		merged_debug.update(extra)
	if extra_debug:
		merged_debug.update(extra_debug)
	if more_debug:
		merged_debug.update(more_debug)

	rec = {
		"step": step,
		"pass": bool(passed),
		"document": document,
		"doctype": doctype,
		"warehouse": warehouse,
		"item_code": item_code,
		"qty_before": qty_before,
		"qty_after": qty_after,
		"frontend_display_qty": frontend_display_qty,
		"backend_sellable_qty": backend_sellable_qty,
		"sellable_qty": backend_sellable_qty,  # alias
		"actual_qty": actual_qty,
		"reserved_qty": reserved_qty,
		"projected_qty": projected_qty,
		"sle_count": sle_count,
		"gl_count": gl_count,
		"message": message,
		"root_cause": root_cause,
	}
	if merged_debug:
		rec["extra_debug"] = merged_debug
	return rec


def summarize_report(rows: list[dict]) -> dict:
	failed = [r for r in rows if not r.get("pass")]
	return {
		"total_steps": len(rows),
		"passed": len(rows) - len(failed),
		"failed": len(failed),
		"success": not failed,
		"steps": rows,
		"failures": failed,
	}


def print_report(summary: dict) -> None:
	print("\n" + "=" * 72)
	print("  ELMAHDI FULL POS / STOCK FLOW — INTEGRITY REPORT")
	print("=" * 72)
	print(f"  Result: {'PASS' if summary.get('success') else 'FAIL'}")
	print(f"  Steps: {summary.get('passed')}/{summary.get('total_steps')} passed")
	print("-" * 72)
	for row in summary.get("steps") or []:
		status = "PASS" if row.get("pass") else "FAIL"
		doc = row.get("document") or row.get("item_code") or "—"
		print(f"  [{status}] {row.get('step')}: {doc}")
		if row.get("message"):
			print(f"         {row.get('message')}")
	print("=" * 72 + "\n")

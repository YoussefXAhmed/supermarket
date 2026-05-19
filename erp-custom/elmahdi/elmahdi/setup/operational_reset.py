"""
Safe operational reset for a single ERPNext company.

Preserves master data (users, items, parties, warehouses, POS profiles, etc.)
while cancelling and deleting transactional documents, then zeroing stock bins
and clearing orphaned ledger rows for the company.

Run:
  bench --site <site> execute elmahdi.setup.operational_reset.execute
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import frappe
from frappe.utils import cint, flt, now_datetime

COMPANY = "Elmahdi Supermarket"

# Cancel/delete in dependency order (most dependent first).
TRANSACTION_DOCTYPES: tuple[str, ...] = (
	"Payment Reconciliation",
	"Bank Reconciliation",
	"Process Payment Reconciliation",
	"Payment Entry",
	"Journal Entry",
	"Period Closing Voucher",
	"POS Closing Entry",
	"POS Invoice Merge Log",
	"POS Invoice",
	"Sales Invoice",
	"Delivery Note",
	"Purchase Invoice",
	"Landed Cost Voucher",
	"Stock Entry",
	"Purchase Receipt",
	"Stock Reconciliation",
	"Pick List",
	"Purchase Order",
	"Sales Order",
	"Material Request",
	"Quotation",
	"POS Opening Entry",
	"Repost Item Valuation",
	"Packing Slip",
	"Shipment",
	"Invoice Discounting",
	"Dunning",
)

LEDGER_DOCTYPES: tuple[str, ...] = (
	"GL Entry",
	"Payment Ledger Entry",
	"Stock Ledger Entry",
)

PRESERVE_DOCTYPES: tuple[str, ...] = (
	"User",
	"Role Profile",
	"Customer",
	"Supplier",
	"Item",
	"Warehouse",
	"POS Profile",
	"Price List",
	"Item Price",
	"User Permission",
	"Company",
	"Account",
	"Cost Center",
	"Mode of Payment",
	"Item Default",
	"Brand",
	"Item Group",
	"Customer Group",
	"Supplier Group",
)


def _company_warehouses() -> list[str]:
	return frappe.get_all("Warehouse", filters={"company": COMPANY}, pluck="name")


def _meta_has_company(doctype: str) -> bool:
	return bool(frappe.get_meta(doctype).has_field("company"))


def _doc_names(doctype: str) -> list[str]:
	if not frappe.db.table_exists(doctype):
		return []
	filters: dict[str, Any] = {}
	if _meta_has_company(doctype):
		filters["company"] = COMPANY
	return frappe.get_all(doctype, filters=filters, pluck="name", order_by="creation asc")


def _cancel_document(doctype: str, name: str, log: dict) -> None:
	doc = frappe.get_doc(doctype, name)
	if doc.docstatus != 1:
		return
	try:
		doc.cancel()
		log["cancelled"].append(f"{doctype}:{name}")
	except frappe.ValidationError as exc:
		msg = str(exc)
		if "Cancelled" in msg or "already cancelled" in msg.lower():
			log["skipped_cancel"].append(f"{doctype}:{name}")
		else:
			log["cancel_errors"].append({"doc": f"{doctype}:{name}", "error": msg})
	except Exception as exc:
		log["cancel_errors"].append({"doc": f"{doctype}:{name}", "error": str(exc)})


def _delete_document(doctype: str, name: str, log: dict) -> None:
	try:
		frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		log["deleted"].append(f"{doctype}:{name}")
	except Exception as exc:
		log["delete_errors"].append({"doc": f"{doctype}:{name}", "error": str(exc)})


def _process_doctype(doctype: str, log: dict) -> dict[str, int]:
	before = len(_doc_names(doctype))
	if before == 0:
		return {"before": 0, "after": 0}

	names = _doc_names(doctype)
	for name in names:
		_cancel_document(doctype, name, log)
	frappe.db.commit()

	for name in _doc_names(doctype):
		_delete_document(doctype, name, log)
	frappe.db.commit()

	after = len(_doc_names(doctype))
	log["doctype_summary"][doctype] = {"before": before, "after": after}
	return {"before": before, "after": after}


def _purge_orphan_ledgers(log: dict) -> None:
	for doctype in LEDGER_DOCTYPES:
		if not frappe.db.table_exists(doctype):
			continue
		meta = frappe.get_meta(doctype)
		if meta.has_field("company"):
			names = frappe.get_all(doctype, filters={"company": COMPANY}, pluck="name")
		else:
			names = frappe.get_all(doctype, pluck="name", limit=100000)
		if not names:
			continue
		for name in names:
			try:
				frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
				log["ledger_deleted"].append(f"{doctype}:{name}")
			except Exception:
				frappe.db.delete(doctype, {"name": name})
				log["ledger_sql_deleted"].append(f"{doctype}:{name}")
		frappe.db.commit()


def _zero_stock_bins(log: dict) -> None:
	warehouses = _company_warehouses()
	if not warehouses:
		return
	bins = frappe.get_all(
		"Bin",
		filters={"warehouse": ["in", warehouses]},
		fields=["name", "actual_qty", "reserved_qty", "stock_value"],
	)
	for row in bins:
		if flt(row.actual_qty) or flt(row.reserved_qty) or flt(row.stock_value):
			frappe.db.set_value(
				"Bin",
				row.name,
				{
					"actual_qty": 0,
					"reserved_qty": 0,
					"ordered_qty": 0,
					"planned_qty": 0,
					"indented_qty": 0,
					"projected_qty": 0,
					"stock_value": 0,
					"valuation_rate": 0,
				},
				update_modified=False,
			)
			log["bins_zeroed"].append(row.name)
	frappe.db.commit()


def _reset_company_dashboard_metrics() -> None:
	company = frappe.get_doc("Company", COMPANY)
	company.total_monthly_sales = 0
	company.sales_monthly_history = None
	company.save(ignore_permissions=True)
	frappe.db.commit()


def _clear_notifications() -> None:
	try:
		from frappe.desk.notifications import clear_notifications

		clear_notifications()
	except Exception:
		pass


def _clear_repost_queue(log: dict) -> None:
	"""Remove pending valuation repost jobs for this company."""
	if not frappe.db.table_exists("Repost Item Valuation"):
		return
	names = frappe.get_all(
		"Repost Item Valuation",
		filters={"company": COMPANY},
		pluck="name",
	)
	for name in names:
		try:
			doc = frappe.get_doc("Repost Item Valuation", name)
			if doc.docstatus == 1:
				try:
					doc.cancel()
				except Exception:
					frappe.db.set_value("Repost Item Valuation", name, "docstatus", 2, update_modified=False)
			frappe.delete_doc("Repost Item Valuation", name, force=True, ignore_permissions=True)
			log["repost_cleared"].append(name)
		except Exception as exc:
			try:
				frappe.db.delete("Repost Item Valuation", {"name": name})
				log["repost_sql_deleted"].append(name)
			except Exception as exc2:
				log["repost_errors"].append({"name": name, "error": f"{exc}; sql: {exc2}"})
	frappe.db.commit()


def _rebuild_stock_consistency(log: dict) -> None:
	"""After ledger/bin cleanup, clear stale item/warehouse stock flags."""
	warehouses = _company_warehouses()
	if warehouses:
		frappe.db.sql(
			"""
			update `tabBin`
			set actual_qty = 0, reserved_qty = 0, ordered_qty = 0, indented_qty = 0,
				planned_qty = 0, projected_qty = 0, stock_value = 0, valuation_rate = 0
			where warehouse in %(wh)s
			""",
			{"wh": warehouses},
		)
		log["rebuild_steps"].append("zeroed_all_bins_sql")
	frappe.db.commit()


def take_full_backup() -> dict[str, str]:
	"""Full site database backup via Frappe BackupGenerator (files optional)."""
	from frappe.utils.backups import scheduled_backup

	frappe.only_for("System Manager")
	odb = scheduled_backup(ignore_files=True, force=True)
	path = getattr(odb, "backup_path_db", None) or getattr(odb, "backup_path", "")
	return {
		"database": path or "",
		"timestamp": datetime.now().isoformat(timespec="seconds"),
	}


def _count_master_data() -> dict[str, int]:
	counts: dict[str, int] = {}
	for dt in PRESERVE_DOCTYPES:
		try:
			if dt == "User":
				counts[dt] = frappe.db.count(
					dt, {"enabled": 1, "name": ["not in", ["Guest", "Administrator"]]}
				)
			else:
				counts[dt] = frappe.db.count(dt)
		except Exception:
			counts[dt] = -1
	return counts


def _count_transactions() -> dict[str, int]:
	counts: dict[str, int] = {}
	for dt in TRANSACTION_DOCTYPES + LEDGER_DOCTYPES:
		try:
			if frappe.db.table_exists(dt) and _meta_has_company(dt):
				counts[dt] = frappe.db.count(dt, {"company": COMPANY})
			elif frappe.db.table_exists(dt):
				counts[dt] = frappe.db.count(dt)
			else:
				counts[dt] = 0
		except Exception:
			counts[dt] = -1
	warehouses = _company_warehouses()
	counts["Bin_nonzero_qty"] = frappe.db.count(
		"Bin",
		{
			"warehouse": ["in", warehouses],
			"actual_qty": [">", 0],
		},
	) if warehouses else 0
	return counts


def _trial_balance_total() -> float:
	if not frappe.db.table_exists("tabGL Entry"):
		return 0.0
	result = frappe.db.sql(
		"""
		select coalesce(sum(debit) - sum(credit), 0)
		from `tabGL Entry`
		where company = %s and is_cancelled = 0
		""",
		COMPANY,
	)
	return flt(result[0][0]) if result else 0.0


def verify() -> dict[str, Any]:
	tx = _count_transactions()
	master = _count_master_data()
	nonzero_bins = [
		b
		for b in frappe.get_all(
			"Bin",
			filters={"warehouse": ["in", _company_warehouses()]},
			fields=["item_code", "warehouse", "actual_qty"],
		)
		if flt(b.actual_qty) != 0
	]
	return {
		"transactions": tx,
		"master_data": master,
		"gl_imbalance": _trial_balance_total(),
		"nonzero_bins": nonzero_bins,
		"healthy": (
			all(tx.get(dt, 0) == 0 for dt in TRANSACTION_DOCTYPES)
			and all(tx.get(dt, 0) == 0 for dt in LEDGER_DOCTYPES)
			and tx.get("Bin_nonzero_qty", 0) == 0
			and abs(_trial_balance_total()) < 0.01
			and master.get("Item", 0) > 0
			and master.get("Customer", 0) > 0
		),
	}


def run_reset() -> dict[str, Any]:
	frappe.only_for("System Manager")
	frappe.set_user("Administrator")
	log: dict[str, Any] = {
		"company": COMPANY,
		"started_at": now_datetime(),
		"cancelled": [],
		"skipped_cancel": [],
		"cancel_errors": [],
		"deleted": [],
		"delete_errors": [],
		"ledger_deleted": [],
		"ledger_sql_deleted": [],
		"bins_zeroed": [],
		"repost_cleared": [],
		"repost_sql_deleted": [],
		"repost_errors": [],
		"rebuild_steps": [],
		"doctype_summary": {},
	}

	before_tx = _count_transactions()
	before_master = _count_master_data()

	for doctype in TRANSACTION_DOCTYPES:
		_process_doctype(doctype, log)

	_purge_orphan_ledgers(log)
	_zero_stock_bins(log)
	_clear_repost_queue(log)
	_rebuild_stock_consistency(log)
	_reset_company_dashboard_metrics()
	_clear_notifications()

	frappe.clear_cache()
	frappe.db.commit()

	after = verify()
	log["finished_at"] = now_datetime()
	log["before_transactions"] = before_tx
	log["before_master"] = before_master
	log["after"] = after
	log["deleted_doctypes"] = list(TRANSACTION_DOCTYPES) + list(LEDGER_DOCTYPES)
	return log


def execute(with_backup: bool = True):
	"""Entry point for bench execute. Takes full DB backup first by default."""
	frappe.only_for("System Manager")
	result: dict[str, Any] = {"backup": None, "reset": None, "verify": None}
	if cint(with_backup):
		result["backup"] = take_full_backup()
	report = run_reset()
	result["reset"] = report
	result["verify"] = verify()
	result["healthy"] = result["verify"].get("healthy")
	print(json.dumps(result, indent=2, default=str))
	return result


def execute_verify_only():
	"""Post-reset health check without deleting anything."""
	out = verify()
	print(json.dumps(out, indent=2, default=str))
	return out


def execute_finish_cleanup():
	"""Clear stuck repost jobs and re-verify (safe follow-up after main reset)."""
	frappe.only_for("System Manager")
	frappe.set_user("Administrator")
	log: dict[str, Any] = {
		"repost_cleared": [],
		"repost_sql_deleted": [],
		"repost_errors": [],
		"rebuild_steps": [],
	}
	_clear_repost_queue(log)
	_rebuild_stock_consistency(log)
	frappe.clear_cache()
	result = {"cleanup": log, "verify": verify()}
	print(json.dumps(result, indent=2, default=str))
	return result

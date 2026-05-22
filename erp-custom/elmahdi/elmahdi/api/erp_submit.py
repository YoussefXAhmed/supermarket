"""
Authoritative ERPNext document submit — native doc.submit() only.

REST `PUT { docstatus: 1 }` bypasses workflow hooks and must not be used for
stock- or accounting-moving documents.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint


STOCK_MOVEMENT_ERROR = "{doctype} submitted without stock movement"
GL_MOVEMENT_ERROR = "{doctype} submitted without accounting entries"

# Always posts stock ledger when submitted with stock items
STOCK_DOCTYPES_ALWAYS = frozenset(
	{
		"Stock Entry",
		"Stock Reconciliation",
		"Purchase Receipt",
		"Delivery Note",
		"Purchase Return",
	}
)

# Stock ledger only when update_stock is enabled.
# NOTE: POS Invoice (ERPNext v15) does NOT create SLE at individual submit —
# stock and accounting entries are created during POS Closing Entry consolidation.
INVOICE_STOCK_DOCTYPES = frozenset(
	{
		"Sales Invoice",
		"Purchase Invoice",
	}
)

# General ledger expected on submit.
# NOTE: POS Invoice excluded — in ERPNext v15 GL entries are created by the
# POS Closing Entry process (consolidated Sales Invoice), not individual submit.
GL_DOCTYPES = frozenset(
	{
		"Sales Invoice",
		"Purchase Invoice",
		"Payment Entry",
	}
)


def _stock_item_codes(doc) -> list[str]:
	codes: list[str] = []
	rows = doc.get("items") or []
	for row in rows:
		code = (getattr(row, "item_code", None) or row.get("item_code") if isinstance(row, dict) else None) or ""
		code = str(code).strip()
		if not code:
			continue
		if cint(frappe.db.get_value("Item", code, "is_stock_item")):
			codes.append(code)
	return codes


def _sle_count(voucher_type: str, voucher_no: str) -> int:
	return frappe.db.count(
		"Stock Ledger Entry",
		{
			"voucher_type": voucher_type,
			"voucher_no": voucher_no,
			"is_cancelled": 0,
		},
	)


def _gle_count(voucher_type: str, voucher_no: str) -> int:
	return frappe.db.count(
		"GL Entry",
		{
			"voucher_type": voucher_type,
			"voucher_no": voucher_no,
			"is_cancelled": 0,
		},
	)


def _requires_stock_verification(doc) -> bool:
	if doc.doctype in STOCK_DOCTYPES_ALWAYS:
		return bool(_stock_item_codes(doc))
	if doc.doctype in INVOICE_STOCK_DOCTYPES:
		return cint(getattr(doc, "update_stock", 0)) and bool(_stock_item_codes(doc))
	return False


def _requires_gl_verification(doc) -> bool:
	return doc.doctype in GL_DOCTYPES


def assert_submitted_side_effects(doc) -> None:
	"""Fail loudly if submit did not produce expected ledger entries."""
	if cint(doc.docstatus) != 1:
		frappe.throw(
			_("{0} was not submitted (docstatus={1})").format(doc.doctype, doc.docstatus),
			frappe.ValidationError,
		)

	if _requires_stock_verification(doc) and _sle_count(doc.doctype, doc.name) <= 0:
		frappe.throw(_(STOCK_MOVEMENT_ERROR.format(doctype=doc.doctype)), frappe.ValidationError)

	if _requires_gl_verification(doc) and _gle_count(doc.doctype, doc.name) <= 0:
		frappe.throw(_(GL_MOVEMENT_ERROR.format(doctype=doc.doctype)), frappe.ValidationError)


def native_submit(doc, *, force_update_stock: bool | None = None):
	"""
	Submit via ERPNext document API and verify side effects.

	force_update_stock: when True, set update_stock=1 before submit (POS sale/return).
	"""
	if force_update_stock is not None and doc.doctype in INVOICE_STOCK_DOCTYPES:
		if frappe.get_meta(doc.doctype).has_field("update_stock"):
			doc.update_stock = 1 if force_update_stock else doc.update_stock

	if cint(doc.docstatus) == 1:
		assert_submitted_side_effects(doc)
		return doc

	if cint(doc.docstatus) != 0:
		frappe.throw(
			_("Only draft {0} can be submitted").format(doc.doctype),
			frappe.ValidationError,
		)

	frappe.has_permission(doc.doctype, "submit", doc=doc, throw=True)
	doc.submit()
	doc.reload()
	assert_submitted_side_effects(doc)
	return doc


def document_response(doc) -> dict:
	out = {
		"name": doc.name,
		"doctype": doc.doctype,
		"docstatus": doc.docstatus,
		"status": getattr(doc, "status", None),
	}
	if hasattr(doc, "grand_total"):
		out["grand_total"] = doc.grand_total
	if hasattr(doc, "company"):
		out["company"] = doc.company
	if hasattr(doc, "update_stock"):
		out["update_stock"] = cint(doc.update_stock)
	if _requires_stock_verification(doc):
		out["stock_ledger_entries"] = _sle_count(doc.doctype, doc.name)
	if _requires_gl_verification(doc):
		out["gl_entries"] = _gle_count(doc.doctype, doc.name)
	return out


def _submit_named(name: str, doctype: str, **kwargs):
	if not name:
		frappe.throw(_("Document name is required"), frappe.ValidationError)
	if not doctype:
		frappe.throw(_("DocType is required"), frappe.ValidationError)
	doc = frappe.get_doc(doctype, name)
	doc = native_submit(doc, **kwargs)
	return document_response(doc)


_GENERIC_SUBMIT_ALLOWLIST = frozenset(
	{
		"Stock Entry",
		"Stock Reconciliation",
		"Delivery Note",
	}
)


@frappe.whitelist()
def submit_document(name, doctype):
	"""Generic native submit — restricted to non-sensitive document types.

	Use the specific typed wrappers (submit_pos_invoice, submit_purchase_receipt, etc.)
	for doctypes that go through approval workflows.
	"""
	if doctype not in _GENERIC_SUBMIT_ALLOWLIST:
		frappe.throw(
			_("Use the specific submit endpoint for {0}.").format(doctype),
			frappe.PermissionError,
		)
	return _submit_named(name, doctype)


@frappe.whitelist()
def submit_stock_entry(name):
	return _submit_named(name, "Stock Entry")


@frappe.whitelist()
def submit_stock_reconciliation(name):
	return _submit_named(name, "Stock Reconciliation")


@frappe.whitelist()
def submit_purchase_receipt(name):
	return _submit_named(name, "Purchase Receipt")


@frappe.whitelist()
def submit_purchase_invoice(name):
	return _submit_named(name, "Purchase Invoice")


@frappe.whitelist()
def submit_sales_invoice(name):
	return _submit_named(name, "Sales Invoice")


@frappe.whitelist()
def submit_pos_invoice(name):
	"""Draft POS sale invoice — forces update_stock before submit."""
	doc = frappe.get_doc("POS Invoice", name)
	if cint(getattr(doc, "is_return", 0)):
		frappe.throw(_("Use submit_pos_invoice_return for return documents"), frappe.ValidationError)
	doc = native_submit(doc, force_update_stock=True)
	return document_response(doc)


@frappe.whitelist()
def submit_pos_invoice_return(name):
	"""Draft POS return — stock reversal via native submit."""
	doc = frappe.get_doc("POS Invoice", name)
	if not cint(getattr(doc, "is_return", 0)):
		frappe.throw(_("Document is not a POS return"), frappe.ValidationError)
	doc = native_submit(doc, force_update_stock=True)
	return document_response(doc)


@frappe.whitelist()
def submit_delivery_note(name):
	return _submit_named(name, "Delivery Note")


@frappe.whitelist()
def submit_purchase_return(name):
	return _submit_named(name, "Purchase Return")


@frappe.whitelist()
def submit_payment_entry(name):
	return _submit_named(name, "Payment Entry")


@frappe.whitelist()
def submit_pos_opening_entry(name):
	return _submit_named(name, "POS Opening Entry")

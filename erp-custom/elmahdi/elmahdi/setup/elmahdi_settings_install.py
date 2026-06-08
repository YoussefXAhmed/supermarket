"""
Idempotent installer for `Elmahdi Settings` (Single) + the audit log
doctype. Runs via `after_migrate` so a fresh `bench migrate` brings the
SPA Settings Center fully online with sensible defaults.

Defaults are deliberately conservative:
    POS / Inventory / Purchasing / Finance / HR  → ON
    CRM / Delivery                                → OFF
    Backup                                        → OFF (Admin must opt in)
"""

from __future__ import annotations

import frappe


_DEFAULTS = {
	# Phase 3 — feature flags
	"enable_pos": 1,
	"enable_inventory": 1,
	"enable_purchasing": 1,
	"enable_finance": 1,
	"enable_hr": 1,
	"enable_crm": 0,
	"enable_delivery": 0,
	# Phase 3 — backup
	"backup_enabled": 0,
	"backup_frequency": "Daily",
	"backup_retention_days": 30,
	# Phase 4 — POS policy
	"pos_max_cash_per_shift": 50000,
	"pos_cash_drop_threshold": 25000,
	"pos_default_print_format": "Elmahdi POS Receipt 80mm",
	"pos_auto_print_default": 1,
	# Phase 4 — Inventory policy
	"inventory_transfer_max_value": 50000,
	"inventory_transfer_max_units_per_day": 1000,
	# Phase 4 — Purchasing policy
	"purchase_approval_threshold_low": 5000,
	"purchase_approval_threshold_mid": 20000,
	"purchase_approval_threshold_high": 100000,
	# Phase 4 — Finance policy
	"ap_overdue_scan_days": 30,
	"aging_buckets": "30,60,90,120",
	# Phase 4.a — Audit retention (nightly prune of Elmahdi Batch Audit).
	# Code clamps to a minimum of 30 days; 0 or NULL means "use default".
	"batch_audit_retention_days": 365,
}


def run() -> dict:
	"""Wired into hooks.after_migrate. Safe on every re-run."""
	# Confirm the Single doctype is registered.
	if not frappe.db.exists("DocType", "Elmahdi Settings"):
		return {"skipped": "Elmahdi Settings doctype not registered yet — migrate first"}

	# Get_single auto-creates the row if missing.
	doc = frappe.get_single("Elmahdi Settings")
	dirty = False
	for fieldname, default in _DEFAULTS.items():
		current = getattr(doc, fieldname, None)
		if current is None or current == "":
			setattr(doc, fieldname, default)
			dirty = True

	if dirty:
		doc.flags.ignore_permissions = True
		doc.save()
		frappe.db.commit()

	return {
		"single_present": True,
		"audit_doctype_present": frappe.db.exists("DocType", "Elmahdi Settings Audit") is not None,
		"applied_defaults": dirty,
	}

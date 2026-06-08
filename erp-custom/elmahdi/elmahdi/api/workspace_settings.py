"""
Workspace Settings dispatcher — Phase 4.

Per-workspace asserters gate read + write. Audit logging is shared with
Phase 3's `settings_audit.log_setting_change` so EVERY settings change in
the system (System Settings + Workspace Settings + Personal Settings
when Phase 5 lands) appears in the same audit history.

Pattern:
    get_workspace_section(workspace)            → {blocks: [...]}
    update_workspace_section(workspace, payload) → applies + audits

Workspaces:
    pos          — Edit a POS Profile (Auto Print, Receipt format, MOPs)
                   + POS policy fields on Elmahdi Settings (Cash limits).
    inventory    — Inventory policy on Elmahdi Settings
                   (transfer limits) + reorder defaults mirror.
    purchasing   — Purchasing policy on Elmahdi Settings (approval
                   thresholds) + Buying Settings subset.
    finance      — Finance policy on Elmahdi Settings (aging, AP scan)
                   + Accounts Settings payment-rule subset.
    hr           — Deep-links to existing HR Settings (LeaveType /
                   HolidayList / SalaryComponent catalogs). Plus a
                   read-only mirror of HRMS HR Settings + Payroll Settings.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import (
	assert_may_manage_pos_settings,
	assert_may_manage_inventory_settings,
	assert_may_manage_purchasing_settings,
	assert_may_manage_finance_settings,
	assert_may_manage_hr_settings,
)
from elmahdi.api.settings_audit import log_setting_change


# ── workspace → (asserter, blocks) map ───────────────────────────────────


# Each block: list of dicts {doctype, fields[, readonly_fields]}.
# `Elmahdi Settings` is the home for new policy fields; existing
# Frappe/ERPNext Singles are mirrored (mostly editable for the workspace
# manager).

WORKSPACES: dict[str, dict] = {
	"pos": {
		"assert": assert_may_manage_pos_settings,
		"blocks": [
			{
				"doctype": "Elmahdi Settings",
				"single": True,
				"fields": [
					"pos_max_cash_per_shift",
					"pos_cash_drop_threshold",
					"pos_default_print_format",
					"pos_auto_print_default",
				],
			},
		],
	},
	"inventory": {
		"assert": assert_may_manage_inventory_settings,
		"blocks": [
			{
				"doctype": "Elmahdi Settings",
				"single": True,
				"fields": [
					"inventory_transfer_max_value",
					"inventory_transfer_max_units_per_day",
				],
			},
			# Inventory manager may also tweak the auto-reorder defaults;
			# read-only mirror keeps the source clear (Stock Settings is
			# System-owned but reorder emails are a workspace concern).
			{
				"doctype": "Stock Settings",
				"single": True,
				"fields": ["auto_indent", "reorder_email_notify"],
			},
		],
	},
	"purchasing": {
		"assert": assert_may_manage_purchasing_settings,
		"blocks": [
			{
				"doctype": "Elmahdi Settings",
				"single": True,
				"fields": [
					"purchase_approval_threshold_low",
					"purchase_approval_threshold_mid",
					"purchase_approval_threshold_high",
				],
			},
			{
				"doctype": "Buying Settings",
				"single": True,
				"fields": [
					"po_required",
					"pr_required",
					"over_billing_allowance",
					"over_transfer_allowance",
				],
			},
		],
	},
	"finance": {
		"assert": assert_may_manage_finance_settings,
		"blocks": [
			{
				"doctype": "Elmahdi Settings",
				"single": True,
				"fields": [
					"ap_overdue_scan_days",
					"aging_buckets",
				],
			},
			{
				"doctype": "Accounts Settings",
				"single": True,
				"fields": [
					"unlink_payment_on_cancellation_of_invoice",
					"book_asset_depreciation_entry_automatically",
					"automatically_process_deferred_accounting_entry",
				],
			},
		],
	},
	"hr": {
		"assert": assert_may_manage_hr_settings,
		"blocks": [
			# HR Settings is HRMS-owned and Admin-managed in Phase 3.
			# Phase 4 lets HR managers tweak settings that affect their
			# daily ops but don't belong on the System security/finance
			# axis.
			{
				"doctype": "HR Settings",
				"single": True,
				"fields": [
					"emp_created_by",
					"standard_working_hours",
					"max_working_hours_against_timesheet",
					"send_leave_notification",
				],
			},
		],
	},
}


# ── helpers ──────────────────────────────────────────────────────────────


def _resolve_workspace(workspace: str) -> dict:
	if workspace not in WORKSPACES:
		frappe.throw(
			_("Unknown workspace: {0}").format(workspace),
			frappe.ValidationError,
		)
	return WORKSPACES[workspace]


def _is_writable(target: dict, field: str) -> bool:
	allowed = set(target.get("fields") or [])
	if field not in allowed:
		return False
	return field not in (target.get("readonly_fields") or [])


# ── public API ───────────────────────────────────────────────────────────


@frappe.whitelist()
def list_workspaces() -> list[dict]:
	"""All workspaces with settings pages — useful for nav badges."""
	return [{"workspace": k} for k in WORKSPACES.keys()]


@frappe.whitelist()
def get_workspace_section(workspace: str) -> dict:
	cfg = _resolve_workspace(workspace)
	cfg["assert"]()
	blocks: list[dict] = []
	for target in cfg["blocks"]:
		doctype = target["doctype"]
		if not frappe.db.exists("DocType", doctype):
			blocks.append({
				"doctype": doctype, "available": False,
				"values": {}, "fields": target["fields"],
			})
			continue
		doc = frappe.get_single(doctype) if target.get("single") else None
		values = {f: getattr(doc, f, None) for f in target["fields"]}
		blocks.append({
			"doctype": doctype, "available": True,
			"values": values, "fields": target["fields"],
			"readonly_fields": target.get("readonly_fields") or [],
		})
	return {"workspace": workspace, "blocks": blocks}


@frappe.whitelist(methods=["POST"])
def update_workspace_section(workspace: str, payload) -> dict:
	cfg = _resolve_workspace(workspace)
	cfg["assert"]()
	if isinstance(payload, str):
		import json
		try:
			payload = json.loads(payload)
		except Exception:
			frappe.throw(_("Invalid payload."), frappe.ValidationError)
	if not isinstance(payload, dict):
		frappe.throw(_("Payload must be an object."), frappe.ValidationError)

	by_doctype = {t["doctype"]: t for t in cfg["blocks"]}
	applied: list[dict] = []
	skipped: list[dict] = []

	# Audit "section" name = "<workspace>-workspace" so System Settings
	# rows and Workspace Settings rows are distinguishable in the audit
	# log search (the SPA filters by exact section).
	audit_section = f"{workspace}-workspace"

	for doctype, field_payload in payload.items():
		target = by_doctype.get(doctype)
		if not target:
			skipped.append({"doctype": doctype, "reason": "doctype not in workspace"})
			continue
		if not isinstance(field_payload, dict):
			skipped.append({"doctype": doctype, "reason": "field payload not an object"})
			continue
		if not frappe.db.exists("DocType", doctype):
			skipped.append({"doctype": doctype, "reason": "doctype not installed"})
			continue

		doc = frappe.get_single(doctype) if target.get("single") else None
		if doc is None:
			skipped.append({"doctype": doctype, "reason": "non-Single not supported"})
			continue

		dirty = False
		for field, new_value in field_payload.items():
			if not _is_writable(target, field):
				skipped.append({
					"doctype": doctype, "field": field,
					"reason": "field not in allowlist or read-only",
				})
				continue
			old_value = getattr(doc, field, None)
			if str(old_value) == str(new_value):
				continue
			setattr(doc, field, new_value)
			dirty = True
			log_setting_change(
				section=audit_section,
				setting_field=field,
				source_doctype=doctype,
				previous_value=old_value,
				new_value=new_value,
			)
			applied.append({
				"doctype": doctype, "field": field,
				"old": str(old_value) if old_value is not None else "",
				"new": str(new_value) if new_value is not None else "",
			})

		if dirty:
			doc.flags.ignore_permissions = True
			doc.save()

	frappe.db.commit()
	return {"workspace": workspace, "applied": applied, "skipped": skipped}


# ── HR catalogs (deep-link helpers) ──────────────────────────────────────


@frappe.whitelist()
def list_hr_catalogs() -> dict:
	"""Read-only counts for the HR settings page so HR sees what's there
	without leaving the page (then deep-links to ERPNext Desk for CRUD)."""
	cfg = _resolve_workspace("hr")
	cfg["assert"]()
	out = {}
	for dt in ("Leave Type", "Holiday List", "Salary Component", "Salary Structure"):
		if frappe.db.table_exists(f"tab{dt}"):
			out[dt] = int(frappe.db.count(dt) or 0)
		else:
			out[dt] = None
	return out

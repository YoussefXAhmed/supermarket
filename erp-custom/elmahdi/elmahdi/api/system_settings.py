"""
Global System Settings dispatcher — Phase 3.

The Settings Center has 12 sections. Each section maps to one or more
existing Frappe / ERPNext / HRMS Single doctypes plus, in two cases
(Backup + Feature Flags), the Elmahdi Settings Single. There is NO
duplicate storage — every value lives where ERPNext/Frappe already
stores it.

Public surface:

    get_section(section)              → {fields: {...}, source_doctype, label}
    update_section(section, payload)  → applies + audits

`update_section` reads each target field's current value BEFORE the
write, applies the new value, then asks `settings_audit.log_setting_change`
to persist the diff. A no-op (field present in payload with the same
value) is silently dropped from the audit log.

Permission gate: `assert_may_manage_system_settings` (Administrator-only).
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import assert_may_manage_system_settings
from elmahdi.api.settings_audit import log_setting_change


# ── section → source-doctype + allowed-field map ─────────────────────────
#
# Each section pulls from one OR MORE Frappe Singles. The allowed-field
# list is the field allowlist for that section — anything not in the list
# is rejected on write (defense in depth: a malicious payload can't poke
# arbitrary fields on the underlying Single).

SECTIONS: dict[str, list[dict]] = {
	# Company section pulls from Global Defaults (system-wide currency /
	# country / fiscal year) AND Company (per-tenant identity). The SPA
	# is multi-company-aware via the `company` argument on update.
	"company": [
		{
			"doctype": "Global Defaults",
			"single": True,
			"fields": [
				"default_company", "default_currency", "country",
				"default_fiscal_year", "date_format", "float_precision",
				"currency_precision", "default_distance_unit",
			],
		},
	],
	# Products — Stock Settings (item naming side) + Item Variant Settings.
	"products": [
		{
			"doctype": "Stock Settings",
			"single": True,
			"fields": [
				"item_naming_by", "item_naming_series",
				"default_warehouse", "default_valuation_method",
				"sample_retention_warehouse", "stock_uom",
			],
		},
		{
			"doctype": "Item Variant Settings",
			"single": True,
			"fields": ["allow_rename_attribute_value"],
		},
	],
	# Pricing — Selling Settings + Currency Exchange Settings (advanced).
	"pricing": [
		{
			"doctype": "Selling Settings",
			"single": True,
			"fields": [
				"cust_master_name", "customer_group", "territory",
				"selling_price_list", "maintain_same_sales_rate",
				"editable_price_list_rate", "allow_negative_rates_for_items",
				"validate_selling_price",
			],
		},
	],
	# Inventory — Stock Settings (inventory side) + Delivery + Stock Reposting.
	"inventory": [
		{
			"doctype": "Stock Settings",
			"single": True,
			"fields": [
				"allow_negative_stock", "auto_indent", "reorder_email_notify",
				"automatically_set_serial_nos_based_on_fifo",
				"set_qty_in_transactions_based_on_serial_no_input",
				"allow_partial_reservation", "valuation_method",
			],
		},
		{
			"doctype": "Delivery Settings",
			"single": True,
			"fields": ["send_dispatch_notification", "dispatch_template",
			           "delivery_template", "send_with_attachment"],
		},
		{
			"doctype": "Stock Reposting Settings",
			"single": True,
			"fields": ["limit_reposting_timeout", "item_based_reposting",
			           "limits_dont_apply_on"],
		},
	],
	# Finance — Accounts Settings + Buying Settings + POS Settings (global).
	"finance": [
		{
			"doctype": "Accounts Settings",
			"single": True,
			"fields": [
				"acc_frozen_upto", "frozen_accounts_modifier",
				"credit_controller", "make_payment_via_journal_entry",
				"unlink_payment_on_cancellation_of_invoice",
				"unlink_advance_payment_on_cancelation_of_order",
				"book_asset_depreciation_entry_automatically",
				"automatically_process_deferred_accounting_entry",
				"enable_common_party_accounting",
				"check_supplier_invoice_uniqueness",
			],
		},
		{
			"doctype": "Buying Settings",
			"single": True,
			"fields": [
				"supp_master_name", "buying_price_list", "po_required",
				"pr_required", "maintain_same_rate",
				"allow_multiple_items", "show_pay_button",
				"over_billing_allowance", "over_transfer_allowance",
			],
		},
		{
			"doctype": "POS Settings",
			"single": True,
			"fields": ["invoice_naming_series", "use_pos_in_offline_mode"],
		},
	],
	# Notifications — system Notification Settings + Push + SMS.
	"notifications": [
		{
			"doctype": "Push Notification Settings",
			"single": True,
			"fields": ["enable_push_notification_relay", "api_key"],
		},
		{
			"doctype": "SMS Settings",
			"single": True,
			"fields": ["sms_gateway_url", "message_parameter",
			           "receiver_parameter"],
		},
	],
	# Printing — Print Settings + Letter Head metadata (read-only list).
	"printing": [
		{
			"doctype": "Print Settings",
			"single": True,
			"fields": [
				"pdf_page_size", "pdf_page_height", "pdf_page_width",
				"font", "font_size", "with_letterhead",
				"repeat_header_footer", "compact_item_print",
				"print_taxes_with_zero_amount", "allow_print_for_draft",
				"allow_print_for_cancelled",
			],
		},
	],
	# Security — System Settings (security fields) + Security Settings +
	# Session Default Settings + Log Settings.
	"security": [
		{
			"doctype": "System Settings",
			"single": True,
			"fields": [
				"session_expiry", "session_expiry_mobile",
				"disable_user_pass_login", "force_user_to_reset_password",
				"allow_login_using_mobile_number",
				"allow_login_using_user_name",
				"deny_multiple_sessions", "enable_password_policy",
				"minimum_password_score",
				"app_name", "country", "language", "time_zone",
				"date_format", "time_format", "number_format",
			],
		},
		{
			"doctype": "Security Settings",
			"single": True,
			"fields": [
				"allow_login_after_fail", "allow_consecutive_login_attempts",
				"password_reset_limit", "session_timeout",
				"allow_older_web_view_links",
				"two_factor_method", "bypass_2fa_for_retricted_ip_users",
			],
		},
		{
			"doctype": "Log Settings",
			"single": True,
			"fields": ["clear_error_log_after", "clear_activity_log_after",
			           "clear_email_log_after"],
		},
	],
	# Backup — Elmahdi Settings (backup fields only).
	"backup": [
		{
			"doctype": "Elmahdi Settings",
			"single": True,
			"fields": ["backup_enabled", "backup_frequency",
			           "backup_retention_days", "last_backup_status",
			           "last_backup_at"],
			"readonly_fields": ["last_backup_status", "last_backup_at"],
		},
	],
	# Feature Flags — Elmahdi Settings (flag fields only).
	"feature-flags": [
		{
			"doctype": "Elmahdi Settings",
			"single": True,
			"fields": ["enable_pos", "enable_inventory", "enable_purchasing",
			           "enable_finance", "enable_hr", "enable_crm",
			           "enable_delivery"],
		},
	],
}


# Some sections are pure deep-links to existing SPA pages — they don't
# expose a form here. The SPA section components handle the deep-link UI.
# Listed here so list_sections() returns all 12.
DEEP_LINK_SECTIONS = ("branches", "users-roles")


# ── helpers ──────────────────────────────────────────────────────────────


def _resolve_field(target: dict, field: str) -> bool:
	allowed = set(target.get("fields") or [])
	return field in allowed


def _is_writable(target: dict, field: str) -> bool:
	if not _resolve_field(target, field):
		return False
	if field in (target.get("readonly_fields") or []):
		return False
	return True


# ── public API ───────────────────────────────────────────────────────────


@frappe.whitelist()
def list_sections() -> list[dict]:
	"""Catalog of every section the Settings Center exposes."""
	assert_may_manage_system_settings()
	out: list[dict] = []
	for key in list(SECTIONS.keys()) + list(DEEP_LINK_SECTIONS):
		out.append({
			"section": key,
			"deep_link": key in DEEP_LINK_SECTIONS,
		})
	# Stable section order — used by the left rail.
	order = ["company", "branches", "users-roles", "products", "pricing",
	         "inventory", "finance", "notifications", "printing", "security",
	         "backup", "feature-flags"]
	out.sort(key=lambda s: order.index(s["section"])
	         if s["section"] in order else 99)
	return out


@frappe.whitelist()
def get_section(section: str) -> dict:
	"""Return the merged read-only view of every Single backing this
	section. The SPA renders one form block per source doctype."""
	assert_may_manage_system_settings()
	if section in DEEP_LINK_SECTIONS:
		# These sections render link cards on the SPA — nothing to fetch.
		return {"section": section, "deep_link": True, "blocks": []}
	if section not in SECTIONS:
		frappe.throw(_("Unknown settings section: {0}").format(section),
		             frappe.ValidationError)

	blocks: list[dict] = []
	for target in SECTIONS[section]:
		doctype = target["doctype"]
		if not frappe.db.exists("DocType", doctype):
			# E.g. POS Settings absent on an erpnext-without-pos install.
			blocks.append({"doctype": doctype, "available": False,
			               "values": {}, "fields": target["fields"]})
			continue
		doc = frappe.get_single(doctype) if target.get("single") else None
		values = {f: getattr(doc, f, None) for f in target["fields"]}
		blocks.append({
			"doctype": doctype,
			"available": True,
			"values": values,
			"fields": target["fields"],
			"readonly_fields": target.get("readonly_fields") or [],
		})
	return {"section": section, "deep_link": False, "blocks": blocks}


@frappe.whitelist(methods=["POST"])
def update_section(section: str, payload) -> dict:
	"""Apply a payload of {doctype: {field: value}} updates to every
	allowed target in the section, audit-logging each diff.

	Payload shape (accepts dict or JSON string):
	    {
	        "Global Defaults": {"default_currency": "EGP"},
	        "System Settings": {"session_expiry": "08:00:00"},
	    }
	"""
	assert_may_manage_system_settings()
	if section not in SECTIONS:
		frappe.throw(_("Unknown settings section: {0}").format(section),
		             frappe.ValidationError)
	if isinstance(payload, str):
		import json
		try:
			payload = json.loads(payload)
		except Exception:
			frappe.throw(_("Invalid payload."), frappe.ValidationError)
	if not isinstance(payload, dict):
		frappe.throw(_("Payload must be an object."), frappe.ValidationError)

	# Build a lookup of {doctype: target} for this section.
	by_doctype = {t["doctype"]: t for t in SECTIONS[section]}

	applied: list[dict] = []
	skipped: list[dict] = []

	for doctype, field_payload in payload.items():
		target = by_doctype.get(doctype)
		if not target:
			skipped.append({"doctype": doctype, "reason": "doctype not in section"})
			continue
		if not isinstance(field_payload, dict):
			skipped.append({"doctype": doctype, "reason": "field payload not an object"})
			continue
		if not frappe.db.exists("DocType", doctype):
			skipped.append({"doctype": doctype, "reason": "doctype not installed"})
			continue

		doc = frappe.get_single(doctype) if target.get("single") else None
		if doc is None:
			skipped.append({"doctype": doctype, "reason": "non-Single targets not supported in Phase 3"})
			continue

		dirty = False
		for field, new_value in field_payload.items():
			if not _is_writable(target, field):
				skipped.append({"doctype": doctype, "field": field,
				                "reason": "field not in allowlist or read-only"})
				continue
			old_value = getattr(doc, field, None)
			if str(old_value) == str(new_value):
				continue  # no-op
			setattr(doc, field, new_value)
			dirty = True
			# Audit BEFORE save so we have the captured old value; the
			# audit row references no doc state beyond what we already
			# captured in the closure.
			log_setting_change(
				section=section,
				setting_field=field,
				source_doctype=doctype,
				previous_value=old_value,
				new_value=new_value,
			)
			applied.append({"doctype": doctype, "field": field,
			                "old": str(old_value) if old_value is not None else "",
			                "new": str(new_value) if new_value is not None else ""})

		if dirty:
			doc.flags.ignore_permissions = True
			doc.save()

	frappe.db.commit()
	return {"applied": applied, "skipped": skipped}

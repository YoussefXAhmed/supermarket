"""
Auxiliary System Settings endpoints — backup ops, company branding
cascade, capability matrix viewer, deep-link helpers.

These are NOT covered by the section dispatcher in `system_settings.py`
because each needs additional logic beyond "read a field / write a field
on a Single".
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import now_datetime

from elmahdi.api.spa_authorization import assert_may_manage_system_settings
from elmahdi.api.settings_audit import log_setting_change


# ── Company branding (Company logo + Letter Head image cascade) ──────────


@frappe.whitelist()
def list_companies():
	"""Administrator picklist — every Company on the site."""
	assert_may_manage_system_settings()
	return frappe.get_list(
		"Company",
		fields=["name", "company_name", "abbr", "country", "default_currency",
		        "tax_id", "phone_no", "email", "website",
		        "default_holiday_list", "company_logo"],
		order_by="company_name asc",
		limit_page_length=50,
	)


@frappe.whitelist()
def get_company(name: str):
	assert_may_manage_system_settings()
	if not frappe.db.exists("Company", name):
		frappe.throw(_("Company {0} not found.").format(name),
		             frappe.DoesNotExistError)
	doc = frappe.get_doc("Company", name)
	return {
		"name": doc.name,
		"company_name": doc.company_name,
		"abbr": doc.abbr,
		"country": doc.country,
		"default_currency": doc.default_currency,
		"tax_id": doc.tax_id,
		"phone_no": doc.phone_no,
		"email": doc.email,
		"website": doc.website,
		"default_holiday_list": doc.default_holiday_list,
		"company_logo": doc.company_logo or "",
	}


_COMPANY_WRITABLE = ("company_name", "abbr", "country", "default_currency",
                     "tax_id", "phone_no", "email", "website",
                     "default_holiday_list")


@frappe.whitelist(methods=["POST"])
def update_company(name: str, payload):
	"""Update the editable subset of a Company. Each changed field
	produces one Settings Audit entry under section='company'."""
	assert_may_manage_system_settings()
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("Payload must be an object."), frappe.ValidationError)
	if not frappe.db.exists("Company", name):
		frappe.throw(_("Company {0} not found.").format(name),
		             frappe.DoesNotExistError)
	doc = frappe.get_doc("Company", name)
	dirty = False
	for field, new_value in payload.items():
		if field not in _COMPANY_WRITABLE:
			continue
		old_value = getattr(doc, field, None)
		if str(old_value) == str(new_value):
			continue
		setattr(doc, field, new_value)
		dirty = True
		log_setting_change(
			section="company",
			setting_field=f"{name}.{field}",
			source_doctype="Company",
			previous_value=old_value,
			new_value=new_value,
		)
	if dirty:
		doc.flags.ignore_permissions = True
		doc.save()
	frappe.db.commit()
	return {"name": doc.name, "updated": dirty}


@frappe.whitelist(methods=["POST"])
def update_company_logo(company: str, logo_url: str):
	"""Cascade a logo update to Company.company_logo + the default
	Letter Head's image. Audit entry per write."""
	assert_may_manage_system_settings()
	if not frappe.db.exists("Company", company):
		frappe.throw(_("Company {0} not found.").format(company),
		             frappe.DoesNotExistError)

	prev_company_logo = frappe.db.get_value("Company", company, "company_logo")
	if prev_company_logo != logo_url:
		frappe.db.set_value("Company", company, "company_logo", logo_url)
		log_setting_change(
			section="company", setting_field=f"{company}.company_logo",
			source_doctype="Company",
			previous_value=prev_company_logo, new_value=logo_url,
		)

	# Also cascade to the Letter Head if one is marked default.
	default_lh = frappe.db.get_value("Letter Head",
	                                  {"is_default": 1, "disabled": 0}, "name")
	if default_lh:
		prev_lh_image = frappe.db.get_value("Letter Head", default_lh, "image")
		if prev_lh_image != logo_url:
			frappe.db.set_value("Letter Head", default_lh, "image", logo_url)
			log_setting_change(
				section="company", setting_field=f"{default_lh}.image",
				source_doctype="Letter Head",
				previous_value=prev_lh_image, new_value=logo_url,
			)

	frappe.db.commit()
	return {"company": company, "logo_url": logo_url, "letter_head": default_lh}


# ── Backup ───────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_backup_status():
	"""Current Elmahdi Settings backup fields + the most recent Frappe
	backup record if one exists in the site's `private/backups/` dir."""
	assert_may_manage_system_settings()
	s = frappe.get_single("Elmahdi Settings")
	return {
		"backup_enabled": int(s.backup_enabled or 0),
		"backup_frequency": s.backup_frequency or "Daily",
		"backup_retention_days": int(s.backup_retention_days or 30),
		"last_backup_status": s.last_backup_status or "",
		"last_backup_at": str(s.last_backup_at) if s.last_backup_at else "",
	}


@frappe.whitelist(methods=["POST"])
def trigger_backup_now():
	"""Synchronous backup using Frappe's standard backup helper. Updates
	the `last_backup_*` fields on Elmahdi Settings on success / failure."""
	assert_may_manage_system_settings()
	from frappe.utils.backups import new_backup

	try:
		backup = new_backup(
			ignore_files=False,
			force=True,
		)
		# `new_backup` returns either a BackupGenerator instance with
		# `backup_path_db` etc., or (rarely) a path string. Normalize.
		path = getattr(backup, "backup_path_db", None) or str(backup)
		status = f"OK: {path}"[:140]
	except Exception as e:  # noqa: BLE001
		status = f"FAIL: {str(e)[:200]}"

	when = now_datetime()
	# Write through frappe.db.set_value so we DON'T trigger doc-level
	# validation / hooks — these fields are read-only on the form, only
	# this endpoint and the scheduled job write to them.
	frappe.db.set_value("Elmahdi Settings", "Elmahdi Settings", {
		"last_backup_status": status,
		"last_backup_at": when,
	})
	# Audit (separate row per field so the diff is queryable).
	log_setting_change(
		section="backup", setting_field="last_backup_status",
		source_doctype="Elmahdi Settings",
		previous_value="(trigger)", new_value=status,
	)
	frappe.db.commit()
	return {"status": status, "at": str(when)}


# ── Feature Flags ────────────────────────────────────────────────────────


_FEATURE_FIELDS = ("enable_pos", "enable_inventory", "enable_purchasing",
                   "enable_finance", "enable_hr", "enable_crm",
                   "enable_delivery")


@frappe.whitelist()
def get_feature_flags():
	"""Returns the flag block from Elmahdi Settings as a dict."""
	assert_may_manage_system_settings()
	s = frappe.get_single("Elmahdi Settings")
	return {f: int(getattr(s, f, 0) or 0) for f in _FEATURE_FIELDS}


@frappe.whitelist(methods=["POST"])
def set_feature_flag(flag: str, enabled):
	"""Toggle a single flag (audited)."""
	assert_may_manage_system_settings()
	if flag not in _FEATURE_FIELDS:
		frappe.throw(_("Unknown feature flag: {0}").format(flag),
		             frappe.ValidationError)
	new_value = 1 if str(enabled) in ("1", "true", "True", "on", "yes") else 0
	prev_value = frappe.db.get_single_value("Elmahdi Settings", flag)
	if int(prev_value or 0) == new_value:
		return {"flag": flag, "value": new_value, "changed": False}
	frappe.db.set_value("Elmahdi Settings", "Elmahdi Settings",
	                    flag, new_value)
	log_setting_change(
		section="feature-flags", setting_field=flag,
		source_doctype="Elmahdi Settings",
		previous_value=prev_value, new_value=new_value,
	)
	frappe.db.commit()
	return {"flag": flag, "value": new_value, "changed": True}


# ── Capability matrix viewer (read-only — covers Phase 1 gap) ────────────


@frappe.whitelist()
def get_capability_matrix():
	"""Returns the role-profile × capability matrix as a read-only
	snapshot of the backend mirror in spa_authorization.py.

	Reads directly from the static `CAPS_BY_ROLE_PROFILE` dict — no
	dynamic role-discovery needed (and no fragile API surface either)."""
	assert_may_manage_system_settings()
	from elmahdi.api import spa_authorization as sa

	matrix: dict[str, dict[str, bool]] = {}
	# Skip alias profiles (they point to the same caps dict as their
	# canonical profile — would render duplicate columns).
	seen_ids: set[int] = set()
	for profile, caps in sa.CAPS_BY_ROLE_PROFILE.items():
		if id(caps) in seen_ids:
			continue
		seen_ids.add(id(caps))
		matrix[profile] = {k: bool(v) for k, v in (caps or {}).items()}

	return {
		"role_profiles": list(matrix.keys()),
		"caps_by_profile": matrix,
	}


# ── Letter Head + Print Format read-only catalog ────────────────────────


@frappe.whitelist()
def list_letter_heads():
	assert_may_manage_system_settings()
	return frappe.get_list(
		"Letter Head",
		fields=["name", "is_default", "disabled", "image", "header"],
		order_by="is_default desc, name asc",
		limit_page_length=50,
	)


@frappe.whitelist()
def list_print_formats():
	assert_may_manage_system_settings()
	return frappe.get_list(
		"Print Format",
		filters={"module": "Elmahdi"},
		fields=["name", "doc_type", "standard", "disabled", "html"],
		order_by="name asc",
		limit_page_length=50,
	)

"""
Settings audit log — append-only ledger of every change made through the
Settings Center.

Schema (Elmahdi Settings Audit doctype):
    section          — Settings Center section (e.g. "company", "security")
    setting_field    — fieldname on the target doctype (e.g. "session_expiry")
    source_doctype   — the underlying Frappe Single that holds the value
    changed_by       — User.name (session.user at write time)
    changed_at       — datetime
    previous_value   — serialized prior value (Long Text)
    new_value        — serialized new value (Long Text)

Writes are best-effort: an audit-log failure must NEVER block a settings
save. Reads are gated by `assert_may_manage_system_settings` to keep the
audit history Administrator-only (it can contain sensitive data like
masked password resets).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import now_datetime

from elmahdi.api.spa_authorization import assert_may_manage_system_settings


def _serialize(value) -> str:
	"""Convert any settings value to a stable, readable string for the
	audit log. We deliberately don't pretty-print structured values —
	plain str() round-trips fine and keeps the log diff-friendly."""
	if value is None:
		return ""
	if isinstance(value, (dict, list)):
		try:
			import json
			return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
		except Exception:  # noqa: BLE001
			return str(value)
	return str(value)


def log_setting_change(
	section: str,
	setting_field: str,
	source_doctype: str,
	previous_value,
	new_value,
) -> None:
	"""Insert one Elmahdi Settings Audit row. Best-effort — swallows any
	error so an audit-log failure never breaks the user's save."""
	try:
		prev_str = _serialize(previous_value)
		new_str = _serialize(new_value)
		# Skip no-op changes (e.g. saving a form without modifying a field).
		if prev_str == new_str:
			return
		frappe.get_doc({
			"doctype": "Elmahdi Settings Audit",
			"section": section,
			"setting_field": setting_field,
			"source_doctype": source_doctype,
			"changed_by": frappe.session.user,
			"changed_at": now_datetime(),
			"previous_value": prev_str,
			"new_value": new_str,
		}).insert(ignore_permissions=True)
	except Exception:  # noqa: BLE001
		# Audit-log failures must not propagate. Log via Frappe's error
		# log so operators can find them on the Desk.
		frappe.log_error(
			title="Settings audit log write failed",
			message=f"section={section!r} field={setting_field!r}\n\n{frappe.get_traceback()}",
		)


@frappe.whitelist()
def get_audit_log(
	section: str | None = None,
	setting_field: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	limit: int = 200,
):
	"""Return audit-log rows filtered by section/field/date range.
	Newest first. Administrator-only."""
	assert_may_manage_system_settings()
	filters: list = []
	if section:
		filters.append(["section", "=", section])
	if setting_field:
		filters.append(["setting_field", "=", setting_field])
	if from_date:
		filters.append(["changed_at", ">=", str(from_date)])
	if to_date:
		filters.append(["changed_at", "<=", str(to_date) + " 23:59:59"])

	rows = frappe.get_list(
		"Elmahdi Settings Audit",
		filters=filters,
		fields=["name", "section", "setting_field", "source_doctype",
		        "changed_by", "changed_at", "previous_value", "new_value"],
		order_by="changed_at desc",
		limit_page_length=int(limit or 200),
	)
	for r in rows:
		if r.get("changed_at"):
			r["changed_at"] = str(r["changed_at"])
	return rows

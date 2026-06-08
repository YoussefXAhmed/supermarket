"""
Phase 5 — install 6 Elmahdi-owned custom fields on the User doctype.

Each field is per-user, set by the user themselves through the SPA
Personal Settings page (`/me/*`). All fields are optional with sane
defaults; nothing here is blocking.

Idempotent — re-running only updates metadata, never deletes values.
"""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PERSONAL_FIELDS = {
	"User": [
		{
			"fieldname": "elmahdi_personal_section",
			"label": "Elmahdi — Personal Preferences",
			"fieldtype": "Section Break",
			"insert_after": "language",
			"collapsible": 1,
		},
		# Notifications
		{
			"fieldname": "elmahdi_notification_sound",
			"label": "Notification Sound",
			"fieldtype": "Check",
			"default": "1",
			"insert_after": "elmahdi_personal_section",
			"description": "Play a short sound when a desktop notification arrives.",
		},
		# Printing
		{
			"fieldname": "elmahdi_default_printer",
			"label": "Default Printer",
			"fieldtype": "Data",
			"insert_after": "elmahdi_notification_sound",
			"description": "Preferred Network Printer Settings name (optional).",
		},
		{
			"fieldname": "elmahdi_auto_print_override",
			"label": "Auto-Print Override",
			"fieldtype": "Select",
			"options": "Use POS Profile\nAlways\nNever",
			"default": "Use POS Profile",
			"insert_after": "elmahdi_default_printer",
			"description": "Overrides the POS Profile auto-print flag for this user.",
		},
	],
}


# Custom fields no longer wanted (cancelled by user request). The
# installer drops them on every run so the cleanup is idempotent.
_DROPPED_FIELDS = (
	("User", "elmahdi_spa_theme"),
	("User", "elmahdi_accent_color"),
	("User", "elmahdi_sidebar_mode"),
)


def _drop_field(doctype: str, fieldname: str) -> bool:
	"""Remove the Custom Field record AND drop the DB column. Returns
	True if either the record or the column was removed."""
	removed = False
	name = frappe.db.get_value(
		"Custom Field",
		{"dt": doctype, "fieldname": fieldname},
		"name",
	)
	if name:
		frappe.delete_doc("Custom Field", name, ignore_permissions=True, force=1)
		removed = True
	# Frappe does NOT auto-drop the column when a Custom Field is deleted
	# — do it explicitly. Wrap in try because re-runs find no column.
	try:
		col_exists = frappe.db.sql(
			"""
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = DATABASE()
			  AND table_name = %s AND column_name = %s
			""",
			(f"tab{doctype}", fieldname),
		)
		if col_exists:
			frappe.db.sql_ddl(
				f"ALTER TABLE `tab{doctype}` DROP COLUMN `{fieldname}`"
			)
			removed = True
	except Exception:  # noqa: BLE001
		pass
	return removed


def run() -> dict:
	dropped = []
	for dt, fn in _DROPPED_FIELDS:
		if _drop_field(dt, fn):
			dropped.append(f"{dt}.{fn}")
	create_custom_fields(PERSONAL_FIELDS, update=True)
	frappe.db.commit()
	return {
		"installed": [
			"User.elmahdi_notification_sound",
			"User.elmahdi_default_printer",
			"User.elmahdi_auto_print_override",
		],
		"dropped": dropped,
	}

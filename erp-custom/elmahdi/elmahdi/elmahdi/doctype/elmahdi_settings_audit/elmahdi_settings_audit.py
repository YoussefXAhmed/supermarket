"""Elmahdi Settings Audit — one row per settings change. Append-only;
the doctype JSON forbids write + delete in the Admin perm row."""

from frappe.model.document import Document


class ElmahdiSettingsAudit(Document):
	pass

"""Elmahdi Settings — Single doctype holding workspace policy + feature
flags. Writes are always routed through the audit-logging dispatcher in
`elmahdi.api.system_settings` so changes appear in the audit log."""

from frappe.model.document import Document


class ElmahdiSettings(Document):
	"""No controller logic — fields validated by Frappe's standard
	doctype validators. The settings dispatcher is responsible for
	audit logging."""

	pass

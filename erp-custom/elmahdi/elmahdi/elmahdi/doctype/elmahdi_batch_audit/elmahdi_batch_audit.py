"""Elmahdi Batch Audit — one row per batch (or significant single-doc)
operation across the ERP. Append-only by design; the doctype JSON
forbids write + delete in every Read role. Only the internal helper
`elmahdi.api.audit.write_batch_audit` inserts rows (via
`ignore_permissions=True`).

Retention is enforced by the nightly scheduled job
`elmahdi.api.audit.prune_expired_audits` per the policy stored on
`Elmahdi Settings.batch_audit_retention_days`. Rows with
`retention_locked = 1` are skipped (incident / regulatory hold).
"""

from __future__ import annotations

from frappe.model.document import Document


class ElmahdiBatchAudit(Document):
	pass

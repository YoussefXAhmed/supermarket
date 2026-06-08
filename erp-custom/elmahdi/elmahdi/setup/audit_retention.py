"""Audit retention policy reader.

Reads `Elmahdi Settings.batch_audit_retention_days` and clamps to a safe
range. Code enforces the policy even if a misconfigured value (0,
negative, or below the documented minimum) is stored.

Defaults: 365 days. Minimum: 30 days. No upper cap — operators may keep
audits indefinitely if they intentionally raise the value.
"""

from __future__ import annotations

DEFAULT_RETENTION_DAYS = 365
MIN_RETENTION_DAYS = 30


def get_retention_days() -> int:
	"""Return the effective retention window in days.

	Reads the configured value from the `Elmahdi Settings` single. If the
	field is missing, NULL, zero, or below `MIN_RETENTION_DAYS`, returns
	the safe default (365). Never returns less than `MIN_RETENTION_DAYS`.
	"""
	import frappe  # local import — avoids loading frappe at module import

	try:
		raw = frappe.db.get_single_value("Elmahdi Settings", "batch_audit_retention_days")
	except Exception:  # noqa: BLE001
		return DEFAULT_RETENTION_DAYS
	try:
		val = int(raw or 0)
	except (TypeError, ValueError):
		val = 0
	if val <= 0:
		return DEFAULT_RETENTION_DAYS
	if val < MIN_RETENTION_DAYS:
		return MIN_RETENTION_DAYS
	return val

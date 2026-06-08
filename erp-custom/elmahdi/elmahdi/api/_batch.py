"""Internal batch-runner helper.

Every Phase 4 batch endpoint wraps its per-row work in `run_row_batch`.
The helper enforces D4 (atomic-per-row, never all-or-nothing): one bad
row never aborts the rest of the batch. Per-row outcomes are collected,
the audit row is written via `audit.write_batch_audit`, and the
unified result envelope is returned to the SPA.

Design contract:
  - `items` is the parsed request payload (list of dicts or strings).
  - `row_fn(item, index) -> dict | None` does the actual mutation. It
    receives the original item and its zero-based index, and returns a
    dict with at least `{"name": <str>}`. Any other returned keys are
    preserved in the result envelope so callers can surface extra info
    (e.g. created Payment Entry name).
  - Any exception raised by `row_fn` is caught and recorded as a
    row-level failure with a stable, user-readable error string. The
    rest of the batch continues.
  - `max_size` defends against runaway requests; default 200, matching
    the plan's stated cap.

Return shape:
    {
        "audit_id": "BA-2026-06-...",
        "total": 7,
        "succeeded": 5,
        "failed": 2,
        "results": [
            {"name": "PR-001", "ok": True, ...},
            {"name": "PR-002", "ok": False, "error": "Not in your branch scope"},
            ...
        ],
    }
"""

from __future__ import annotations

from typing import Any, Callable

import frappe
from frappe.utils import now_datetime

from elmahdi.api.audit import write_batch_audit


DEFAULT_MAX_BATCH_SIZE = 200


def _coerce_name(item: Any, index: int) -> str:
	"""Best-effort identifier extraction so a failure on an empty/malformed
	row still surfaces something useful in the audit trail."""
	if isinstance(item, dict):
		for key in ("name", "id", "docname", "doc"):
			if item.get(key):
				return str(item[key])[:140]
	if isinstance(item, str):
		return item[:140]
	return f"row#{index}"


def _safe_error_message(exc: BaseException) -> str:
	"""Extract a stable, user-facing error string from any exception."""
	if isinstance(exc, frappe.exceptions.ValidationError):
		return str(exc) or "Validation error"
	if isinstance(exc, frappe.exceptions.PermissionError):
		return str(exc) or "Permission denied"
	if isinstance(exc, frappe.exceptions.DoesNotExistError):
		return str(exc) or "Document not found"
	msg = str(exc) or exc.__class__.__name__
	# Trim verbose tracebacks if a caller accidentally raised one as text.
	return msg.splitlines()[0][:280]


def run_row_batch(
	items: list,
	row_fn: Callable[[Any, int], dict | None],
	action: str,
	doctype: str,
	*,
	max_size: int = DEFAULT_MAX_BATCH_SIZE,
	summary_extra: dict | None = None,
) -> dict:
	"""Execute `row_fn` over every item, recording per-row outcomes and
	writing a single Batch Audit row at the end.

	Raises `frappe.exceptions.ValidationError` only for envelope-level
	problems (`items` not a list; over `max_size`). Per-row exceptions
	are captured, not raised.
	"""
	if items is None:
		items = []
	if not isinstance(items, list):
		frappe.throw(frappe._("Batch payload must be a list."))
	if len(items) > max_size:
		frappe.throw(
			frappe._(
				"Batch size {0} exceeds the maximum of {1}. Submit in smaller chunks."
			).format(len(items), max_size)
		)

	started_at = now_datetime()
	results: list[dict] = []
	for index, item in enumerate(items):
		try:
			outcome = row_fn(item, index) or {}
			if not isinstance(outcome, dict):
				outcome = {"value": outcome}
			row = {
				"name": outcome.get("name") or _coerce_name(item, index),
				"ok": True,
			}
			for k, v in outcome.items():
				if k not in row:
					row[k] = v
			results.append(row)
		except Exception as exc:  # noqa: BLE001
			results.append(
				{
					"name": _coerce_name(item, index),
					"ok": False,
					"error": _safe_error_message(exc),
				}
			)
			# Per-row exception must not poison subsequent rows. Roll
			# back any partial DB writes made for THIS row only.
			try:
				frappe.db.rollback()
			except Exception:  # noqa: BLE001
				pass

	succeeded = sum(1 for r in results if r["ok"])
	failed = len(results) - succeeded
	audit_id = write_batch_audit(
		action=action,
		target_doctype=doctype,
		items=results,
		summary=summary_extra or {},
		started_at=started_at,
	)
	return {
		"audit_id": audit_id,
		"total": len(results),
		"succeeded": succeeded,
		"failed": failed,
		"results": results,
	}

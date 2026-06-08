"""Centralized audit logging for batch and significant single-doc
operations across the ERP.

Two writers:
  - `write_batch_audit(...)` — one row per batch submission.
  - `write_single_audit(...)` — same shape but `total=1`, for one-doc
    operations where we still want unified queryability.

One pruner:
  - `prune_expired_audits()` — invoked nightly by the scheduler; deletes
    rows older than the configured retention window (default 365 days)
    UNLESS `retention_locked = 1`. Bounded by a 100k-row safety cap per
    run.

Per-row audits on individual transactions (Payment Entry's
`elmahdi_payment_audit` JSON field, Purchase Receipt's
`purchase_rate_audit`, Invoice Matching's `invoice_matching_audit`)
remain the source of truth for transaction-level detail. The Batch
Audit doctype indexes the *operation envelope* for compliance queries.

All writes are best-effort — an audit-log failure must NEVER block the
underlying user action. Failures route to `frappe.log_error`.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

import frappe
from frappe.utils import now_datetime

from elmahdi.setup.audit_retention import get_retention_days

# Cap the JSON payload to defend against malformed callers passing huge
# error tracebacks or row dumps. 64KB is plenty for ~500 row outcomes.
MAX_SUMMARY_BYTES = 64 * 1024

# Safety cap on rows deleted in one prune run. If a misconfigured value
# would delete more, we log + abort so an operator notices.
PRUNE_SAFETY_CAP = 100_000


# ── Private helpers ─────────────────────────────────────────────────────


def _actor() -> str:
	return frappe.session.user or "Administrator"


def _actor_branch_snapshot(user: str | None = None) -> str:
	"""Snapshot the actor's User-Permission warehouses at write time.

	Stored as a comma-joined string. Frozen — does NOT update if the
	user's branch assignment changes after the audit row is written.
	Empty string for users without any User Permission on Warehouse
	(typical for break-glass Administrators).
	"""
	u = user or frappe.session.user
	if not u or u in ("Guest",):
		return ""
	try:
		rows = frappe.db.sql(
			"""
			SELECT for_value FROM `tabUser Permission`
			WHERE user = %s AND allow = 'Warehouse'
			ORDER BY for_value
			""",
			(u,),
		)
		return ",".join(r[0] for r in rows if r and r[0])
	except Exception:  # noqa: BLE001
		return ""


def _safe_json(payload: Any) -> str:
	"""Serialize to JSON, truncating if oversize. Never raises."""
	try:
		s = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
	except Exception:  # noqa: BLE001
		try:
			s = json.dumps({"error": "summary_not_serializable", "repr": repr(payload)[:512]})
		except Exception:  # noqa: BLE001
			s = '{"error":"summary_not_serializable"}'
	if len(s.encode("utf-8")) > MAX_SUMMARY_BYTES:
		# Hard truncate. Keep the prefix; append a marker so consumers
		# know the payload was trimmed.
		s = s.encode("utf-8")[: MAX_SUMMARY_BYTES - 64].decode("utf-8", errors="ignore")
		s += '..."<truncated>"'
	return s


def _log_failure(context: str, exc: BaseException | None = None) -> None:
	try:
		frappe.log_error(
			title=f"Batch audit write failed — {context}",
			message=frappe.get_traceback() if exc is not None else context,
		)
	except Exception:  # noqa: BLE001
		# If even error-logging fails there is nothing we can safely do.
		pass


# ── Public writers ──────────────────────────────────────────────────────


def write_batch_audit(
	action: str,
	target_doctype: str,
	items: Iterable[dict],
	summary: dict | None = None,
	actor: str | None = None,
	*,
	started_at=None,
) -> str | None:
	"""Append one Elmahdi Batch Audit row for a batch operation.

	Parameters
	----------
	action : str
	    Operation key in `<area>.<verb>` form (e.g. `purchase.batch_approve`,
	    `user.batch_disable`, `payment.batch_create`). Stored verbatim; pick
	    a stable taxonomy.
	target_doctype : str
	    The Frappe DocType this batch acted on. Must be a real DocType name
	    — the audit row's Link field will reject unknown values.
	items : Iterable[dict]
	    Per-row outcomes. Each dict should carry at minimum `{name, ok}`
	    and optionally `error` and `audit_id`. The shape is enforced by
	    `run_row_batch` but kept open here so other call-sites can write
	    directly.
	summary : dict, optional
	    Sanitized request body / metadata. Passwords + tokens must already
	    be stripped by the caller. Stored under `summary_json.params`.
	actor : str, optional
	    Override the default `frappe.session.user`. Used by background
	    jobs that run as the system user but record activity on behalf
	    of another user (rare).
	started_at : datetime, optional
	    When the batch started. Defaults to `now_datetime()` if missing.

	Returns
	-------
	str | None
	    The created audit row name, or None on failure. Failure is
	    swallowed — callers must NOT depend on this return value to gate
	    user feedback.
	"""
	try:
		items_list = list(items or [])
		succeeded = sum(1 for r in items_list if r and r.get("ok"))
		failed = sum(1 for r in items_list if r and not r.get("ok"))
		total = len(items_list)
		now = now_datetime()
		doc = frappe.get_doc(
			{
				"doctype": "Elmahdi Batch Audit",
				"action": (action or "")[:64],
				"target_doctype": target_doctype,
				"actor": actor or _actor(),
				"actor_branch": _actor_branch_snapshot(actor)[:140],
				"started_at": started_at or now,
				"completed_at": now,
				"total": total,
				"succeeded": succeeded,
				"failed": failed,
				"retention_locked": 0,
				"summary_json": _safe_json(
					{
						"results": items_list,
						"params": summary or {},
					}
				),
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name
	except Exception as exc:  # noqa: BLE001
		_log_failure(f"write_batch_audit action={action!r}", exc)
		return None


def write_single_audit(
	action: str,
	target_doctype: str,
	target_name: str,
	before: Any = None,
	after: Any = None,
	actor: str | None = None,
) -> str | None:
	"""Append one Elmahdi Batch Audit row representing a single-document
	operation that we still want indexed in the unified audit table.

	Wraps the row payload into the same shape as a batch of size 1 so
	compliance queries don't need a separate code path.
	"""
	return write_batch_audit(
		action=action,
		target_doctype=target_doctype,
		items=[{"name": target_name, "ok": True}],
		summary={"before": before, "after": after},
		actor=actor,
	)


# ── Prune job ───────────────────────────────────────────────────────────


def prune_expired_audits() -> dict:
	"""Delete audit rows older than the configured retention window.

	Skips rows with `retention_locked = 1`. Aborts (no deletion) if the
	candidate set is larger than `PRUNE_SAFETY_CAP` — that's a strong
	signal of misconfiguration. Logs a structured summary either way.

	Returns a dict so the scheduler entry produces a useful log line:
	    {"ran_at": ..., "retention_days_used": 365,
	     "candidate_count": N, "deleted": M, "skipped_locked": K,
	     "aborted": bool, "reason": str | None}
	"""
	logger = frappe.logger("audit_prune")
	ran_at = now_datetime()
	retention_days = get_retention_days()
	result = {
		"ran_at": str(ran_at),
		"retention_days_used": retention_days,
		"candidate_count": 0,
		"deleted": 0,
		"skipped_locked": 0,
		"aborted": False,
		"reason": None,
	}
	try:
		candidate_rows = frappe.db.sql(
			"""
			SELECT name, retention_locked FROM `tabElmahdi Batch Audit`
			WHERE completed_at < (NOW() - INTERVAL %s DAY)
			""",
			(int(retention_days),),
			as_dict=True,
		)
		result["candidate_count"] = len(candidate_rows)
		deletable = [r["name"] for r in candidate_rows if not r.get("retention_locked")]
		result["skipped_locked"] = result["candidate_count"] - len(deletable)
		if len(deletable) > PRUNE_SAFETY_CAP:
			result["aborted"] = True
			result["reason"] = (
				f"candidate count {len(deletable)} exceeds safety cap "
				f"{PRUNE_SAFETY_CAP} — review retention configuration."
			)
			logger.error(result)
			_log_failure(result["reason"])
			return result
		if deletable:
			# Use a single parameterized DELETE; chunk if very large
			# (DB drivers may not love 100k IN-params).
			chunk_size = 5_000
			for i in range(0, len(deletable), chunk_size):
				chunk = deletable[i : i + chunk_size]
				placeholders = ", ".join(["%s"] * len(chunk))
				frappe.db.sql(
					f"DELETE FROM `tabElmahdi Batch Audit` WHERE name IN ({placeholders})",
					tuple(chunk),
				)
			frappe.db.commit()
			result["deleted"] = len(deletable)
		logger.info(result)
		return result
	except Exception as exc:  # noqa: BLE001
		result["aborted"] = True
		result["reason"] = f"exception: {exc!s}"
		_log_failure("prune_expired_audits", exc)
		return result

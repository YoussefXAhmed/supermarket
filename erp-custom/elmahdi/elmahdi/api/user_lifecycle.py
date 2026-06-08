"""User lifecycle state machine.

Five states, stored in the custom field `User.elmahdi_lifecycle_state`:

  - **Invited**     — invitation token exists, account not yet activated
                      (`enabled = 0`).
  - **Active**      — `enabled = 1`; normal operating state.
  - **Locked**      — temporarily blocked from login. Causes: repeated
                      failed token attempts during reset, manual lock by
                      admin, security review. Cleared by admin action
                      or by a successful password reset via token.
  - **Disabled**    — admin-suspended (`enabled = 0`, no invitation
                      pending). Re-activatable.
  - **Terminated**  — permanent end-of-life. Soft-delete semantics — the
                      row is preserved for audit but cannot be re-enabled
                      without explicit Admin override (audit-logged).

The FSM is intentionally conservative: any transition not enumerated in
`_ALLOWED_TRANSITIONS` raises `PermissionError`. New flows must amend
this table explicitly.
"""

from __future__ import annotations

from typing import Iterable

import frappe
from frappe import _

LIFECYCLE_FIELD = "elmahdi_lifecycle_state"

STATE_INVITED = "Invited"
STATE_ACTIVE = "Active"
STATE_LOCKED = "Locked"
STATE_DISABLED = "Disabled"
STATE_TERMINATED = "Terminated"

ALL_STATES = (
	STATE_INVITED,
	STATE_ACTIVE,
	STATE_LOCKED,
	STATE_DISABLED,
	STATE_TERMINATED,
)

# FSM. Keyed by from-state; values are the legal to-states.
_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
	STATE_INVITED:    frozenset({STATE_ACTIVE, STATE_DISABLED}),
	STATE_ACTIVE:     frozenset({STATE_LOCKED, STATE_DISABLED, STATE_TERMINATED}),
	STATE_LOCKED:     frozenset({STATE_ACTIVE, STATE_DISABLED, STATE_TERMINATED}),
	STATE_DISABLED:   frozenset({STATE_ACTIVE, STATE_TERMINATED}),
	# Terminal — only the Admin override path may re-enable.
	STATE_TERMINATED: frozenset(),
}

# Override paths that bypass the FSM (must still be audited at the
# call-site). Callers pass `override=True` explicitly so the bypass is
# never accidental.
_OVERRIDE_TRANSITIONS: dict[str, frozenset[str]] = {
	STATE_TERMINATED: frozenset({STATE_ACTIVE}),
}


# ── FSM helpers ─────────────────────────────────────────────────────────


def assert_lifecycle_transition_allowed(
	from_state: str,
	to_state: str,
	*,
	override: bool = False,
) -> None:
	"""Raise PermissionError if the transition is not legal.

	With `override=True`, allows the documented Admin-only revival paths
	(currently only Terminated → Active). The caller is responsible for
	asserting the actor's authority before passing override=True; this
	helper performs the FSM check only.
	"""
	frm = (from_state or "").strip()
	to = (to_state or "").strip()
	if frm not in ALL_STATES:
		frappe.throw(
			_("Unknown source lifecycle state: {0}").format(frm or "<empty>"),
			frappe.PermissionError,
		)
	if to not in ALL_STATES:
		frappe.throw(
			_("Unknown target lifecycle state: {0}").format(to or "<empty>"),
			frappe.PermissionError,
		)
	if to in _ALLOWED_TRANSITIONS.get(frm, frozenset()):
		return
	if override and to in _OVERRIDE_TRANSITIONS.get(frm, frozenset()):
		return
	frappe.throw(
		_("Lifecycle transition {0} → {1} is not permitted.").format(frm, to),
		frappe.PermissionError,
	)


# ── Derivation (used by the backfill patch and re-syncs) ────────────────


def derive_lifecycle_state(user_row: dict) -> str:
	"""Compute the expected lifecycle state for an existing User row.

	`user_row` may be a raw dict (DB row), a `frappe._dict`, or a full
	User document; we only read a few fields by `.get`.

	Rules (in order):
	  1. enabled = 1                                              → Active
	  2. enabled = 0  + linked Employee.status in (Left|Terminated) → Terminated
	  3. enabled = 0  + active Elmahdi User Invitation pending     → Invited
	  4. enabled = 0  otherwise                                    → Disabled
	"""
	enabled = int(user_row.get("enabled") or 0)
	if enabled == 1:
		return STATE_ACTIVE
	# Disabled path. Check for terminated employee link first.
	username = user_row.get("name") or user_row.get("email")
	if username:
		try:
			emp_status = frappe.db.get_value(
				"Employee", {"user_id": username}, "status"
			)
			if emp_status and emp_status in ("Left", "Terminated"):
				return STATE_TERMINATED
		except Exception:  # noqa: BLE001
			pass
		# Invitation doctype only exists after Phase 4.d ships. Guard with
		# table-existence check so this function is safe to call before then.
		try:
			if frappe.db.table_exists("Elmahdi User Invitation"):
				pending = frappe.db.get_value(
					"Elmahdi User Invitation",
					{"email": username, "state": "Pending"},
					"name",
				)
				if pending:
					return STATE_INVITED
		except Exception:  # noqa: BLE001
			pass
	return STATE_DISABLED


# ── State accessors ─────────────────────────────────────────────────────


def get_lifecycle_state(user_name: str) -> str | None:
	"""Return the stored lifecycle state for a user, or None if the
	custom field hasn't been installed yet (pre-migration)."""
	try:
		return frappe.db.get_value("User", user_name, LIFECYCLE_FIELD)
	except Exception:  # noqa: BLE001
		return None


def set_lifecycle_state(
	user_name: str,
	new_state: str,
	*,
	reason: str | None = None,
	override: bool = False,
) -> str:
	"""Transition a user to `new_state`, enforcing the FSM.

	Writes the new state via `frappe.db.set_value` (no full doc save,
	avoids cascading hooks). Emits a Batch Audit row via
	`write_single_audit` so every transition is queryable.
	"""
	from elmahdi.api.audit import write_single_audit

	if new_state not in ALL_STATES:
		frappe.throw(
			_("Unknown target lifecycle state: {0}").format(new_state),
			frappe.PermissionError,
		)
	current = get_lifecycle_state(user_name) or STATE_ACTIVE
	assert_lifecycle_transition_allowed(current, new_state, override=override)
	frappe.db.set_value("User", user_name, LIFECYCLE_FIELD, new_state)
	write_single_audit(
		action="user.lifecycle_transition",
		target_doctype="User",
		target_name=user_name,
		before={"state": current},
		after={"state": new_state, "reason": reason, "override": bool(override)},
	)
	return new_state


def states_for_filter(states: Iterable[str]) -> list[str]:
	"""Whitelist + de-duplicate an external list of state strings for
	use in SQL filters. Silently drops unknown values."""
	out: list[str] = []
	for s in states or ():
		if s in ALL_STATES and s not in out:
			out.append(s)
	return out

"""Phase 4.a — install the User lifecycle custom field and backfill it.

Adds `User.elmahdi_lifecycle_state` (Select; one of Invited / Active /
Locked / Disabled / Terminated; default Active) if missing, then sets
each existing User row's state to the value computed by
`derive_lifecycle_state`.

Idempotent. Safe to re-run:
  - If the Custom Field record already exists, `create_custom_fields`
    only refreshes metadata (it does not overwrite data).
  - The backfill is gated on `state IS NULL OR state = ''`, so rows
    written by Phase 4.d (which already sets Invited / Active
    correctly) are NOT clobbered on a second pass.
"""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from elmahdi.api.user_lifecycle import (
	ALL_STATES,
	LIFECYCLE_FIELD,
	STATE_ACTIVE,
	derive_lifecycle_state,
)


_FIELD_SPEC = {
	"User": [
		{
			"fieldname": LIFECYCLE_FIELD,
			"label": "Elmahdi Lifecycle State",
			"fieldtype": "Select",
			"options": "\n".join(ALL_STATES),
			"default": STATE_ACTIVE,
			"insert_after": "enabled",
			"read_only": 1,
			"description": (
				"Set by the Elmahdi user-lifecycle FSM. Do not edit by hand — "
				"use the SPA admin tools so transitions are audit-logged."
			),
		}
	]
}


def _existing_users() -> list[dict]:
	# Fetch only what we need; avoid pulling 50+ columns from `tabUser`.
	return frappe.db.sql(
		f"""
		SELECT name, email, enabled, COALESCE({LIFECYCLE_FIELD}, '') AS state
		FROM `tabUser`
		WHERE name NOT IN ('Guest', 'Administrator')
		""",
		as_dict=True,
	)


def execute() -> dict:
	"""Patch entry point — bench migrate finds this via patches.txt."""
	# Step 1: install / refresh the custom field. `update=True` makes the
	# call idempotent.
	create_custom_fields(_FIELD_SPEC, update=True)
	# A commit between schema work and data work keeps the migration
	# transcript readable if the data backfill needs to be retried.
	frappe.db.commit()

	# Step 2: backfill. Only fill rows whose state is empty so a second
	# run of the patch doesn't overwrite states already managed by
	# higher-level Phase 4 flows.
	updated = 0
	skipped = 0
	failed: list[str] = []
	for row in _existing_users():
		if row.get("state"):
			skipped += 1
			continue
		try:
			state = derive_lifecycle_state(row)
			frappe.db.set_value("User", row["name"], LIFECYCLE_FIELD, state)
			updated += 1
		except Exception:  # noqa: BLE001
			failed.append(row["name"])
			# Patch failure should never poison the whole migration —
			# log + continue so the operator can fix outliers later.
			frappe.log_error(
				title="install_user_lifecycle_field — backfill failed",
				message=f"user={row.get('name')!r}\n\n{frappe.get_traceback()}",
			)

	# Always set Administrator + Guest to Active. Administrator is
	# break-glass; Guest is never actually enabled but having a value
	# avoids NULL ambiguity in downstream queries.
	for system_user in ("Administrator", "Guest"):
		if frappe.db.exists("User", system_user):
			frappe.db.set_value("User", system_user, LIFECYCLE_FIELD, STATE_ACTIVE)

	frappe.db.commit()
	return {
		"installed_field": f"User.{LIFECYCLE_FIELD}",
		"updated": updated,
		"skipped": skipped,
		"failed_users": failed,
	}

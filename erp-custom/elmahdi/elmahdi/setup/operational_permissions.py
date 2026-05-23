"""
ERPNext Custom DocPerm matrix for Elmahdi operational roles.

Aligns /api/resource/* enforcement with SPA capabilityProfiles.js.
Authoritative source: rest_resource_policy.REST_ROLE_LAYERS
"""

from __future__ import annotations

import frappe
from frappe.permissions import add_permission, update_permission_property

from elmahdi.setup.rest_resource_policy import (
	PERM_FIELDS,
	REST_ROLE_LAYERS,
	SPA_REST_DOCTYPES,
)


def _ensure_perm(doctype: str, role: str, ptype: str, value: int) -> None:
	if not frappe.db.exists("DocType", doctype):
		return
	if not frappe.db.exists("Role", role):
		return
	if not frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
	):
		add_permission(doctype, role, permlevel=0, ptype="read")
	update_permission_property(doctype, role, 0, ptype, int(value))


def _merged_role_matrix() -> dict[str, dict[str, dict[str, int]]]:
	"""Every operational role gets explicit 0/1 for each SPA REST doctype (+ extras)."""
	out: dict[str, dict[str, dict[str, int]]] = {}
	for role, layers in REST_ROLE_LAYERS.items():
		role_matrix: dict[str, dict[str, int]] = {}
		for doctype in SPA_REST_DOCTYPES:
			perms = layers.get(doctype) or dict.fromkeys(PERM_FIELDS, 0)
			role_matrix[doctype] = {k: int(perms.get(k, 0)) for k in PERM_FIELDS}
		for doctype, perms in layers.items():
			if doctype not in role_matrix:
				role_matrix[doctype] = {k: int(perms.get(k, 0)) for k in PERM_FIELDS}
		out[role] = role_matrix
	return out


def apply_permission_matrix() -> list[str]:
	applied: list[str] = []
	matrix = _merged_role_matrix()
	for role, doctypes in matrix.items():
		for doctype, perms in doctypes.items():
			for ptype in PERM_FIELDS:
				value = int(perms.get(ptype, 0))
				_ensure_perm(doctype, role, ptype, value)
				applied.append(f"{role}:{doctype}:{ptype}={value}")
	return applied


def verify_user_rest_permissions(user: str, checks: list[tuple[str, str, bool]]) -> list[dict]:
	"""Return rows comparing has_permission vs expected for REST bypass audit."""
	from frappe.permissions import has_permission

	rows: list[dict] = []
	for doctype, ptype, expected in checks:
		actual = bool(has_permission(doctype, ptype, user=user))
		rows.append(
			{
				"doctype": doctype,
				"perm": ptype,
				"expected": expected,
				"actual": actual,
				"pass": actual == expected,
			}
		)
	return rows


def execute():
	applied = apply_permission_matrix()
	frappe.db.commit()
	frappe.clear_cache()
	return {"applied_count": len(applied)}

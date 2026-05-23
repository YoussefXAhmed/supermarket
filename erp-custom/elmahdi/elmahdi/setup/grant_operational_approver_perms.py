"""Grant submit permissions for operational approvers — delegates to REST DocPerm matrix."""

from __future__ import annotations

import frappe

from elmahdi.setup.operational_permissions import apply_permission_matrix


def grant_operational_approver_perms() -> None:
	"""Legacy entry point; REST matrix is authoritative (no ad-hoc grants)."""
	apply_permission_matrix()


def execute():
	grant_operational_approver_perms()
	frappe.db.commit()
	frappe.clear_cache()

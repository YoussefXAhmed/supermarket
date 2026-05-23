"""Apply SPA-aligned REST DocPerm matrix for all operational ERP roles."""

from __future__ import annotations

import frappe

from elmahdi.setup.operational_permissions import apply_permission_matrix


def execute():
	applied = apply_permission_matrix()
	frappe.db.commit()
	frappe.clear_cache()
	return {"applied_count": len(applied)}

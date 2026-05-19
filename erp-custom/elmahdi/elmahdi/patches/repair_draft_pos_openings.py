"""
Post-migrate: submit valid draft POS Opening Entries left from failed REST opens.
"""

import frappe

from elmahdi.api.shifts import repair_draft_opening_entries


def execute():
    if frappe.flags.in_install or frappe.flags.in_migrate:
        frappe.logger().info("repair_draft_pos_openings: running repair (live submit)")
    try:
        result = repair_draft_opening_entries(dry_run=0)
        submitted = sum(1 for r in result.get("results", []) if r.get("action") == "submitted")
        frappe.logger().info(
            "repair_draft_pos_openings: found=%s submitted=%s",
            result.get("found"),
            submitted,
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "repair_draft_pos_openings failed")

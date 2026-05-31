"""
Regression: cashier may read assigned POS Profile only (REST DocPerm + User Permission).

Run:
  bench --site <site> execute elmahdi.tests.run_cashier_pos_profile_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.permissions import has_permission

from elmahdi.setup.provision_operational_users import _provision_user, USERS
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report

CASHIER = "cashier@elmahdi.com"


def _step(steps, *, step, ok, message="", **extra):
	row = audit_record(step=step, passed=ok, message=message, **extra)
	steps.append(row)
	return ok


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		spec = next(s for s in USERS if s["email"] == CASHIER)
		_provision_user(spec, password=None)

		profiles = frappe.get_all(
			"User Permission",
			filters={"user": CASHIER, "allow": "POS Profile"},
			pluck="for_value",
		)
		_step(
			steps,
			step="cashier_has_pos_profile_assignment",
			ok=bool(profiles),
			message=f"assigned={profiles}",
		)

		frappe.set_user(CASHIER)
		for pname in profiles:
			doc = frappe.get_doc("POS Profile", pname)
			ok_read = bool(has_permission(doc, "read", user=CASHIER))
			ok_write = bool(has_permission(doc, "write", user=CASHIER))
			_step(
				steps,
				step=f"read_assigned_{pname.replace(' ', '_')}",
				ok=ok_read and not ok_write,
				message=f"read={ok_read} write={ok_write}",
			)

		# Stale SPA name must not be readable when it is not the assigned profile.
		if "Main" not in profiles and frappe.db.exists("POS Profile", "Main"):
			doc = frappe.get_doc("POS Profile", "Main")
			_step(
				steps,
				step="deny_unassigned_Main",
				ok=not has_permission(doc, "read", user=CASHIER),
				message="unassigned profile blocked",
			)
		elif "Main" not in profiles:
			_step(
				steps,
				step="skip_unassigned_Main",
				ok=True,
				message="no POS Profile named Main on site",
			)

		frappe.db.commit()
	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("Cashier POS Profile regression failed"), frappe.ValidationError)
	return summary

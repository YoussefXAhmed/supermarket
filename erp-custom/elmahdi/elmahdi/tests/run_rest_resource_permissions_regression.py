"""
Regression: /api/resource/* DocPerm alignment vs SPA capability profiles.

Run:
  bench --site <site> execute elmahdi.tests.run_rest_resource_permissions_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _

from elmahdi.setup.operational_permissions import apply_permission_matrix, verify_user_rest_permissions
from elmahdi.setup.rest_resource_policy import REST_USER_EXPECTATIONS, SPA_REST_DOCTYPES
from elmahdi.tests.pos_stock_flow_audit import audit_record, print_report, summarize_report


def _step(steps, *, step, ok, message="", **extra):
	row = audit_record(step=step, passed=ok, message=message, **extra)
	steps.append(row)
	return ok


def execute():
	steps: list[dict] = []
	orig_user = frappe.session.user

	try:
		apply_permission_matrix()
		frappe.db.commit()

		_step(
			steps,
			step="00_spa_rest_catalog_present",
			ok=len(SPA_REST_DOCTYPES) >= 25,
			message=f"Catalog covers {len(SPA_REST_DOCTYPES)} SPA REST doctypes",
		)

		check_idx = 0
		for email, checks in REST_USER_EXPECTATIONS.items():
			if not frappe.db.exists("User", email):
				_step(
					steps,
					step=f"skip_{email.split('@')[0]}",
					ok=True,
					message=f"User {email} not on site — skipped",
				)
				continue

			frappe.set_user(email)
			rows = verify_user_rest_permissions(email, checks)
			failures = [r for r in rows if not r["pass"]]
			_step(
				steps,
				step=f"user_{email.split('@')[0]}_rest_matrix",
				ok=not failures,
				message=(
					f"{len(checks) - len(failures)}/{len(checks)} REST checks pass"
					if not failures
					else "; ".join(
						f"{f['doctype']}.{f['perm']} expected={f['expected']} got={f['actual']}"
						for f in failures[:5]
					)
				),
			)
			for row in rows:
				check_idx += 1
				_step(
					steps,
					step=f"{check_idx:02d}_{email.split('@')[0]}_{row['doctype']}_{row['perm']}",
					ok=row["pass"],
					message=f"expected={row['expected']} actual={row['actual']}",
				)

		# Cross-role bypass probes (finance + stock execution)
		probes = [
			("purchasing@elmahdi.com", "Payment Entry", "submit", False),
			("inventory@elmahdi.com", "Payment Entry", "read", False),
			("cashier@elmahdi.com", "Stock Entry", "submit", False),
			("manager@elmahdi.com", "Payment Entry", "read", False),
			("manager@elmahdi.com", "Stock Entry", "submit", False),
		]
		for email, doctype, perm, expected in probes:
			if not frappe.db.exists("User", email):
				continue
			frappe.set_user(email)
			from frappe.permissions import has_permission

			actual = bool(has_permission(doctype, perm, user=email))
			_step(
				steps,
				step=f"bypass_{email.split('@')[0]}_{doctype.replace(' ', '_')}_{perm}",
				ok=actual == expected,
				message=f"expected={expected} actual={actual}",
			)

	finally:
		frappe.set_user(orig_user)

	summary = summarize_report(steps)
	print_report(summary)
	print(json.dumps(summary, indent=2))
	if not summary.get("success"):
		frappe.throw(_("REST resource permission regression failed"), frappe.ValidationError)
	return summary

"""
Production readiness smoke — runs security + permission regression suite.

Run:
  bench --site <site> execute elmahdi.tests.run_production_readiness_regression.execute
"""

from __future__ import annotations

import importlib
import sys

import frappe

SUITES = (
	"elmahdi.tests.run_spa_authorization_regression",
	"elmahdi.tests.run_payment_segregation_regression",
	"elmahdi.tests.run_ap_paid_tab_regression",
	"elmahdi.tests.run_rest_resource_permissions_regression",
	"elmahdi.tests.run_purchase_approval_authorization_regression",
	"elmahdi.tests.run_shift_closing_approval_authorization_regression",
)


def execute():
	results = []
	failed = 0

	for module_name in SUITES:
		label = module_name.rsplit(".", 1)[-1]
		try:
			mod = importlib.import_module(module_name)
			out = mod.execute()
			ok = bool(out) if isinstance(out, bool) else True
			results.append((label, ok, ""))
			if not ok:
				failed += 1
		except Exception as exc:
			results.append((label, False, str(exc)))
			failed += 1

	print("\n=== Production readiness regression ===")
	for label, ok, err in results:
		status = "PASS" if ok else "FAIL"
		line = f"  [{status}] {label}"
		if err:
			line += f" — {err}"
		print(line)

	if failed:
		print(f"\n{failed}/{len(SUITES)} suite(s) failed")
		sys.exit(1)

	print(f"\nAll {len(SUITES)} suite(s) passed")
	return True

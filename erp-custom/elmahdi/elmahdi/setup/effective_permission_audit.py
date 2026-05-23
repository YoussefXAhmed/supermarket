"""
Live effective-permission audit for Elmahdi operational users.
Run: bench --site <site> execute elmahdi.setup.effective_permission_audit.execute
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe.permissions import has_permission

from elmahdi.api import spa_authorization
from elmahdi.api.purchase_authorization import may_act_as_purchase_approver
from elmahdi.api.shift_authorization import (
	may_act_as_pos_closing_approver,
	user_erp_roles,
)
from elmahdi.setup.rest_resource_policy import (
	PERM_FIELDS,
	REST_USER_EXPECTATIONS,
	SPA_REST_DOCTYPES,
)

AUDIT_USERS = [
	"cashier@elmahdi.com",
	"purchasing@elmahdi.com",
	"inventory@elmahdi.com",
	"manager@elmahdi.com",
	"accountant@elmahdi.com",
]

# High-risk doctypes beyond SPA catalog
EXTRA_DOCTYPES = (
	"Item",
	"Account",
	"Journal Entry",
	"Sales Order",
	"Purchase Order",
	"Delivery Note",
	"Quotation",
	"Role",
	"Module Profile",
	"Workspace",
)

WHITELIST_PROBES: tuple[tuple[str, str, str], ...] = (
	("elmahdi.api.purchasing", "approve_purchase_receipt", "purchase_approve"),
	("elmahdi.api.purchasing", "list_pending_purchase_approvals", "purchase_list_pending"),
	("elmahdi.api.pos_closing_approval", "approve_pos_closing_entry", "shift_approve"),
	("elmahdi.api.pos_closing_approval", "list_pending_shift_closings", "shift_list_pending"),
	("elmahdi.api.accounts_payable", "create_supplier_payment", "ap_payment_create"),
	("elmahdi.api.accounts_payable", "list_supplier_payment_allocations", "ap_payment_list"),
	("elmahdi.api.pos_checkout", "checkout_pos_invoice", "pos_checkout"),
	("elmahdi.api.stock", "create_stock_entry_workflow", "stock_entry_create"),
	("elmahdi.api.stock", "get_warehouse_stock", "stock_read"),
	("elmahdi.api.manager_dashboard", "get_manager_kpis", "manager_kpis"),
)

DANGER_TAGS: dict[str, str] = {
	"Payment Entry": "financial_execution",
	"Purchase Invoice": "financial_execution",
	"Journal Entry": "financial_execution",
	"GL Entry": "financial_read",
	"Account": "financial_read",
	"Stock Entry": "stock_execution",
	"Stock Reconciliation": "stock_execution",
	"Purchase Receipt": "stock_inbound",
	"Item": "product_edit",
	"Item Price": "product_edit",
	"POS Closing Entry": "shift_approval",
	"User": "user_admin",
	"Role": "user_admin",
}


def _user_row(email: str) -> dict[str, Any]:
	if not frappe.db.exists("User", email):
		return {"exists": False}
	meta = frappe.get_meta("User")
	fields = [f for f in ("enabled", "role_profile_name", "user_type", "module_profile", "desk_access") if meta.has_field(f)]
	row = frappe.db.get_value("User", email, fields or ["name"], as_dict=True) or {}
	roles = sorted(frappe.get_roles(email))
	ups = frappe.get_all(
		"User Permission",
		filters={"user": email},
		fields=["allow", "for_value", "apply_to_all_doctypes"],
		limit=50,
	)
	return {
		"exists": True,
		"enabled": row.get("enabled"),
		"role_profile_name": row.get("role_profile_name") or "",
		"module_profile": row.get("module_profile") or "",
		"desk_access": row.get("desk_access"),
		"user_type": row.get("user_type"),
		"roles": roles,
		"user_permissions": ups,
		"unexpected_roles": _unexpected_roles(roles),
	}


def _unexpected_roles(roles: list[str]) -> list[str]:
	noise = {"All", "Guest", "Desk User"}
	allowed_operational = {
		"POS User",
		"Sales User",
		"Stock User",
		"Purchase User",
		"Sales Manager",
		"POS Manager",
		"Stock Manager",
		"Purchase Manager",
		"Accounts User",
		"Accounts Manager",
		"Store Manager",
	}
	bad = []
	for r in roles:
		if r in noise:
			continue
		if r in ("Administrator", "System Manager"):
			bad.append(f"ESCALATION:{r}")
		elif r not in allowed_operational:
			bad.append(f"EXTRA:{r}")
	return bad


def _effective_matrix(email: str) -> dict[str, dict[str, bool]]:
	out: dict[str, dict[str, bool]] = {}
	for dt in list(SPA_REST_DOCTYPES) + list(EXTRA_DOCTYPES):
		if not frappe.db.exists("DocType", dt):
			continue
		row: dict[str, bool] = {}
		for p in PERM_FIELDS:
			try:
				row[p] = bool(has_permission(dt, p, user=email))
			except Exception:
				row[p] = False
		# amend is separate in frappe
		try:
			row["amend"] = bool(has_permission(dt, "amend", user=email))
		except Exception:
			row["amend"] = False
		if any(row.values()):
			out[dt] = row
	return out


def _probe_whitelist(email: str) -> list[dict[str, Any]]:
	frappe.set_user(email)
	rows = []
	for module_path, method, key in WHITELIST_PROBES:
		fn_path = f"{module_path}.{method}"
		status = "ok"
		err = ""
		try:
			fn = frappe.get_attr(fn_path)
			# Permission gate only — invalid args expected after auth passes
			try:
				if method.startswith("list_") or method.startswith("get_"):
					fn(limit=1)
				elif "approve" in method or "reject" in method:
					fn(name="__audit_probe__", notes="audit")
				elif method == "checkout_pos_invoice":
					fn(payload="{}")
				else:
					fn()
			except frappe.PermissionError as pe:
				status = "permission_denied"
				err = str(pe)
			except Exception as exc:
				msg = str(exc)
				if "Permission" in msg or "Not permitted" in msg or "not have access" in msg.lower():
					status = "permission_denied"
					err = msg
				else:
					status = "callable_past_auth"
					err = msg[:200]
		except Exception as exc:
			status = "error"
			err = str(exc)[:200]
		rows.append({"key": key, "method": fn_path, "status": status, "detail": err})
	return rows


def _spa_server_caps(email: str) -> dict[str, bool]:
	frappe.set_user(email)
	return spa_authorization.get_capabilities(email)


def _policy_flags(email: str) -> dict[str, bool]:
	frappe.set_user(email)
	return {
		"may_act_as_pos_closing_approver": may_act_as_pos_closing_approver(email),
		"can_approve_purchase_receipt": may_act_as_purchase_approver(email),
	}


def _dangerous_grants(matrix: dict[str, dict[str, bool]], email: str) -> list[dict[str, Any]]:
	expect = REST_USER_EXPECTATIONS.get(email, [])
	expected_deny = {(dt, p) for dt, p, exp in expect if not exp}
	expected_allow = {(dt, p) for dt, p, exp in expect}

	dangers: list[dict[str, Any]] = []
	for dt, perms in matrix.items():
		tag = DANGER_TAGS.get(dt, "")
		for p, allowed in perms.items():
			if not allowed:
				continue
			if (dt, p) in expected_deny:
				dangers.append(
					{
						"severity": "HIGH",
						"user": email,
						"doctype": dt,
						"perm": p,
						"reason": "policy_violation_unexpected_allow",
						"tag": tag,
					}
				)
			# Broad financial/stock execution without expectation entry
			if tag == "financial_execution" and p in ("create", "submit", "write"):
				if (dt, p) not in expected_allow and email not in ("accountant@elmahdi.com",):
					dangers.append(
						{
							"severity": "HIGH",
							"user": email,
							"doctype": dt,
							"perm": p,
							"reason": "financial_execution_exposure",
							"tag": tag,
						}
					)
			if tag == "stock_execution" and p in ("create", "submit"):
				if email not in ("inventory@elmahdi.com",):
					dangers.append(
						{
							"severity": "HIGH",
							"user": email,
							"doctype": dt,
							"perm": p,
							"reason": "stock_execution_exposure",
							"tag": tag,
						}
					)
			if dt == "Item" and p in ("write", "create", "delete"):
				dangers.append(
					{
						"severity": "MEDIUM",
						"user": email,
						"doctype": dt,
						"perm": p,
						"reason": "product_edit_exposure",
						"tag": tag,
					}
				)
			if dt == "POS Closing Entry" and p == "submit" and email == "cashier@elmahdi.com":
				dangers.append(
					{
						"severity": "CRITICAL",
						"user": email,
						"doctype": dt,
						"perm": p,
						"reason": "cashier_can_submit_closing_rest_bypass",
						"tag": "approval_bypass",
					}
				)
			if dt == "Purchase Receipt" and p == "submit" and email == "purchasing@elmahdi.com":
				# Policy: purchasing creates draft; manager approves via API — REST submit is bypass
				dangers.append(
					{
						"severity": "HIGH",
						"user": email,
						"doctype": dt,
						"perm": p,
						"reason": "purchasing_can_submit_pr_via_rest",
						"tag": "approval_bypass",
					}
				)
	return dangers


def _desk_exposure(email: str, roles: list[str]) -> dict[str, Any]:
	if frappe.get_meta("User").has_field("desk_access"):
		desk = bool(frappe.db.get_value("User", email, "desk_access"))
	else:
		desk = True
	# Module access: if desk_access and not heavily blocked, Desk is reachable
	blocked = []
	if frappe.db.has_column("User", "block_modules"):
		block = frappe.db.get_value("User", email, "block_modules") or "[]"
		try:
			blocked = json.loads(block) if isinstance(block, str) else block
		except Exception:
			blocked = []
	has_admin_role = bool(set(roles) & {"System Manager", "Administrator"})
	return {
		"desk_access_flag": desk,
		"blocked_modules_count": len(blocked) if isinstance(blocked, list) else 0,
		"erp_desk_login_possible": desk and not has_admin_role,
		"break_glass_roles": has_admin_role,
	}


def audit_user(email: str) -> dict[str, Any]:
	meta = _user_row(email)
	matrix = _effective_matrix(email)
	whitelist = _probe_whitelist(email)
	caps = _spa_server_caps(email)
	policy = _policy_flags(email)
	dangers = _dangerous_grants(matrix, email)
	desk = _desk_exposure(email, meta.get("roles") or [])

	# REST expectation regression
	regression = []
	for dt, p, expected in REST_USER_EXPECTATIONS.get(email, []):
		actual = bool(has_permission(dt, p, user=email))
		if actual != expected:
			regression.append({"doctype": dt, "perm": p, "expected": expected, "actual": actual})

	return {
		"user": email,
		"meta": meta,
		"desk": desk,
		"spa_server_capabilities": caps,
		"policy_flags": policy,
		"effective_docperm": matrix,
		"whitelist_probes": whitelist,
		"rest_regression_failures": regression,
		"dangerous": dangers,
	}


def execute():
	frappe.set_user("Administrator")
	report = {
		"site": frappe.local.site,
		"users": [audit_user(u) for u in AUDIT_USERS],
	}
	all_dangers = []
	for u in report["users"]:
		all_dangers.extend(u.get("dangerous") or [])
		all_dangers.extend(
			{
				"severity": "HIGH",
				"user": u["user"],
				"doctype": r["doctype"],
				"perm": r["perm"],
				"reason": "rest_regression_mismatch",
				"tag": "rest_policy",
				"expected": r["expected"],
				"actual": r["actual"],
			}
			for r in u.get("rest_regression_failures") or []
		)
	report["all_dangers"] = all_dangers
	report["summary"] = {
		"users_audited": len(AUDIT_USERS),
		"danger_count": len(all_dangers),
		"critical": sum(1 for d in all_dangers if d.get("severity") == "CRITICAL"),
		"high": sum(1 for d in all_dangers if d.get("severity") == "HIGH"),
	}
	print(json.dumps(report, indent=2, default=str))
	return report

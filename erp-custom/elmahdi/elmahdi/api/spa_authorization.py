"""
SPA capability enforcement — mirrors src/auth/capabilityProfiles.js (fail-closed).

Role Profile on User is authoritative for operational users.
System Manager / Administrator ERP roles are break-glass (full access).
"""

from __future__ import annotations

import frappe
from frappe import _

BREAK_GLASS_ERP_ROLES = frozenset({"Administrator", "System Manager"})

ROLE_PROFILE_CASHIER = "Elmahdi Cashier"
ROLE_PROFILE_INVENTORY = "Elmahdi Inventory Clerk"
ROLE_PROFILE_PURCHASING = "Elmahdi Purchasing Officer"
ROLE_PROFILE_STORE_MANAGER = "Elmahdi Store Manager"
ROLE_PROFILE_ACCOUNTANT = "Elmahdi Accountant"
ROLE_PROFILE_HR = "Elmahdi HR Officer"
ROLE_PROFILE_ADMIN = "Elmahdi Administrator"

ACCOUNTANT_PROFILE_ALIASES = frozenset(
	{
		ROLE_PROFILE_ACCOUNTANT,
		"Elmahdi Accountant",
		"Accountant",
		"Accounts Manager",
	}
)

# --- Explicit capability layers (aligned with capabilityProfiles.js) -----------------

_CAPS_CASHIER = {
	"can_operate_pos": True,
	"can_open_shift": True,
	"can_close_shift": True,
	"can_create_returns": True,
	# Backend mirrors of the frontend-only flags surfaced in the production
	# audit (Section 1, blocker #2). Without these the SPA gate could be
	# bypassed by hitting REST directly.
	"can_view_returns": True,
	"can_view_invoices": True,
	"can_view_own_shift_history": True,
	# HR self-service — every employee can request leave + see their own payslip.
	"can_request_leave": True,
	"can_view_payslip_self": True,
}

_CAPS_INVENTORY = {
	"can_access_inventory": True,
	"can_operate_inventory": True,
	"can_view_suppliers": True,
	# Inventory clerks need to see stock ledger entries for their own ops, but
	# NOT the valuation breakdown (cost prices are restricted).
	"can_view_stock_ledger_read_only": True,
	# HR self-service.
	"can_request_leave": True,
	"can_view_payslip_self": True,
}

_CAPS_PURCHASING = {
	"can_access_purchasing": True,
	"can_view_purchasing_history": True,
	"can_view_suppliers": True,
	# HR self-service.
	"can_request_leave": True,
	"can_view_payslip_self": True,
}

_CAPS_STORE_MANAGER = {
	# Phase 4.a — Store Manager may review batch audit history for own
	# branch + dispatch password-reset links for users they manage
	# (own-branch scoping enforced separately). They MUST NOT set a
	# user's password directly; that capability is Admin-only.
	"can_view_batch_audit": True,
	"can_send_password_reset_link": True,
	"can_access_admin_workspace": True,
	# Warehouse / inventory operations are NOT a Store Manager concern.
	# Removed `can_access_inventory` so the manager cannot enter the inventory
	# workspace or any of its sub-routes. They reach suppliers via the manager
	# workspace at /manager/suppliers.
	"can_view_suppliers": True,
	"can_view_operational_kpis": True,
	"can_view_financial_kpis": False,
	"can_view_purchase_approvals": True,
	"can_view_approvals_dashboard": True,
	"can_view_purchasing_history": True,
	"can_approve_purchasing": True,
	"can_approve_shift": False,
	"can_view_shift_reports": True,
	"can_view_pos_monitor": True,
	# Backend mirrors for the audit's frontend-only gaps.
	"can_view_analytics": True,
	"can_monitor_cashiers": True,
	"can_approve_returns": True,
	"can_approve_reconciliation": True,
	"can_inventory_analytics": True,
	"can_inventory_manage": True,
	# Manager may VIEW valuation summary on dashboards but not edit cost prices.
	"can_inventory_view_valuation": True,
	# Read-only General Ledger access — managers see the financial impact
	# of their branch (P&L margin, COGS, cash position) without being able
	# to edit any accounting entry.
	"can_view_gl_read_only": True,
	# HR — Store Manager approves leave for own-branch employees + sees
	# own-branch HR reports + has personal payslip access. Row-level
	# scoping in row_scoping.py (Batch A.4) restricts the dataset.
	"can_approve_leave": True,
	"can_view_hr_reports": True,
	"can_request_leave": True,
	"can_view_payslip_self": True,
	# Phase 4 — workspace settings (Store Manager owns store policy:
	# POS Profile, inventory transfer limits, purchasing approval
	# thresholds for the store).
	"can_manage_pos_profiles": True,
	"can_manage_inventory_settings": True,
	"can_manage_purchasing_settings": True,
}

_CAPS_ACCOUNTANT = {
	# Phase 4.a — Accountant reads batch-audit history for compliance.
	"can_view_batch_audit": True,
	"can_access_admin_workspace": True,
	"can_access_accountant_workspace": True,
	"can_view_suppliers": True,
	"can_view_operational_kpis": True,
	"can_view_financial_kpis": True,
	"can_view_supplier_payments": True,
	"can_manage_supplier_payments": True,
	"can_manage_supplier_payable": True,
	"can_access_invoice_matching": True,
	"can_view_purchase_approvals": True,
	"can_view_approvals_dashboard": True,
	"can_view_purchasing_history": True,
	"can_approve_purchasing": False,
	"can_approve_purchasing_accountant": False,
	"can_approve_shift": True,
	# Backend mirrors for the audit gaps.
	"can_view_analytics": True,
	"can_view_invoices": True,
	"can_view_stock_ledger_read_only": True,
	"can_inventory_view_valuation": True,
	# HR self-service.
	"can_request_leave": True,
	"can_view_payslip_self": True,
	# Phase 4 — workspace settings (Accountant owns finance policy).
	"can_manage_finance_settings": True,
}

_CAPS_HR = {
	# Phase 4.a — HR may dispatch password reset links for users they
	# manage (own-branch scoping enforced separately when invitation/
	# reset flows land in 4.d/4.e). They MUST NOT set a password directly.
	"can_view_batch_audit": True,
	"can_send_password_reset_link": True,
	"can_access_hr_workspace": True,
	"can_manage_operational_users": True,
	"can_manage_users": True,
	"can_view_employees": True,
	"can_manage_employees": True,
	# HR module — full set for the HR Officer.
	"can_manage_attendance": True,
	"can_approve_leave": True,
	"can_request_leave": True,
	"can_manage_payroll": True,
	"can_view_hr_reports": True,
	"can_view_payslip_self": True,
	# Phase 4 — HR Officer owns HR Settings (standard working hours,
	# leave notification flag).
	"can_manage_hr_settings": True,
}

_CAPS_ADMIN = {key: True for key in (
	"can_operate_pos",
	"can_open_shift",
	"can_close_shift",
	"can_create_returns",
	"can_access_inventory",
	"can_operate_inventory",
	"can_inventory_reconcile",
	"can_access_purchasing",
	"can_view_suppliers",
	"can_access_admin_workspace",
	"can_access_accountant_workspace",
	"can_view_operational_kpis",
	"can_view_financial_kpis",
	"can_view_supplier_payments",
	"can_manage_supplier_payments",
	"can_manage_supplier_payable",
	"can_access_invoice_matching",
	"can_view_purchase_approvals",
	"can_view_approvals_dashboard",
	"can_view_purchasing_history",
	"can_approve_purchasing",
	"can_approve_purchasing_accountant",
	"can_approve_shift",
	"can_view_pos_monitor",
	"can_manage_system",
	# 11 caps that used to be SPA-only — Admin gets all of them too.
	"can_view_analytics",
	"can_monitor_cashiers",
	"can_approve_returns",
	"can_approve_reconciliation",
	"can_view_returns",
	"can_view_invoices",
	"can_view_own_shift_history",
	"can_view_stock_ledger_read_only",
	"can_inventory_view_valuation",
	"can_inventory_analytics",
	"can_inventory_manage",
	"can_view_gl_read_only",
	# Phase 4.a — Admin owns batch-audit visibility and is the only
	# role permitted to set a user password directly (break-glass).
	"can_view_batch_audit",
	"can_send_password_reset_link",
	"can_set_user_password_directly",
	# Full HR cap set for break-glass admin work.
	"can_manage_employees",
	"can_manage_attendance",
	"can_approve_leave",
	"can_request_leave",
	"can_manage_payroll",
	"can_view_hr_reports",
	"can_view_payslip_self",
)}

CAPS_BY_ROLE_PROFILE: dict[str, dict[str, bool]] = {
	ROLE_PROFILE_CASHIER: _CAPS_CASHIER,
	ROLE_PROFILE_INVENTORY: _CAPS_INVENTORY,
	ROLE_PROFILE_PURCHASING: _CAPS_PURCHASING,
	ROLE_PROFILE_STORE_MANAGER: _CAPS_STORE_MANAGER,
	ROLE_PROFILE_ACCOUNTANT: _CAPS_ACCOUNTANT,
	ROLE_PROFILE_HR: _CAPS_HR,
	ROLE_PROFILE_ADMIN: _CAPS_ADMIN,
}

for alias in ACCOUNTANT_PROFILE_ALIASES:
	CAPS_BY_ROLE_PROFILE[alias] = _CAPS_ACCOUNTANT


def _normalize_profile(name: str | None) -> str:
	return (name or "").strip()


def user_erp_roles(user: str | None = None) -> set[str]:
	u = user or frappe.session.user
	return set(frappe.get_roles(u))


def is_break_glass_user(user: str | None = None) -> bool:
	return bool(user_erp_roles(user) & BREAK_GLASS_ERP_ROLES)


def user_role_profile(user: str | None = None) -> str:
	u = user or frappe.session.user
	if u in ("Guest",):
		return ""
	return _normalize_profile(frappe.db.get_value("User", u, "role_profile_name") or "")


def _resolve_profile_key(profile: str) -> str | None:
	if not profile:
		return None
	if profile in CAPS_BY_ROLE_PROFILE:
		return profile
	pl = profile.lower()
	for key in CAPS_BY_ROLE_PROFILE:
		if key.lower() == pl:
			return key
	return None


def _erp_fallback_caps(user: str | None = None) -> dict[str, bool]:
	"""Fail-closed fallback when no Elmahdi Role Profile is set."""
	roles = user_erp_roles(user) - {"All", "Guest", "Desk User"}
	caps: dict[str, bool] = {}
	if roles & {"cashier", "pos user", "sales user"} or "POS User" in roles or "Sales User" in roles:
		caps.update(_CAPS_CASHIER)
	if roles & {"stock user", "stock manager", "warehouse user", "warehouse manager", "item manager"}:
		caps["can_access_inventory"] = True
		caps["can_operate_inventory"] = bool(roles & {"Stock User", "stock user"})
	if roles & {"purchase user", "purchase manager"}:
		caps["can_access_purchasing"] = True
	if roles & {"accounts user", "accounts manager"}:
		caps.update(_CAPS_ACCOUNTANT)
	if roles & {"sales manager", "pos manager", "store manager"}:
		caps.update(_CAPS_STORE_MANAGER)
	# Do not infer HR workspace from ERP "HR User" — requires Elmahdi HR Officer profile.
	return caps


def get_capabilities(user: str | None = None) -> dict[str, bool]:
	u = user or frappe.session.user
	if u in ("Guest",):
		return {}
	if is_break_glass_user(u):
		return dict(_CAPS_ADMIN)

	profile = user_role_profile(u)
	key = _resolve_profile_key(profile)
	if key:
		return dict(CAPS_BY_ROLE_PROFILE[key])

	return _erp_fallback_caps(u)


def has_cap(cap: str, user: str | None = None) -> bool:
	return bool(get_capabilities(user).get(cap))


def _assert_cap(cap: str, message: str) -> None:
	if not has_cap(cap):
		frappe.throw(_(message), frappe.PermissionError)


# --- Policy asserts (used by whitelisted APIs) ----------------------------------------


def assert_may_operate_pos() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_operate_pos", "Only cashiers may operate the POS.")


def assert_may_open_shift() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_open_shift", "You do not have permission to open a shift.")


def assert_may_access_inventory() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_access_inventory", "You do not have permission to access inventory.")


def assert_may_operate_inventory() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_operate_inventory", "You do not have permission to submit stock movements.")


def assert_may_inventory_reconcile() -> None:
	if is_break_glass_user():
		return
	if has_cap("can_inventory_reconcile") or has_cap("can_manage_system"):
		return
	frappe.throw(_("You do not have permission to submit stock reconciliation."), frappe.PermissionError)


def assert_may_access_purchasing() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_access_purchasing", "You do not have permission to access purchasing.")


def assert_may_view_purchase_approvals() -> None:
	if is_break_glass_user():
		return
	if has_cap("can_view_purchase_approvals") or has_cap("can_view_approvals_dashboard"):
		return
	frappe.throw(_("You do not have permission to view purchase approvals."), frappe.PermissionError)


def assert_may_approve_purchasing_manager() -> None:
	"""Purchase Receipt workflow — store manager only."""
	from elmahdi.api.purchase_authorization import assert_may_act_as_purchase_approver

	assert_may_act_as_purchase_approver()


def assert_may_approve_purchasing_accountant() -> None:
	"""Accountants must not approve purchase receipts (AP/PI/payment is separate)."""
	if is_break_glass_user():
		return
	frappe.throw(
		_("Accountants cannot approve purchase receipts. Store manager must approve; finance handles AP and payments."),
		frappe.PermissionError,
	)


def assert_may_access_finance() -> None:
	"""Accounts payable / finance workspace reads."""
	if is_break_glass_user():
		return
	if has_cap("can_access_accountant_workspace"):
		return
	frappe.throw(_("Only finance staff may access accounts payable data."), frappe.PermissionError)


def assert_may_view_supplier_payments() -> None:
	if is_break_glass_user():
		return
	if has_cap("can_view_supplier_payments") or has_cap("can_manage_supplier_payments"):
		return
	frappe.throw(_("You do not have permission to view supplier payments."), frappe.PermissionError)


def may_record_supplier_payment(user: str | None = None) -> bool:
	if (user or frappe.session.user) in ("Guest",):
		return False
	if is_break_glass_user(user):
		return True
	return has_cap("can_manage_supplier_payments", user)


def assert_may_record_supplier_payment() -> None:
	if not may_record_supplier_payment():
		frappe.throw(_("Only accounts staff may record supplier payments."), frappe.PermissionError)


def may_manage_supplier_payable(user: str | None = None) -> bool:
	if (user or frappe.session.user) in ("Guest",):
		return False
	if is_break_glass_user(user):
		return True
	return has_cap("can_manage_supplier_payable", user) or has_cap("can_access_invoice_matching", user)


def assert_may_manage_supplier_payable() -> None:
	if not may_manage_supplier_payable():
		frappe.throw(
			_(
				"Purchasing and store supervisors cannot create or modify supplier payables. "
				"Use the approval workflow or contact finance."
			),
			frappe.PermissionError,
		)


def assert_may_access_invoice_matching() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_access_invoice_matching", "You do not have permission to access invoice matching.")


def assert_may_view_operational_kpis() -> None:
	if is_break_glass_user():
		return
	if has_cap("can_view_operational_kpis") or has_cap("can_access_admin_workspace"):
		return
	frappe.throw(_("You do not have permission to view operational dashboard KPIs."), frappe.PermissionError)


def may_view_financial_kpis(user: str | None = None) -> bool:
	if is_break_glass_user(user):
		return True
	return has_cap("can_view_financial_kpis", user)


def assert_may_read_stock_or_pos() -> None:
	"""POS warehouse resolution — cashiers and inventory staff only."""
	if is_break_glass_user():
		return
	caps = get_capabilities()
	if caps.get("can_operate_pos") or caps.get("can_access_inventory") or caps.get("can_view_pos_monitor"):
		return
	frappe.throw(_("You do not have permission to resolve POS stock context."), frappe.PermissionError)


def assert_may_read_buying_rates() -> None:
	if is_break_glass_user():
		return
	if has_cap("can_access_purchasing") or has_cap("can_access_invoice_matching"):
		return
	frappe.throw(_("You do not have permission to read buying rate suggestions."), frappe.PermissionError)


def assert_may_repair_shifts() -> None:
	"""Repair draft openings — accountant / break-glass only (not store manager)."""
	if is_break_glass_user():
		return
	if has_cap("can_approve_shift"):
		return
	frappe.throw(_("Not permitted to repair opening entries."), frappe.PermissionError)


def assert_may_approve_shift_closing() -> None:
	"""POS Closing Entry approve/reject/finalize — delegates to shift_authorization."""
	from elmahdi.api.shift_authorization import assert_may_act_as_pos_closing_approver

	assert_may_act_as_pos_closing_approver()


def assert_may_access_hr_workspace() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_access_hr_workspace", "You do not have permission to access the HR workspace.")


def assert_may_manage_operational_users() -> None:
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_operational_users",
		"You do not have permission to manage operational users.",
	)


# Typed submit policy — used by erp_submit (generic submit is allowlisted here only)
SUBMIT_DOCTYPE_POLICY: dict[str, str] = {
	"Stock Entry": "assert_may_operate_inventory",
	"Stock Reconciliation": "assert_may_inventory_reconcile",
	"Purchase Receipt": "assert_may_submit_purchase_receipt_direct",
	"Purchase Invoice": "assert_may_manage_supplier_payable",
	"Sales Invoice": "assert_may_access_finance",
	"POS Invoice": "assert_may_operate_pos",
	"Payment Entry": "assert_may_record_supplier_payment",
	"POS Opening Entry": "assert_may_open_shift",
	"Delivery Note": "assert_may_operate_inventory",
	"Purchase Return": "assert_may_access_purchasing",
}


def assert_may_submit_doctype(doctype: str) -> None:
	dt = (doctype or "").strip()
	if dt not in SUBMIT_DOCTYPE_POLICY:
		frappe.throw(
			_("Submit is not allowed via generic API for {0}. Use a typed submit method.").format(dt or "?"),
			frappe.PermissionError,
		)
	if dt == "Purchase Receipt":
		from elmahdi.api.purchasing import assert_may_submit_purchase_receipt_direct

		assert_may_submit_purchase_receipt_direct()
		return
	policy_fn = globals()[SUBMIT_DOCTYPE_POLICY[dt]]
	policy_fn()


# ── Asserters for caps that previously had no backend enforcement ─────────
# Production audit (Section 1, blocker #2) called these out. Each function
# follows the same pattern: break-glass passes through, the cap is checked,
# missing cap → PermissionError.


def assert_may_view_analytics() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_view_analytics", "You do not have permission to view analytics.")


def assert_may_monitor_cashiers() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_monitor_cashiers", "Only store managers may monitor cashier activity.")


def assert_may_approve_returns() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_approve_returns", "You do not have permission to approve returns.")


def assert_may_approve_reconciliation() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_approve_reconciliation", "You do not have permission to approve stock reconciliations.")


def assert_may_view_returns() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_view_returns", "You do not have permission to view returns.")


def assert_may_view_invoices() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_view_invoices", "You do not have permission to view invoices.")


def assert_may_view_own_shift_history() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_view_own_shift_history", "You do not have permission to view shift history.")


def assert_may_view_stock_ledger_read_only() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_view_stock_ledger_read_only", "You do not have permission to view the stock ledger.")


def assert_may_view_valuation() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_inventory_view_valuation", "You do not have permission to view inventory valuation.")


def assert_may_view_inventory_analytics() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_inventory_analytics", "You do not have permission to view inventory analytics.")


def assert_may_manage_inventory() -> None:
	if is_break_glass_user():
		return
	_assert_cap("can_inventory_manage", "You do not have permission to manage inventory.")


# ── HR module asserters (Batch A) ─────────────────────────────────────────


def assert_may_manage_attendance() -> None:
	"""HR Officer / Admin can write attendance records."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_attendance",
		"You do not have permission to manage attendance.",
	)


def assert_may_approve_leave() -> None:
	"""HR Officer + Store Manager (own branch) + Admin can approve/reject
	leave applications. Store Manager scope-narrowing is enforced via
	permission_query_conditions in row_scoping.py, not here."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_approve_leave",
		"You do not have permission to approve leave requests.",
	)


def assert_may_request_leave_for(employee: str | None = None) -> None:
	"""Anyone with `can_request_leave` may submit for themselves; HR + Admin
	may submit for any employee. `employee` is the Employee ID being
	submitted against; when provided we verify ownership."""
	if is_break_glass_user():
		return
	if not has_cap("can_request_leave"):
		frappe.throw(
			_("You do not have permission to request leave."),
			frappe.PermissionError,
		)
	if not employee:
		return
	# HR + Admin may submit for anyone.
	if has_cap("can_manage_employees") or has_cap("can_manage_system"):
		return
	# Otherwise the employee must be the one linked to the current user.
	owner = frappe.db.get_value("Employee", employee, "user_id")
	if owner and owner == frappe.session.user:
		return
	frappe.throw(
		_("You may only request leave for yourself."),
		frappe.PermissionError,
	)


def assert_may_manage_payroll() -> None:
	"""Create/edit Salary Structure Assignment + generate Salary Slips."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_payroll",
		"You do not have permission to manage payroll.",
	)


def assert_may_view_hr_reports() -> None:
	"""HR + Store Manager + Admin can view HR reports. Row-level scoping
	for the Store Manager (own-branch only) is applied inside each
	report's data fetch."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_view_hr_reports",
		"You do not have permission to view HR reports.",
	)


def assert_may_view_payslip(salary_slip: str | None = None) -> None:
	"""Employees see only their own payslip. HR + Admin see any payslip.

	`salary_slip` is the name of the Salary Slip being accessed; we resolve
	its `employee` and check that employee is linked to the current user.
	"""
	if is_break_glass_user():
		return
	# HR + Admin: full visibility.
	if has_cap("can_manage_payroll") or has_cap("can_manage_system"):
		return
	# Everyone else: must own the payslip.
	if not has_cap("can_view_payslip_self"):
		frappe.throw(
			_("You do not have permission to view payslips."),
			frappe.PermissionError,
		)
	if not salary_slip:
		# Read of the user's own listing — allow; the row-level scoping
		# in row_scoping.py.salary_slip_pqc restricts the dataset.
		return
	employee = frappe.db.get_value("Salary Slip", salary_slip, "employee")
	if not employee:
		frappe.throw(
			_("Salary slip {0} not found.").format(salary_slip),
			frappe.DoesNotExistError,
		)
	owner = frappe.db.get_value("Employee", employee, "user_id")
	if owner and owner == frappe.session.user:
		return
	frappe.throw(
		_("You may only view your own payslips."),
		frappe.PermissionError,
	)


def assert_may_manage_system_settings() -> None:
	"""Phase 3 — Global System Settings gate.

	Administrator-only. Reuses `can_manage_system` cap (already
	restricted to ADMINISTRATOR role profile in capabilityProfiles.js)
	plus the standard break-glass fallback for System Manager users
	logging in directly to the Frappe Desk.
	"""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_system",
		"Only the Administrator may manage Global System Settings.",
	)


# ── Phase 4: workspace settings asserters ────────────────────────────────


def assert_may_manage_pos_settings() -> None:
	"""POS Settings — Store Manager or POS Manager (canManagePosProfiles)
	or Administrator."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_pos_profiles",
		"You do not have permission to manage POS settings.",
	)


def assert_may_manage_inventory_settings() -> None:
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_inventory_settings",
		"You do not have permission to manage inventory settings.",
	)


def assert_may_manage_purchasing_settings() -> None:
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_purchasing_settings",
		"You do not have permission to manage purchasing settings.",
	)


def assert_may_manage_finance_settings() -> None:
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_finance_settings",
		"You do not have permission to manage finance settings.",
	)


def assert_may_manage_hr_settings() -> None:
	if is_break_glass_user():
		return
	_assert_cap(
		"can_manage_hr_settings",
		"You do not have permission to manage HR settings.",
	)


# ── Phase 4.a: foundation asserters (used by 4.b–4.e) ────────────────────


def assert_may_view_batch_audit() -> None:
	"""Read access to the unified Batch Audit table."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_view_batch_audit",
		"You do not have permission to view the batch audit log.",
	)


def assert_may_send_password_reset_link() -> None:
	"""Trigger a password-reset email for another user. Store Manager /
	HR get this; own-branch scoping is layered on top at the call-site
	(branch-aware dispatch lands with 4.e)."""
	if is_break_glass_user():
		return
	_assert_cap(
		"can_send_password_reset_link",
		"You do not have permission to send password reset links.",
	)


def assert_may_set_user_password_directly() -> None:
	"""Set another user's password without going through the secure
	token flow. ADMIN ONLY — Store Manager + HR must never have this
	capability per the Phase 4 modification (M4). Even break-glass
	(System Manager) is required to pass through this gate so the
	caller appears in the audit trail."""
	if is_break_glass_user():
		# System Manager / Administrator are the only break-glass roles.
		# They pass automatically, but the action MUST still be audited
		# by the caller (the helper does not write the audit row itself).
		return
	_assert_cap(
		"can_set_user_password_directly",
		"Only the Administrator may set a user's password directly. "
		"Use the password-reset link flow instead.",
	)

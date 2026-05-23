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
}

_CAPS_INVENTORY = {
	"can_access_inventory": True,
	"can_operate_inventory": True,
}

_CAPS_PURCHASING = {
	"can_access_purchasing": True,
}

_CAPS_STORE_MANAGER = {
	"can_access_admin_workspace": True,
	"can_view_operational_kpis": True,
	"can_view_financial_kpis": False,
	"can_view_purchase_approvals": True,
	"can_view_approvals_dashboard": True,
	"can_approve_purchasing": True,
	"can_approve_shift": False,
	"can_view_shift_reports": True,
	"can_view_pos_monitor": True,
}

_CAPS_ACCOUNTANT = {
	"can_access_admin_workspace": True,
	"can_access_accountant_workspace": True,
	"can_view_operational_kpis": True,
	"can_view_financial_kpis": True,
	"can_view_supplier_payments": True,
	"can_manage_supplier_payments": True,
	"can_manage_supplier_payable": True,
	"can_access_invoice_matching": True,
	"can_view_purchase_approvals": True,
	"can_view_approvals_dashboard": True,
	"can_approve_purchasing": False,
	"can_approve_purchasing_accountant": False,
	"can_approve_shift": True,
}

_CAPS_HR = {
	"can_access_hr_workspace": True,
	"can_manage_operational_users": True,
	"can_manage_users": True,
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
	"can_approve_purchasing",
	"can_approve_purchasing_accountant",
	"can_approve_shift",
	"can_view_pos_monitor",
	"can_manage_system",
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

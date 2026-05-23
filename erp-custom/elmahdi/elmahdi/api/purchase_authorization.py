"""
Purchase Receipt approval/rejection — authorization (single source of truth).

Policy (fail-closed):
- Only **Elmahdi Store Manager** (+ break-glass Administrator) may approve/reject purchase receipts.
- **Accountant** handles AP / Purchase Invoice / Payment Entry / GL — not PR workflow approval.
- No ERP role fallback (Accounts User, Purchase Manager, Sales Manager, etc.).
- Purchasing officers create drafts only; self-approval blocked except break-glass.
"""

from __future__ import annotations

import frappe
from frappe import _

BREAK_GLASS_ERP_ROLES = frozenset({"Administrator", "System Manager"})

PURCHASE_APPROVER_ROLE_PROFILES = frozenset(
	{
		"Elmahdi Store Manager",
		"Elmahdi Administrator",
	}
)


def user_erp_roles(user: str | None = None) -> set[str]:
	u = user or frappe.session.user
	return set(frappe.get_roles(u))


def is_break_glass_user(user: str | None = None) -> bool:
	return bool(user_erp_roles(user) & BREAK_GLASS_ERP_ROLES)


def user_role_profile(user: str | None = None) -> str:
	u = user or frappe.session.user
	if u in ("Guest",):
		return ""
	return (frappe.db.get_value("User", u, "role_profile_name") or "").strip()


def has_purchase_approver_role_profile(user: str | None = None) -> bool:
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	profile = user_role_profile(u)
	if not profile:
		return False
	if profile in PURCHASE_APPROVER_ROLE_PROFILES:
		return True
	pl = profile.lower()
	return any(p.lower() == pl for p in PURCHASE_APPROVER_ROLE_PROFILES)


def may_act_as_purchase_approver(user: str | None = None) -> bool:
	"""Approve/reject/list pending purchase receipts — store manager profile only."""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	if is_break_glass_user(u):
		return True
	if has_purchase_approver_role_profile(u):
		return True
	from elmahdi.api.spa_authorization import has_cap

	return bool(has_cap("can_approve_purchasing", user))


def assert_may_act_as_purchase_approver(user: str | None = None) -> None:
	if not may_act_as_purchase_approver(user):
		frappe.throw(
			_("Only store management may approve or reject purchase receipts."),
			frappe.PermissionError,
		)


def may_view_purchase_approvals(user: str | None = None) -> bool:
	"""Read approval queue — managers and finance may view; only managers may act."""
	if is_break_glass_user(user):
		return True
	if may_act_as_purchase_approver(user):
		return True
	from elmahdi.api.spa_authorization import has_cap

	return bool(
		has_cap("can_view_purchase_approvals", user) or has_cap("can_view_approvals_dashboard", user)
	)


def assert_may_view_purchase_approvals(user: str | None = None) -> None:
	if not may_view_purchase_approvals(user):
		frappe.throw(_("You do not have permission to view purchase approvals."), frappe.PermissionError)

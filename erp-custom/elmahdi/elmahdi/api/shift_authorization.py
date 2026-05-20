"""
POS shift closing — authorization (single source of truth).

Used by:
- `pos_closing_approval` whitelisted methods (approve / reject / list pending)
- `POS Closing Entry` hooks (`before_submit`, `on_update`)

Policy (fail-closed):
- Only designated approvers may approve/reject/finalize a POS Closing Entry.
- Cashiers may create closing drafts but must never submit them.
- Self-approval is blocked (closing owner cannot approve their own draft), except break-glass admins.
"""

from __future__ import annotations

import frappe
from frappe import _

# ERPNext Role names (Title Case as stored in `tabRole`)
SHIFT_CLOSING_APPROVER_ERP_ROLES = frozenset(
	{
		"Store Manager",
		"POS Manager",
		"Accounts Manager",
		"Accounts User",
		"Sales Manager",
		"Stock Manager",
		"Purchase Manager",
	}
)

BREAK_GLASS_ERP_ROLES = frozenset({"Administrator", "System Manager"})

CASHIER_ERP_ROLES = frozenset({"POS User", "Sales User"})

# Elmahdi Role Profile names (must stay aligned with `src/auth/capabilityProfiles.js` + provisioning)
SHIFT_CLOSING_APPROVER_ROLE_PROFILES = frozenset(
	{
		"Elmahdi Store Manager",
		"Elmahdi Accountant",
		"Elmahdi Administrator",
	}
)


def user_erp_roles(user: str | None = None) -> set[str]:
	u = user or frappe.session.user
	return set(frappe.get_roles(u))


def is_break_glass_user(user: str | None = None) -> bool:
	return bool(user_erp_roles(user) & BREAK_GLASS_ERP_ROLES)


def has_shift_closing_approver_erp_role(user: str | None = None) -> bool:
	return bool(user_erp_roles(user) & SHIFT_CLOSING_APPROVER_ERP_ROLES)


def _normalize_profile(name: str) -> str:
	return (name or "").strip()


def has_shift_closing_approver_role_profile(user: str | None = None) -> bool:
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	profile = _normalize_profile(frappe.db.get_value("User", u, "role_profile_name") or "")
	if not profile:
		return False
	if profile in SHIFT_CLOSING_APPROVER_ROLE_PROFILES:
		return True
	pl = profile.lower()
	return any(p.lower() == pl for p in SHIFT_CLOSING_APPROVER_ROLE_PROFILES)


def may_act_as_pos_closing_approver(user: str | None = None) -> bool:
	"""True if user may approve/reject/list pending POS closings (policy gate, no doc yet)."""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	if is_break_glass_user(u):
		return True
	if has_shift_closing_approver_role_profile(u):
		return True
	if has_shift_closing_approver_erp_role(u):
		return True
	return False


def assert_may_act_as_pos_closing_approver(user: str | None = None) -> None:
	if not may_act_as_pos_closing_approver(user):
		frappe.throw(
			_("You do not have permission to approve shift closings."),
			frappe.PermissionError,
		)


def assert_not_self_approval(doc) -> None:
	"""Block approver from acting on their own closing draft (anti self-approval)."""
	if is_break_glass_user():
		return
	if doc.owner == frappe.session.user:
		frappe.throw(
			_("You cannot approve your own shift closing."),
			frappe.PermissionError,
		)


def primary_approval_role_label() -> str:
	roles = user_erp_roles()
	if roles & {"Accounts Manager", "Accounts User"}:
		return "accountant"
	if roles & {
		"Store Manager",
		"POS Manager",
		"Sales Manager",
		"Stock Manager",
		"Purchase Manager",
	}:
		return "manager"
	return "admin"


def may_access_pos_opening_session(opening_doc, user: str | None = None) -> bool:
	"""
	Who may read shift aggregates / create a closing draft for this opening (beyond ERP read).

	Fail-closed: approvers and break-glass may access any opening they can read; others only
	when they are the session operator (`user`) or document owner.
	"""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	if is_break_glass_user(u):
		return True
	if may_act_as_pos_closing_approver(u):
		return True
	op_user = (getattr(opening_doc, "user", None) or "").strip()
	if op_user and u == op_user:
		return True
	owner = (getattr(opening_doc, "owner", None) or "").strip()
	if owner and u == owner:
		return True
	return False


def assert_may_access_pos_opening_session(opening_doc, user: str | None = None) -> None:
	if not may_access_pos_opening_session(opening_doc, user):
		frappe.throw(_("You do not have permission to access this shift."), frappe.PermissionError)

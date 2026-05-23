"""
POS shift closing — authorization (single source of truth).

Used by:
- `pos_closing_approval` whitelisted methods (approve / reject / list pending)
- `POS Closing Entry` hooks (`before_submit`, `on_update`)
- `shifts.py` session read / reconciliation aggregates

Policy (fail-closed):
- Only **Elmahdi Accountant** (and break-glass Administrator) may approve/reject/finalize closings.
- **Elmahdi Store Manager** is monitor-only (shift reports / session read, no approve).
- No legacy ERP role bypass (Sales Manager, POS Manager, Stock Manager, etc.).
- Cashiers create closing drafts only; never submit.
- Self-approval blocked except break-glass.
"""

from __future__ import annotations

import frappe
from frappe import _

BREAK_GLASS_ERP_ROLES = frozenset({"Administrator", "System Manager"})

CASHIER_ERP_ROLES = frozenset({"POS User", "Sales User"})

# Role profiles that may approve/reject POS Closing Entry (aligned with capabilityProfiles.js)
SHIFT_CLOSING_APPROVER_ROLE_PROFILES = frozenset(
	{
		"Elmahdi Accountant",
		"Elmahdi Administrator",
	}
)

ACCOUNTANT_PROFILE_ALIASES = frozenset(
	{
		"Elmahdi Accountant",
		"Accountant",
		"Accounts Manager",
	}
)


def user_erp_roles(user: str | None = None) -> set[str]:
	u = user or frappe.session.user
	return set(frappe.get_roles(u))


def is_break_glass_user(user: str | None = None) -> bool:
	return bool(user_erp_roles(user) & BREAK_GLASS_ERP_ROLES)


def _normalize_profile(name: str) -> str:
	return (name or "").strip()


def user_role_profile(user: str | None = None) -> str:
	u = user or frappe.session.user
	if u in ("Guest",):
		return ""
	return _normalize_profile(frappe.db.get_value("User", u, "role_profile_name") or "")


def has_shift_closing_approver_role_profile(user: str | None = None) -> bool:
	"""Profile-only gate — no ERP role name inference."""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	profile = user_role_profile(u)
	if not profile:
		return False
	if profile in SHIFT_CLOSING_APPROVER_ROLE_PROFILES:
		return True
	if profile in ACCOUNTANT_PROFILE_ALIASES:
		return True
	pl = profile.lower()
	return any(p.lower() == pl for p in SHIFT_CLOSING_APPROVER_ROLE_PROFILES | ACCOUNTANT_PROFILE_ALIASES)


def may_view_shift_reports(user: str | None = None) -> bool:
	"""Monitor-only shift visibility (store manager, accountant, admin)."""
	if is_break_glass_user(user):
		return True
	if may_act_as_pos_closing_approver(user):
		return True
	from elmahdi.api.spa_authorization import has_cap

	return bool(has_cap("can_view_shift_reports", user) or has_cap("can_view_pos_monitor", user))


def may_act_as_pos_closing_approver(user: str | None = None) -> bool:
	"""True if user may approve/reject/list pending POS closings."""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	if is_break_glass_user(u):
		return True
	if has_shift_closing_approver_role_profile(u):
		return True
	from elmahdi.api.spa_authorization import has_cap

	return bool(has_cap("can_approve_shift", user))


def assert_may_act_as_pos_closing_approver(user: str | None = None) -> None:
	if not may_act_as_pos_closing_approver(user):
		frappe.throw(
			_("Only finance (accountant) staff may approve or reject shift closings."),
			frappe.PermissionError,
		)


def assert_not_self_approval(doc) -> None:
	if is_break_glass_user():
		return
	if doc.owner == frappe.session.user:
		frappe.throw(
			_("You cannot approve your own shift closing."),
			frappe.PermissionError,
		)


def primary_approval_role_label() -> str:
	roles = user_erp_roles()
	if roles & {"Accounts Manager", "Accounts User"} or has_shift_closing_approver_role_profile():
		return "accountant"
	if is_break_glass_user():
		return "admin"
	return "accountant"


def may_access_pos_opening_session(opening_doc, user: str | None = None) -> bool:
	"""
	Who may read shift aggregates / create a closing draft for this opening (beyond ERP read).

	Fail-closed: break-glass, shift approvers, and monitor roles may read; others only when
	they are the session operator or document owner.
	"""
	u = user or frappe.session.user
	if u in ("Guest",):
		return False
	if is_break_glass_user(u):
		return True
	if may_act_as_pos_closing_approver(u):
		return True
	if may_view_shift_reports(u):
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

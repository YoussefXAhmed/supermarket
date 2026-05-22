"""
Supplier payment vs payable segregation (SPA policy).

Purchasing clerks receive goods and create purchase receipts.
Accounts staff record supplier payments (Payment Entry).
Managers/accountants may create or retry payables (Purchase Invoice) after approval.
"""

from __future__ import annotations

import frappe
from frappe import _

BREAK_GLASS_ROLES = frozenset({"Administrator", "System Manager"})
PAYMENT_OPERATOR_ROLES = frozenset({"Accounts Manager", "Accounts User"})
PAYABLE_MGMT_ROLES = frozenset(
	{
		"Administrator",
		"System Manager",
		"Accounts Manager",
		"Accounts User",
		"Purchase Manager",
		"Stock Manager",
		"Sales Manager",
		"Store Manager",
		"POS Manager",
	}
)


def _user_roles(user: str | None = None) -> set[str]:
	u = user or frappe.session.user
	return set(frappe.get_roles(u))


def may_record_supplier_payment(user: str | None = None) -> bool:
	"""Payment Entry (cash/bank movement) — accounts staff and break-glass only."""
	if (user or frappe.session.user) in ("Guest",):
		return False
	return bool(_user_roles(user) & (BREAK_GLASS_ROLES | PAYMENT_OPERATOR_ROLES))


def assert_may_record_supplier_payment() -> None:
	if not may_record_supplier_payment():
		frappe.throw(
			_("Only accounts staff may record supplier payments."),
			frappe.PermissionError,
		)


def may_manage_supplier_payable_via_api(user: str | None = None) -> bool:
	"""Purchase Invoice create/retry via whitelisted API — not pure purchasing clerks."""
	if (user or frappe.session.user) in ("Guest",):
		return False
	roles = _user_roles(user) - {"All", "Guest", "Desk User"}
	if roles & (BREAK_GLASS_ROLES | PAYABLE_MGMT_ROLES):
		return True
	return False


def assert_may_manage_supplier_payable_via_api() -> None:
	if not may_manage_supplier_payable_via_api():
		frappe.throw(
			_(
				"Purchasing users cannot create or retry supplier payables. "
				"Use the approval workflow or contact finance."
			),
			frappe.PermissionError,
		)

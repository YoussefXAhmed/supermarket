"""
Supplier master authorization (single source of truth, fail-closed).

Used by:
- `hooks.py` Supplier doc_events (validate / on_trash)
- Optional whitelisted endpoints if we later wrap supplier CRUD

Policy (matches the supermarket workflow):
- View suppliers: anyone with any operational workspace.
- Create / edit / enable-disable suppliers: Administrator + Elmahdi Store Manager.
- Delete suppliers: Administrator only.
- Inventory Clerks, Purchasing Officers, Accountants, Cashiers, HR Officers
  can only READ, never write. Backend rejects writes from these users.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import has_cap
from elmahdi.api.purchase_authorization import is_break_glass_user, user_role_profile


SUPPLIER_EDITOR_PROFILES = frozenset(
	{"Elmahdi Administrator", "Elmahdi Store Manager"}
)

# Store Manager + Administrator can delete suppliers. The Frappe `LinkExistsError`
# guard below still prevents deleting a supplier that has linked transactions,
# regardless of role — so deletion is only possible for clean records.
SUPPLIER_DELETER_PROFILES = frozenset(
	{"Elmahdi Administrator", "Elmahdi Store Manager"}
)


def may_view_supplier(user: str | None = None) -> bool:
	if has_cap("can_manage_system", user):
		return True
	# Any operational workspace cap lets you see the supplier list.
	return bool(
		has_cap("can_view_suppliers", user)
		or has_cap("can_access_purchasing", user)
		or has_cap("can_access_accountant_workspace", user)
		or has_cap("can_access_inventory", user)
		or has_cap("can_access_admin_workspace", user)
		or has_cap("can_access_hr_workspace", user)
		or has_cap("can_operate_pos", user)
	)


def may_manage_supplier(user: str | None = None) -> bool:
	if has_cap("can_manage_system", user):
		return True
	if is_break_glass_user(user):
		return True
	return user_role_profile(user) in SUPPLIER_EDITOR_PROFILES


def may_delete_supplier(user: str | None = None) -> bool:
	if has_cap("can_manage_system", user):
		return True
	if is_break_glass_user(user):
		return True
	return user_role_profile(user) in SUPPLIER_DELETER_PROFILES


def assert_may_view_supplier(user: str | None = None) -> None:
	if not may_view_supplier(user):
		frappe.throw(
			_("You do not have permission to view suppliers."),
			frappe.PermissionError,
		)


def assert_may_manage_supplier(user: str | None = None) -> None:
	if not may_manage_supplier(user):
		frappe.throw(
			_("Only Administrator and Store Manager can create or edit suppliers."),
			frappe.PermissionError,
		)


def assert_may_delete_supplier(user: str | None = None) -> None:
	if not may_delete_supplier(user):
		frappe.throw(
			_("Only Administrator and Store Manager can delete suppliers."),
			frappe.PermissionError,
		)


# ── doc_event hooks (wired in hooks.py) ──────────────────────────────────────


def validate_supplier_write(doc, method=None):
	"""Block create/update for users outside the editor allowlist.

	Frappe's `validate` fires on both insert and update; this single hook
	covers both paths. Submitting a disable flag is treated as an edit.
	"""
	# Skip when Frappe is running internal background jobs (no session user).
	user = getattr(frappe.session, "user", None) or ""
	if user in ("", "Guest"):
		return
	assert_may_manage_supplier(user)


def before_trash_supplier(doc, method=None):
	"""Block delete for anyone but Administrator. Also fail-closed when
	the supplier has linked transactions — even Admin shouldn't silently
	cascade-delete supplier ledger history."""
	user = getattr(frappe.session, "user", None) or ""
	if user in ("", "Guest"):
		return
	assert_may_delete_supplier(user)

	linked = (
		frappe.db.count("Purchase Receipt", {"supplier": doc.name, "docstatus": ["!=", 2]})
		+ frappe.db.count("Purchase Invoice", {"supplier": doc.name, "docstatus": ["!=", 2]})
		+ frappe.db.count("Payment Entry", {"party_type": "Supplier", "party": doc.name, "docstatus": ["!=", 2]})
	)
	if linked:
		frappe.throw(
			_(
				"Cannot delete supplier {0} — it is linked to {1} active transaction(s). "
				"Disable the supplier instead."
			).format(doc.name, linked),
			frappe.LinkExistsError,
		)

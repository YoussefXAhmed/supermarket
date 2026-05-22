"""
POS Profile Authorization — single source of truth.

Policy (fail-closed):
  - If a POS Profile has no users configured  → all authenticated POS users may use it.
  - If a POS Profile has users configured     → only listed users may use it.
  - Break-glass (System Manager / Administrator) always bypass.
  - POS Managers / Store Managers may bypass for monitoring/recovery purposes.
  - An invoice or shift whose declared warehouse does not match the profile warehouse is rejected.

Public surface:
  assert_user_authorized_for_pos_profile(pos_profile, user=None)
  assert_invoice_warehouse_matches_profile(pos_profile, declared_warehouse)
"""

from __future__ import annotations

import frappe
from frappe import _

# Roles that may use any POS Profile without being in the applicable_for_users list.
# These are supervisory roles — not operational cashiers.
_MANAGER_OVERRIDE_ROLES = frozenset(
    {
        "Administrator",
        "System Manager",
        "Store Manager",
        "POS Manager",
        "Sales Manager",
    }
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _current_user(user: str | None) -> str:
    return user or frappe.session.user


def _is_override_user(user: str | None = None) -> bool:
    """Break-glass or POS manager roles bypass the profile user-list check."""
    u = _current_user(user)
    if u in ("Guest",):
        return False
    roles = set(frappe.get_roles(u))
    return bool(roles & _MANAGER_OVERRIDE_ROLES)


def _get_profile_doc(pos_profile: str):
    """Fetch the POS Profile doc; throw ValidationError if it does not exist."""
    if not frappe.db.exists("POS Profile", pos_profile):
        frappe.throw(
            _("POS Profile {0} does not exist.").format(pos_profile),
            frappe.ValidationError,
        )
    return frappe.get_doc("POS Profile", pos_profile)


def _applicable_users(profile_doc) -> list[str]:
    """
    Return the list of usernames in `applicable_for_users`.
    Empty list means the profile is open to all POS users (ERPNext convention).
    """
    rows = profile_doc.get("applicable_for_users") or []
    return [str(row.user).strip() for row in rows if getattr(row, "user", None)]


# ---------------------------------------------------------------------------
# Public authorization API
# ---------------------------------------------------------------------------


def is_user_authorized_for_pos_profile(
    pos_profile: str,
    user: str | None = None,
) -> bool:
    """
    Return True if `user` (defaults to session user) may operate on `pos_profile`.

    Decision tree:
      1. Guest → always False
      2. Override role (System Manager, Store Manager, POS Manager, ...) → True
      3. No users configured on the profile → True (open profile)
      4. User is in applicable_for_users → True
      5. Otherwise → False
    """
    u = _current_user(user)

    if u in ("Guest",):
        return False

    if _is_override_user(u):
        return True

    try:
        profile_doc = _get_profile_doc(pos_profile)
    except frappe.ValidationError:
        return False

    allowed = _applicable_users(profile_doc)

    # No users configured → open profile (ERPNext convention)
    if not allowed:
        return True

    return u in allowed


def assert_user_authorized_for_pos_profile(
    pos_profile: str,
    user: str | None = None,
) -> None:
    """
    Raise frappe.PermissionError if the user is not authorized for this POS Profile.

    Raise frappe.ValidationError if pos_profile is blank or does not exist.

    This is the primary guard — call it early in every POS endpoint that accepts
    a pos_profile from the client.
    """
    if not pos_profile:
        frappe.throw(_("POS Profile is required."), frappe.ValidationError)

    u = _current_user(user)

    if u in ("Guest",):
        frappe.throw(
            _("You must be logged in to use POS."),
            frappe.PermissionError,
        )

    # Validate profile exists (throws ValidationError if not)
    profile_doc = _get_profile_doc(pos_profile)

    if _is_override_user(u):
        return  # managers bypass the user-list check

    allowed = _applicable_users(profile_doc)

    # Open profile (no user list configured)
    if not allowed:
        return

    if u not in allowed:
        frappe.throw(
            _(
                "You are not authorized to use POS Profile {0}. "
                "Contact your store manager to be added to this profile."
            ).format(pos_profile),
            frappe.PermissionError,
        )


def assert_invoice_warehouse_matches_profile(
    pos_profile: str,
    declared_warehouse: str,
) -> None:
    """
    Ensure the warehouse in the client payload matches the POS Profile's warehouse.

    Prevents a cashier from changing the warehouse field to access a different
    branch's stock.  Break-glass and manager roles are exempt.
    """
    if not pos_profile or not declared_warehouse:
        return  # handled by required-field checks upstream

    if _is_override_user():
        return

    profile_warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse") or ""
    if not profile_warehouse:
        # Profile has no warehouse set — let ERPNext validate this separately.
        return

    if declared_warehouse.strip() != profile_warehouse.strip():
        frappe.throw(
            _(
                "Warehouse {0} does not match POS Profile {1} (expected {2}). "
                "Do not modify the warehouse field."
            ).format(declared_warehouse, pos_profile, profile_warehouse),
            frappe.PermissionError,
        )

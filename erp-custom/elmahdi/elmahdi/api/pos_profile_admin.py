"""
POS Profile administration — SPA endpoints so Administrator and Store Manager
can change the warehouse / price list / enable flag on a POS Profile without
opening ERPNext Desk.

Cashiers and other operational users are not allowed here (they read-only
their profile via posApi.listPOSProfiles + getPOSProfile). Writing the
warehouse from POS would let a cashier silently swap stores mid-shift, which
is exactly what the user wanted to prevent.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.purchase_authorization import is_break_glass_user, user_role_profile


_PROFILE_FIELDS = (
    "name",
    "company",
    "warehouse",
    "selling_price_list",
    "currency",
    "customer",
    "write_off_account",
    "write_off_cost_center",
    "disabled",
    "modified",
)


def _may_manage_pos_profiles(user: str | None = None) -> bool:
    u = user or frappe.session.user
    if u in ("Guest",):
        return False
    if is_break_glass_user(u):
        return True
    profile = user_role_profile(u)
    if profile in ("Elmahdi Store Manager", "Elmahdi Administrator"):
        return True
    return False


def _assert_may_manage() -> None:
    if not _may_manage_pos_profiles():
        frappe.throw(
            _("Only Store Manager and Administrator may manage POS Profiles."),
            frappe.PermissionError,
        )


@frappe.whitelist()
def list_pos_profiles() -> dict:
    _assert_may_manage()
    rows = frappe.get_all(
        "POS Profile",
        fields=list(_PROFILE_FIELDS),
        order_by="name",
        limit_page_length=0,
    )
    return {"rows": rows, "count": len(rows)}


@frappe.whitelist()
def get_pos_profile(name: str) -> dict:
    _assert_may_manage()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)
    doc = frappe.get_doc("POS Profile", name)
    return {field: getattr(doc, field, None) for field in _PROFILE_FIELDS}


@frappe.whitelist(methods=["POST"])
def update_pos_profile(
    name: str,
    warehouse: str | None = None,
    selling_price_list: str | None = None,
    disabled: int | None = None,
) -> dict:
    """Update warehouse / price list / disabled flag on a POS Profile.

    Only Administrator and Store Manager may call this. Warehouse must exist
    and not be a group. Disabled is normalised to 0/1.
    """
    _assert_may_manage()
    if not name:
        frappe.throw(_("name is required"), frappe.ValidationError)

    doc = frappe.get_doc("POS Profile", name)
    changed: list[str] = []

    if warehouse is not None and warehouse != doc.warehouse:
        if not frappe.db.exists("Warehouse", warehouse):
            frappe.throw(_("Warehouse {0} not found").format(warehouse), frappe.ValidationError)
        if frappe.db.get_value("Warehouse", warehouse, "is_group"):
            frappe.throw(_("Cannot use a group warehouse"), frappe.ValidationError)
        if frappe.db.get_value("Warehouse", warehouse, "disabled"):
            frappe.throw(_("Warehouse {0} is disabled").format(warehouse), frappe.ValidationError)
        doc.warehouse = warehouse
        changed.append("warehouse")

    if selling_price_list is not None and selling_price_list != doc.selling_price_list:
        if not frappe.db.exists("Price List", selling_price_list):
            frappe.throw(
                _("Price List {0} not found").format(selling_price_list),
                frappe.ValidationError,
            )
        doc.selling_price_list = selling_price_list
        changed.append("selling_price_list")

    if disabled is not None:
        new_disabled = 1 if str(disabled).lower() in ("1", "true") else 0
        if new_disabled != int(doc.disabled or 0):
            doc.disabled = new_disabled
            changed.append("disabled")

    if not changed:
        return {"name": doc.name, "changed": [], "noop": True}

    doc.save(ignore_permissions=True)
    return {
        "name": doc.name,
        "changed": changed,
        "warehouse": doc.warehouse,
        "selling_price_list": doc.selling_price_list,
        "disabled": int(doc.disabled or 0),
    }


@frappe.whitelist()
def list_eligible_warehouses(company: str | None = None) -> dict:
    """Warehouse choices for the POS Profile editor."""
    _assert_may_manage()
    filters = [["is_group", "=", 0], ["disabled", "=", 0]]
    if company:
        filters.append(["company", "=", company])
    rows = frappe.get_all(
        "Warehouse",
        filters=filters,
        fields=["name", "warehouse_name", "company"],
        order_by="name",
        limit_page_length=0,
    )
    return {"rows": rows, "count": len(rows)}


@frappe.whitelist()
def list_eligible_price_lists() -> dict:
    """Selling Price List choices."""
    _assert_may_manage()
    rows = frappe.get_all(
        "Price List",
        filters=[["selling", "=", 1], ["enabled", "=", 1]],
        fields=["name", "currency"],
        order_by="name",
        limit_page_length=0,
    )
    return {"rows": rows, "count": len(rows)}

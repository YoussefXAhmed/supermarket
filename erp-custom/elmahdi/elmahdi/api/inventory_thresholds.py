"""
Item-level inventory thresholds — SPA management layer.

Each Item gets three custom fields (added in setup/approval_custom_fields.py):
- elmahdi_alert_level     — qty at which to surface in Low Stock Alerts
- elmahdi_reorder_level   — qty at which to surface in Reorder list
- elmahdi_reorder_qty     — suggested qty to order when restocking

We do NOT duplicate stock quantities. Current-on-hand is always sourced from
the ERPNext Bin table via the same query the existing inventory pages use.

Authorization:
- Read (list alerts / reorder) — any user with can_access_inventory or
  can_view_pos_monitor (manager monitoring).
- Write (update_item_thresholds) — store manager or admin only.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt

from elmahdi.api.spa_authorization import has_cap
from elmahdi.api.purchase_authorization import is_break_glass_user, user_role_profile


# ── authorization ────────────────────────────────────────────────────────────


def _assert_may_view_inventory() -> None:
    if has_cap("can_access_inventory") or has_cap("can_manage_system") or has_cap("can_view_pos_monitor"):
        return
    frappe.throw(_("You do not have permission to view inventory."), frappe.PermissionError)


def _assert_may_edit_thresholds() -> None:
    if has_cap("can_manage_system"):
        return
    profile = user_role_profile()
    if profile in ("Elmahdi Store Manager", "Elmahdi Administrator"):
        return
    if is_break_glass_user():
        return
    frappe.throw(
        _("Only Store Manager and Administrator may edit inventory thresholds."),
        frappe.PermissionError,
    )


# ── shared query — total qty per item across warehouses ─────────────────────


def _qty_rows(warehouse: str | None = None):
    """
    Returns list of dicts: {item_code, warehouse, actual_qty, item_name,
    item_group, alert_level, reorder_level, reorder_qty}

    Joins Bin (live qty) with Item (custom thresholds).
    """
    extra_where = ""
    args = []
    if warehouse:
        extra_where = "AND b.warehouse = %s"
        args.append(warehouse)

    rows = frappe.db.sql(
        f"""
        SELECT
            b.item_code,
            b.warehouse,
            b.actual_qty,
            b.reserved_qty,
            i.item_name,
            i.item_group,
            i.stock_uom,
            COALESCE(i.elmahdi_alert_level, 0)   AS alert_level,
            COALESCE(i.elmahdi_reorder_level, 0) AS reorder_level,
            COALESCE(i.elmahdi_reorder_qty, 0)   AS reorder_qty
        FROM `tabBin` b
        JOIN `tabItem` i ON i.name = b.item_code
        WHERE i.disabled = 0
          AND i.is_stock_item = 1
          {extra_where}
        ORDER BY b.actual_qty ASC, b.item_code ASC
        """,
        args,
        as_dict=True,
    )
    return rows


def _classify_status(qty: float, alert: float, reorder: float) -> str:
    if qty <= 0:
        return "out"
    if alert > 0 and qty <= alert:
        return "alert"
    if reorder > 0 and qty <= reorder:
        return "reorder"
    return "ok"


# ── public API ───────────────────────────────────────────────────────────────


@frappe.whitelist()
def list_low_stock_items(warehouse: str | None = None) -> dict:
    """Items whose current qty ≤ their item-level alert threshold.

    `warehouse` filter is optional. When omitted, returns rows for every
    warehouse-item combo where actual_qty ≤ alert_level. Items without an
    alert threshold (alert_level == 0) are skipped — the user hasn't opted
    in for monitoring.
    """
    _assert_may_view_inventory()
    rows = _qty_rows(warehouse)
    out = []
    for r in rows:
        alert = flt(r.alert_level)
        if alert <= 0:
            continue
        if flt(r.actual_qty) > alert:
            continue
        out.append({
            "item_code": r.item_code,
            "item_name": r.item_name,
            "item_group": r.item_group,
            "warehouse": r.warehouse,
            "stock_uom": r.stock_uom,
            "actual_qty": flt(r.actual_qty),
            "reserved_qty": flt(r.reserved_qty),
            "alert_level": alert,
            "reorder_level": flt(r.reorder_level),
            "status": _classify_status(flt(r.actual_qty), alert, flt(r.reorder_level)),
        })
    return {"rows": out, "count": len(out)}


@frappe.whitelist()
def list_reorder_items(warehouse: str | None = None) -> dict:
    """Items whose current qty ≤ their item-level reorder threshold.

    Returns suggested qty so the SPA can pre-fill the Receive Goods form.
    """
    _assert_may_view_inventory()
    rows = _qty_rows(warehouse)
    out = []
    for r in rows:
        reorder = flt(r.reorder_level)
        if reorder <= 0:
            continue
        if flt(r.actual_qty) > reorder:
            continue
        out.append({
            "item_code": r.item_code,
            "item_name": r.item_name,
            "item_group": r.item_group,
            "warehouse": r.warehouse,
            "stock_uom": r.stock_uom,
            "actual_qty": flt(r.actual_qty),
            "reorder_level": reorder,
            "suggested_qty": flt(r.reorder_qty),
            "alert_level": flt(r.alert_level),
        })
    return {"rows": out, "count": len(out)}


@frappe.whitelist()
def get_item_thresholds(item_code: str) -> dict:
    """Fetch the three threshold fields for one item."""
    _assert_may_view_inventory()
    if not item_code:
        frappe.throw(_("item_code is required"), frappe.ValidationError)
    if not frappe.db.exists("Item", item_code):
        frappe.throw(_("Item {0} not found").format(item_code), frappe.DoesNotExistError)
    row = frappe.db.get_value(
        "Item",
        item_code,
        ["item_name", "stock_uom", "elmahdi_alert_level", "elmahdi_reorder_level", "elmahdi_reorder_qty"],
        as_dict=True,
    ) or {}
    return {
        "item_code": item_code,
        "item_name": row.get("item_name"),
        "stock_uom": row.get("stock_uom"),
        "alert_level": flt(row.get("elmahdi_alert_level")),
        "reorder_level": flt(row.get("elmahdi_reorder_level")),
        "reorder_qty": flt(row.get("elmahdi_reorder_qty")),
    }


@frappe.whitelist(methods=["POST"])
def update_item_thresholds(
    item_code: str,
    alert_level: float | None = None,
    reorder_level: float | None = None,
    reorder_qty: float | None = None,
) -> dict:
    """Update one or more of the three thresholds on an Item.

    Store Manager / Administrator only. Validates non-negative + cross-field
    consistency (alert ≤ reorder when both are set).
    """
    _assert_may_edit_thresholds()
    if not item_code:
        frappe.throw(_("item_code is required"), frappe.ValidationError)
    if not frappe.db.exists("Item", item_code):
        frappe.throw(_("Item {0} not found").format(item_code), frappe.DoesNotExistError)

    updates: dict = {}
    if alert_level is not None:
        v = flt(alert_level)
        if v < 0:
            frappe.throw(_("Alert level cannot be negative"), frappe.ValidationError)
        updates["elmahdi_alert_level"] = v
    if reorder_level is not None:
        v = flt(reorder_level)
        if v < 0:
            frappe.throw(_("Reorder level cannot be negative"), frappe.ValidationError)
        updates["elmahdi_reorder_level"] = v
    if reorder_qty is not None:
        v = flt(reorder_qty)
        if v < 0:
            frappe.throw(_("Reorder qty cannot be negative"), frappe.ValidationError)
        updates["elmahdi_reorder_qty"] = v

    if not updates:
        return {"item_code": item_code, "changed": [], "noop": True}

    # Cross-field check: if both alert + reorder are set after this update,
    # alert should be ≤ reorder (it's a softer threshold).
    new_alert = flt(updates.get("elmahdi_alert_level",
        frappe.db.get_value("Item", item_code, "elmahdi_alert_level")))
    new_reorder = flt(updates.get("elmahdi_reorder_level",
        frappe.db.get_value("Item", item_code, "elmahdi_reorder_level")))
    if new_alert > 0 and new_reorder > 0 and new_alert > new_reorder:
        frappe.throw(
            _("Alert level ({0}) cannot exceed reorder level ({1}).").format(
                new_alert, new_reorder
            ),
            frappe.ValidationError,
        )

    frappe.db.set_value("Item", item_code, updates, update_modified=True)
    return {
        "item_code": item_code,
        "changed": list(updates.keys()),
        **{k.replace("elmahdi_", ""): v for k, v in updates.items()},
    }

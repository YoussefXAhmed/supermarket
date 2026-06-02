"""
Item master CRUD for the SPA — used by the in-app Edit Item page.

Permissions (fail-closed):
- Read (get_item_master): any user with `can_access_inventory` or `can_manage_system`.
- Write (update_item_master, upload_item_image): only:
    - Administrator role profile
    - Stock Manager / Warehouse Manager / Item Manager ERP roles
    - Or `can_manage_system` capability
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt

from elmahdi.api.spa_authorization import has_cap
from elmahdi.api.purchase_authorization import is_break_glass_user, user_role_profile


SELLING_PRICE_LIST = "Standard Selling"
BUYING_PRICE_LIST = "Standard Buying"

ITEM_EDITOR_PROFILES = frozenset(
    {"Elmahdi Administrator", "Elmahdi Store Manager"}
)

ITEM_PRICING_PROFILES = frozenset(
    {"Elmahdi Administrator"}
)

# ── authorization ────────────────────────────────────────────────────────────


def _assert_may_view_item() -> None:
    """Everyone with any operational workspace can view an item master."""
    if (
        has_cap("can_access_inventory")
        or has_cap("can_manage_system")
        or has_cap("can_access_admin_workspace")
        or has_cap("can_access_purchasing")
        or has_cap("can_access_accountant_workspace")
        or has_cap("can_access_hr_workspace")
        or has_cap("can_operate_pos")
    ):
        return
    frappe.throw(_("You do not have permission to view items."), frappe.PermissionError)


def _may_edit_item() -> bool:
    if has_cap("can_manage_system"):
        return True
    if is_break_glass_user():
        return True
    return user_role_profile() in ITEM_EDITOR_PROFILES


def _may_edit_pricing() -> bool:
    if has_cap("can_manage_system"):
        return True
    if is_break_glass_user():
        return True
    return user_role_profile() in ITEM_PRICING_PROFILES


def _assert_may_edit_item() -> None:
    if not _may_edit_item():
        frappe.throw(
            _("Only Administrators and Store Managers may edit items."),
            frappe.PermissionError,
        )


def _assert_may_edit_pricing() -> None:
    if not _may_edit_pricing():
        frappe.throw(
            _("Only Administrators can modify pricing."),
            frappe.PermissionError,
        )


# ── helpers ─────────────────────────────────────────────────────────────────


def _get_item_price(item_code: str, price_list: str) -> float:
    name = frappe.db.get_value(
        "Item Price", {"item_code": item_code, "price_list": price_list}, "name"
    )
    if not name:
        return 0.0
    return flt(frappe.db.get_value("Item Price", name, "price_list_rate"))


def _set_item_price(item_code: str, price_list: str, rate: float) -> None:
    if not frappe.db.exists("Price List", price_list):
        return
    uom = frappe.db.get_value("Item", item_code, "stock_uom")
    existing = frappe.db.get_value(
        "Item Price", {"item_code": item_code, "price_list": price_list}, "name"
    )
    if existing:
        frappe.db.set_value("Item Price", existing, "price_list_rate", flt(rate))
        return
    frappe.get_doc(
        {
            "doctype": "Item Price",
            "item_code": item_code,
            "price_list": price_list,
            "price_list_rate": flt(rate),
            "uom": uom,
        }
    ).insert(ignore_permissions=True)


def _primary_barcode(item_code: str) -> str:
    row = frappe.db.get_value(
        "Item Barcode",
        {"parent": item_code, "parenttype": "Item"},
        ["barcode"],
        order_by="idx asc",
    )
    return row or ""


def _replace_primary_barcode(item_code: str, barcode: str) -> None:
    item = frappe.get_doc("Item", item_code)
    # Remove existing primary; keep any additional barcodes (idx > 1).
    kept = [
        b for b in (item.barcodes or []) if (b.idx or 0) > 1 and (b.barcode or "") != ""
    ]
    item.set("barcodes", [])
    if barcode:
        item.append("barcodes", {"barcode": barcode, "barcode_type": "CODE-128"})
    for b in kept:
        item.append(
            "barcodes",
            {"barcode": b.barcode, "barcode_type": b.barcode_type or "CODE-128"},
        )
    item.save(ignore_permissions=True)


# ── read ────────────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_item_master(item_code: str) -> dict[str, Any]:
    """Full item snapshot for the Edit Item page."""
    _assert_may_view_item()
    if not item_code:
        frappe.throw(_("item_code is required"), frappe.ValidationError)
    if not frappe.db.exists("Item", item_code):
        frappe.throw(_("Item not found"), frappe.DoesNotExistError)

    doc = frappe.db.get_value(
        "Item",
        item_code,
        [
            "name",
            "item_code",
            "item_name",
            "item_group",
            "brand",
            "stock_uom",
            "country_of_origin",
            "description",
            "image",
            "is_stock_item",
            "is_sales_item",
            "is_purchase_item",
            "has_batch_no",
            "has_expiry_date",
            "shelf_life_in_days",
            "standard_rate",
            "valuation_rate",
            "disabled",
            "weight_per_unit",
            "weight_uom",
        ],
        as_dict=True,
    ) or {}

    return {
        **doc,
        "selling_price": _get_item_price(item_code, SELLING_PRICE_LIST),
        "buying_price": _get_item_price(item_code, BUYING_PRICE_LIST),
        "barcode": _primary_barcode(item_code),
        "can_edit_item": _may_edit_item(),
        "can_edit_pricing": _may_edit_pricing(),
    }


# ── write ───────────────────────────────────────────────────────────────────


_EDITABLE_FIELDS = {
    "item_name",
    "item_group",
    "brand",
    "country_of_origin",
    "description",
    "stock_uom",
    "is_sales_item",
    "is_purchase_item",
    "has_batch_no",
    "has_expiry_date",
    "shelf_life_in_days",
    "standard_rate",
    "weight_per_unit",
    "weight_uom",
    "disabled",
}


@frappe.whitelist(methods=["POST"])
def update_item_master(item_code: str, **fields) -> dict[str, Any]:
    """
    Update the Item master + cascade selling/buying price + primary barcode.

    Permission split:
    - Item details (name, group, barcode, image-toggle, batch, thresholds via separate API):
      Administrator + Store Manager.
    - Pricing (selling_price, buying_price, standard_rate):
      Administrator ONLY. Pricing keys submitted by a non-admin are rejected.

    Accepted fields: any of `_EDITABLE_FIELDS`, plus `selling_price`,
    `buying_price`, `barcode`. Unknown fields are silently ignored.
    """
    if not item_code:
        frappe.throw(_("item_code is required"), frappe.ValidationError)
    if not frappe.db.exists("Item", item_code):
        frappe.throw(_("Item not found"), frappe.DoesNotExistError)

    selling = fields.pop("selling_price", None)
    buying = fields.pop("buying_price", None)
    barcode = fields.pop("barcode", None)

    updates = {k: v for k, v in fields.items() if k in _EDITABLE_FIELDS}

    # Pricing keys submitted? Verify pricing permission BEFORE touching the doc.
    touching_pricing = (
        selling is not None
        or buying is not None
        or "standard_rate" in updates
    )
    if touching_pricing:
        _assert_may_edit_pricing()

    # Any non-pricing edits at all require item-edit permission.
    non_pricing_updates = {k: v for k, v in updates.items() if k != "standard_rate"}
    touching_master = bool(non_pricing_updates) or barcode is not None
    if touching_master:
        _assert_may_edit_item()

    if not (touching_pricing or touching_master):
        frappe.throw(_("Nothing to update."), frappe.ValidationError)

    if "shelf_life_in_days" in updates:
        try:
            days = int(updates["shelf_life_in_days"] or 0)
            updates["shelf_life_in_days"] = max(0, days)
        except (TypeError, ValueError):
            updates.pop("shelf_life_in_days", None)
    if "standard_rate" in updates:
        updates["standard_rate"] = flt(updates["standard_rate"])
    if "weight_per_unit" in updates:
        updates["weight_per_unit"] = flt(updates["weight_per_unit"])
    for boolean_field in ("is_sales_item", "is_purchase_item", "has_batch_no", "has_expiry_date", "disabled"):
        if boolean_field in updates:
            updates[boolean_field] = 1 if int(updates[boolean_field] or 0) else 0

    if updates:
        # Use save() so server-side validation runs (item_group must exist, etc.)
        item = frappe.get_doc("Item", item_code)
        for k, v in updates.items():
            setattr(item, k, v)
        item.save(ignore_permissions=True)

    if selling is not None:
        _set_item_price(item_code, SELLING_PRICE_LIST, flt(selling))
    if buying is not None:
        _set_item_price(item_code, BUYING_PRICE_LIST, flt(buying))

    if barcode is not None:
        _replace_primary_barcode(item_code, str(barcode).strip())

    frappe.db.commit()
    return get_item_master(item_code)


# ── image upload ────────────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def upload_item_image(item_code: str) -> dict[str, Any]:
    """
    Attach an uploaded file (multipart/form-data `file`) as the Item's image.

    The SPA calls Frappe's built-in /api/method/upload_file with `doctype=Item`
    and `docname=<item_code>` — that flow handles file save + linking
    automatically. This endpoint is a thin convenience wrapper that also
    cleans up any prior image file so we don't leave orphans.
    """
    _assert_may_edit_item()
    if not item_code:
        frappe.throw(_("item_code is required"), frappe.ValidationError)
    if not frappe.db.exists("Item", item_code):
        frappe.throw(_("Item not found"), frappe.DoesNotExistError)

    files = frappe.request.files
    upload = files.get("file") if files else None
    if not upload:
        frappe.throw(_("No file uploaded"), frappe.ValidationError)

    content = upload.read()
    filename = upload.filename or f"{item_code}.jpg"

    # Delete the previous image file (if any) so we don't accumulate orphans.
    old_url = frappe.db.get_value("Item", item_code, "image")
    if old_url:
        old_file = frappe.db.get_value("File", {"file_url": old_url}, "name")
        if old_file:
            try:
                frappe.delete_doc("File", old_file, ignore_permissions=True, force=True)
            except Exception:
                pass

    from frappe.utils.file_manager import save_file

    file_doc = save_file(
        filename,
        content,
        "Item",
        item_code,
        is_private=0,
        df="image",
    )
    frappe.db.set_value("Item", item_code, "image", file_doc.file_url, update_modified=False)
    frappe.db.commit()
    return {"image": file_doc.file_url}

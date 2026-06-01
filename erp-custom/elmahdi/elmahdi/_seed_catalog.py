"""Seed 20 supermarket items with barcodes, prices, reorder=5, expiry tracking."""

import frappe
from frappe.utils import flt, add_days, today

ITEMS = [
    # (code, name, group, uom, price, barcode, batch)
    ("SUP-0001", "Coca Cola 1L",          "Beverages", "Bottle", 18.00, "5012345000019", False),
    ("SUP-0002", "Pepsi 2L",              "Beverages", "Bottle", 28.00, "5012345000026", False),
    ("SUP-0003", "Mineral Water 500ml",   "Beverages", "Bottle",  6.00, "5012345000033", False),
    ("SUP-0004", "Orange Juice 1L",       "Beverages", "Carton", 32.00, "5012345000040", True),
    ("SUP-0005", "Milk 1L",               "Dairy",     "Carton", 25.00, "5012345000057", True),
    ("SUP-0006", "Yogurt Plain 500g",     "Dairy",     "Cup",    14.00, "5012345000064", True),
    ("SUP-0007", "Cheddar Cheese 250g",   "Dairy",     "Pack",   55.00, "5012345000071", True),
    ("SUP-0008", "White Bread",           "Bakery",    "Loaf",    8.00, "5012345000088", True),
    ("SUP-0009", "Whole Wheat Bread",     "Bakery",    "Loaf",   12.00, "5012345000095", True),
    ("SUP-0010", "Croissant",             "Bakery",    "Piece",   6.00, "5012345000101", True),
    ("SUP-0011", "Rice 5kg",              "Pantry",    "Bag",    95.00, "5012345000118", False),
    ("SUP-0012", "Pasta Spaghetti 500g",  "Pantry",    "Pack",   18.00, "5012345000125", False),
    ("SUP-0013", "Olive Oil 1L",          "Pantry",    "Bottle", 120.00,"5012345000132", False),
    ("SUP-0014", "Sugar 1kg",             "Pantry",    "Bag",    22.00, "5012345000149", False),
    ("SUP-0015", "Salt 1kg",              "Pantry",    "Bag",    10.00, "5012345000156", False),
    ("SUP-0016", "Eggs (12-pack)",        "Dairy",     "Pack",   45.00, "5012345000163", True),
    ("SUP-0017", "Chicken Breast 1kg",    "Meat",      "Pack",   95.00, "5012345000170", True),
    ("SUP-0018", "Apples 1kg",            "Produce",   "Kg",     35.00, "5012345000187", True),
    ("SUP-0019", "Bananas 1kg",           "Produce",   "Kg",     20.00, "5012345000194", True),
    ("SUP-0020", "Tomatoes 1kg",          "Produce",   "Kg",     15.00, "5012345000200", True),
]


def _ensure_item_group(name):
    if not frappe.db.exists("Item Group", name):
        ig = frappe.new_doc("Item Group")
        ig.item_group_name = name
        ig.parent_item_group = "All Item Groups"
        ig.is_group = 0
        ig.insert(ignore_permissions=True)


def _ensure_uom(name):
    if not frappe.db.exists("UOM", name):
        uom = frappe.new_doc("UOM")
        uom.uom_name = name
        uom.insert(ignore_permissions=True)


def _ensure_item(code, name, group, uom, price, barcode, has_batch):
    _ensure_item_group(group)
    _ensure_uom(uom)

    if frappe.db.exists("Item", code):
        item = frappe.get_doc("Item", code)
    else:
        item = frappe.new_doc("Item")
        item.item_code = code
        item.item_name = name
        item.item_group = group
        item.stock_uom = uom
        item.is_stock_item = 1
        item.is_purchase_item = 1
        item.is_sales_item = 1
        item.include_item_in_manufacturing = 0
        item.standard_rate = flt(price)
        item.has_batch_no = 1 if has_batch else 0
        if has_batch:
            item.batch_number_series = f"BATCH-{code}-.####"
            item.has_expiry_date = 1
        item.shelf_life_in_days = 90 if has_batch else 0
        item.insert(ignore_permissions=True)

    # reorder rule — alert at qty <= 5, target qty 30 (used by Stock Alerts page)
    item.reload()
    if not item.get("reorder_levels"):
        warehouse = frappe.db.get_value("POS Profile", "Main pos", "warehouse") or "WH - Main - ES"
        item.append("reorder_levels", {
            "warehouse": warehouse,
            "warehouse_reorder_level": 5,
            "warehouse_reorder_qty": 30,
            "material_request_type": "Purchase",
        })
        item.save(ignore_permissions=True)

    # barcode — use Code-128 to skip EAN-13 check-digit validation on demo data
    if barcode and not frappe.db.exists("Item Barcode", {"parent": code, "barcode": barcode}):
        item.reload()
        item.append("barcodes", {"barcode": barcode, "barcode_type": "CODE-128"})
        item.save(ignore_permissions=True)

    # standard buying + selling rate via Item Price (Price List dependent)
    selling_pl = frappe.db.get_value("POS Profile", "Main pos", "selling_price_list") or "Standard Selling"
    for pl, role in ((selling_pl, "selling"), ("Standard Buying", "buying")):
        if not frappe.db.exists("Price List", pl):
            continue
        if frappe.db.exists("Item Price", {"item_code": code, "price_list": pl}):
            continue
        ip = frappe.new_doc("Item Price")
        ip.item_code = code
        ip.price_list = pl
        ip.price_list_rate = flt(price) if role == "selling" else flt(price) * 0.75
        ip.insert(ignore_permissions=True)


def run():
    print(f"Seeding {len(ITEMS)} catalog items...")
    ok, skipped, failed = 0, 0, 0
    for row in ITEMS:
        code, name, group, uom, price, barcode, has_batch = row
        try:
            existed = frappe.db.exists("Item", code)
            _ensure_item(code, name, group, uom, price, barcode, has_batch)
            if existed:
                skipped += 1
                print(f"  - {code} {name} (already existed; refreshed reorder + barcode + price)")
            else:
                ok += 1
                print(f"  + {code} {name}  price={price} barcode={barcode} batch={has_batch}")
        except Exception as e:
            failed += 1
            print(f"  ! {code} FAILED: {type(e).__name__}: {e}")
    frappe.db.commit()
    print(f"\nResult: created={ok} refreshed={skipped} failed={failed}")
    return {"created": ok, "refreshed": skipped, "failed": failed}

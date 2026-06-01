"""
Seed 10 Egyptian supermarket items with item groups, barcodes, buy/sell prices,
images, and a 14% import VAT template for one imported product.

Run:
  bench --site <site> execute elmahdi.setup.seed_egyptian_catalog.execute
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import frappe
from frappe.utils import cint, flt, today

COMPANY = "Elmahdi Supermarket"
COMPANY_ABBR = "ES"
VAT_ACCOUNT = "GST - ES"
IMPORT_TAX_TEMPLATE = f"Egypt Import VAT 14% - {COMPANY_ABBR}"
STANDARD_TAX_TEMPLATE = f"Egypt Tax - {COMPANY_ABBR}"
CATALOG_IMAGE_DIR = Path(__file__).resolve().parent / "catalog_images"

GROUP_TREE: tuple[tuple[str, str, int], ...] = (
	# (name, parent, is_group)
	("Drinks - مشروبات", "Supermarket Egypt", 1),
	("Water - مياه", "Drinks - مشروبات", 0),
	("Soda - مشروبات غازية", "Drinks - مشروبات", 0),
	("Eats - أكل", "Supermarket Egypt", 1),
	("Canned - معلبات", "Eats - أكل", 0),
	("Fresh - طازة", "Eats - أكل", 0),
	("Personal Care - مستلزمات العناية الشخصية", "Supermarket Egypt", 0),
)


@dataclass(frozen=True)
class CatalogItem:
	code: str
	name_en: str
	name_ar: str
	item_group: str
	brand: str
	uom: str
	selling_price: float
	buying_price: float
	barcode: str
	country_of_origin: str
	description: str
	weight_per_unit: float
	weight_uom: str
	has_batch: bool
	shelf_life_days: int
	imported: bool
	tax_template: str | None
	image_key: str


ITEMS: tuple[CatalogItem, ...] = (
	CatalogItem(
		"EG-0001",
		"Nestlé Pure Life Water 1.5L",
		"مياه نستلة بيور لايف 1.5 لتر",
		"Water - مياه",
		"Nestlé",
		"Bottle",
		8.0,
		5.5,
		"6224000000001",
		"Egypt",
		"Mineral drinking water — locally bottled.",
		1.5,
		"Litre",
		False,
		365,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0001",
	),
	CatalogItem(
		"EG-0002",
		"Pepsi 330ml Can (Imported)",
		"بيبسي 330 مل — مستورد",
		"Soda - مشروبات غازية",
		"PepsiCo",
		"Can",
		15.0,
		10.5,
		"4062139017416",
		"United States",
		"Imported carbonated soft drink — subject to 14% VAT.",
		0.33,
		"Litre",
		False,
		540,
		True,
		IMPORT_TAX_TEMPLATE,
		"EG-0002",
	),
	CatalogItem(
		"EG-0003",
		"Coca-Cola 1.5L",
		"كوكاكولا 1.5 لتر",
		"Soda - مشروبات غازية",
		"Coca-Cola",
		"Bottle",
		18.0,
		12.0,
		"5449000098153",
		"Egypt",
		"Local bottled cola.",
		1.5,
		"Litre",
		False,
		365,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0003",
	),
	CatalogItem(
		"EG-0004",
		"Sunflower Cooking Oil 1L",
		"زيت دوار الشمس 1 لتر",
		"Canned - معلبات",
		"Crystal",
		"Bottle",
		65.0,
		48.0,
		"6224000000022",
		"Egypt",
		"Refined sunflower oil for cooking.",
		1.0,
		"Litre",
		False,
		730,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0004",
	),
	CatalogItem(
		"EG-0005",
		"Heinz Baked Beans 400g",
		"فول مطبوخ هينز 400 جم",
		"Canned - معلبات",
		"Heinz",
		"Pack",
		42.0,
		30.0,
		"5000157024671",
		"Egypt",
		"Canned baked beans in tomato sauce.",
		0.4,
		"Kg",
		True,
		730,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0005",
	),
	CatalogItem(
		"EG-0006",
		"Fresh Tomatoes 1kg",
		"طماطم طازة 1 كجم",
		"Fresh - طازة",
		"Local Farm",
		"Kg",
		18.0,
		12.0,
		"20240059",
		"Egypt",
		"Fresh local tomatoes — sold by weight.",
		1.0,
		"Kg",
		True,
		7,
		False,
		None,
		"EG-0006",
	),
	CatalogItem(
		"EG-0007",
		"Fresh Cucumbers 1kg",
		"خيار طازة 1 كجم",
		"Fresh - طازة",
		"Local Farm",
		"Kg",
		14.0,
		9.0,
		"20239756",
		"Egypt",
		"Fresh local cucumbers — sold by weight.",
		1.0,
		"Kg",
		True,
		5,
		False,
		None,
		"EG-0007",
	),
	CatalogItem(
		"EG-0008",
		"Head & Shoulders Shampoo 400ml",
		"شامبو Head & Shoulders 400 مل",
		"Personal Care - مستلزمات العناية الشخصية",
		"Head & Shoulders",
		"Bottle",
		120.0,
		85.0,
		"4084500821507",
		"Egypt",
		"Anti-dandruff shampoo.",
		0.4,
		"Litre",
		False,
		1095,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0008",
	),
	CatalogItem(
		"EG-0009",
		"Colgate Total Toothpaste 100ml",
		"معجون Colgate Total 100 مل",
		"Personal Care - مستلزمات العناية الشخصية",
		"Colgate",
		"Pack",
		55.0,
		38.0,
		"8718951684843",
		"Egypt",
		"Fluoride toothpaste for daily care.",
		0.1,
		"Litre",
		False,
		1095,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0009",
	),
	CatalogItem(
		"EG-0010",
		"Nescafé Classic Jar 200g",
		"نسكافيه كلاسيك 200 جم",
		"Canned - معلبات",
		"Nescafé",
		"Pack",
		95.0,
		68.0,
		"8445290303080",
		"Egypt",
		"Instant coffee jar.",
		0.2,
		"Kg",
		False,
		730,
		False,
		STANDARD_TAX_TEMPLATE,
		"EG-0010",
	),
)


def _ensure_uom(name: str) -> None:
	if frappe.db.exists("UOM", name):
		return
	frappe.get_doc({"doctype": "UOM", "uom_name": name, "enabled": 1}).insert(
		ignore_permissions=True
	)


def _ensure_brand(name: str) -> None:
	if frappe.db.exists("Brand", name):
		return
	frappe.get_doc({"doctype": "Brand", "brand": name}).insert(ignore_permissions=True)


def _ensure_item_group(name: str, parent: str, is_group: int = 0) -> None:
	if not frappe.db.exists("Item Group", parent):
		if parent != "All Item Groups":
			raise frappe.ValidationError(f"Parent Item Group missing: {parent}")
	if frappe.db.exists("Item Group", name):
		frappe.db.set_value("Item Group", name, {"parent_item_group": parent, "is_group": is_group})
		return
	doc = frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": parent,
			"is_group": is_group,
		}
	)
	doc.insert(ignore_permissions=True)


def _ensure_import_tax_template() -> str:
	if frappe.db.exists("Item Tax Template", IMPORT_TAX_TEMPLATE):
		return IMPORT_TAX_TEMPLATE
	if not frappe.db.exists("Account", VAT_ACCOUNT):
		frappe.throw(f"VAT account {VAT_ACCOUNT} not found")
	doc = frappe.get_doc(
		{
			"doctype": "Item Tax Template",
			"title": "Egypt Import VAT 14%",
			"company": COMPANY,
			"taxes": [
				{
					"tax_type": VAT_ACCOUNT,
					"tax_rate": 14,
				}
			],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _default_warehouse() -> str:
	wh = frappe.db.get_value("POS Profile", "Main pos", "warehouse")
	if wh:
		return wh
	return frappe.db.get_value("Warehouse", {"company": COMPANY, "is_group": 0}, "name")


def _local_catalog_image(item_code: str) -> bytes | None:
	for ext in (".jpg", ".jpeg", ".png", ".webp"):
		path = CATALOG_IMAGE_DIR / f"{item_code.lower()}{ext}"
		if path.is_file() and path.stat().st_size > 1000:
			return path.read_bytes()
	return None


def _generate_product_image(item_code: str, title: str, accent: tuple[int, int, int]) -> bytes:
	from io import BytesIO

	from PIL import Image, ImageDraw, ImageFont

	size = (512, 512)
	img = Image.new("RGB", size, color=(248, 249, 252))
	draw = ImageDraw.Draw(img)
	draw.rounded_rectangle((32, 32, 480, 480), radius=36, fill=accent)
	draw.rounded_rectangle((64, 280, 448, 420), radius=24, fill=(255, 255, 255))
	try:
		font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
		small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
	except Exception:
		font = ImageFont.load_default()
		small = font
	label = title.split("|")[0].strip()[:28]
	draw.text((80, 300), label, fill=(30, 30, 30), font=font)
	draw.text((80, 350), item_code, fill=(80, 80, 80), font=small)
	buf = BytesIO()
	img.save(buf, format="JPEG", quality=88)
	return buf.getvalue()


ITEM_COLORS: dict[str, tuple[int, int, int]] = {
	"EG-0001": (56, 132, 255),
	"EG-0002": (0, 55, 145),
	"EG-0003": (200, 16, 46),
	"EG-0004": (255, 193, 7),
	"EG-0005": (139, 69, 19),
	"EG-0006": (220, 53, 69),
	"EG-0007": (40, 167, 69),
	"EG-0008": (111, 66, 193),
	"EG-0009": (23, 162, 184),
	"EG-0010": (108, 66, 36),
}


def _attach_image(item_code: str, title: str = "") -> str | None:
	from frappe.utils.file_manager import save_file

	content = _local_catalog_image(item_code)
	if not content:
		content = _generate_product_image(
			item_code,
			title or item_code,
			ITEM_COLORS.get(item_code, (60, 60, 60)),
		)
	try:
		# Drop previous public image file for this item (avoid orphaned placeholders).
		old_url = frappe.db.get_value("Item", item_code, "image")
		if old_url:
			old_name = frappe.db.get_value("File", {"file_url": old_url}, "name")
			if old_name:
				frappe.delete_doc("File", old_name, ignore_permissions=True, force=True)

		filename = f"{item_code.lower()}.jpg"
		file_doc = save_file(
			filename,
			content,
			"Item",
			item_code,
			is_private=0,
			df="image",
		)
		frappe.db.set_value("Item", item_code, "image", file_doc.file_url, update_modified=False)
		return file_doc.file_url
	except Exception as exc:
		frappe.log_error(title=f"Item image attach failed: {item_code}", message=str(exc))
		return None


def _ensure_item_price(item_code: str, price_list: str, rate: float) -> None:
	if frappe.db.exists("Item Price", {"item_code": item_code, "price_list": price_list}):
		frappe.db.set_value(
			"Item Price",
			{"item_code": item_code, "price_list": price_list},
			"price_list_rate",
			flt(rate),
		)
		return
	frappe.get_doc(
		{
			"doctype": "Item Price",
			"item_code": item_code,
			"price_list": price_list,
			"price_list_rate": flt(rate),
			"uom": frappe.db.get_value("Item", item_code, "stock_uom"),
		}
	).insert(ignore_permissions=True)


def _upsert_item(spec: CatalogItem, warehouse: str, selling_pl: str) -> dict[str, Any]:
	_ensure_brand(spec.brand)
	_ensure_uom(spec.uom)
	_ensure_uom(spec.weight_uom)

	display_name = f"{spec.name_en} | {spec.name_ar}"
	existed = bool(frappe.db.exists("Item", spec.code))

	if existed:
		item = frappe.get_doc("Item", spec.code)
	else:
		item = frappe.new_doc("Item")
		item.item_code = spec.code

	item.item_name = display_name
	item.item_group = spec.item_group
	item.stock_uom = spec.uom
	item.brand = spec.brand
	item.description = spec.description
	item.country_of_origin = spec.country_of_origin
	item.is_stock_item = 1
	item.is_purchase_item = 1
	item.is_sales_item = 1
	item.include_item_in_manufacturing = 0
	item.standard_rate = flt(spec.selling_price)
	item.valuation_rate = flt(spec.buying_price)
	item.weight_per_unit = flt(spec.weight_per_unit)
	item.weight_uom = spec.weight_uom
	item.has_batch_no = cint(spec.has_batch)
	item.has_expiry_date = cint(spec.has_batch and spec.shelf_life_days > 0)
	item.shelf_life_in_days = spec.shelf_life_days if spec.has_batch else 0
	if spec.has_batch:
		item.batch_number_series = f"BATCH-{spec.code}-.####"

	# Item Default (company + warehouse)
	item.set("item_defaults", [])
	item.append(
		"item_defaults",
		{
			"company": COMPANY,
			"default_warehouse": warehouse,
		},
	)

	# Barcode
	item.set("barcodes", [])
	item.append("barcodes", {"barcode": spec.barcode, "barcode_type": "CODE-128"})

	# Taxes
	item.set("taxes", [])
	if spec.tax_template:
		item.append(
			"taxes",
			{
				"item_tax_template": spec.tax_template,
				"valid_from": today(),
			},
		)

	# Reorder
	item.set("reorder_levels", [])
	item.append(
		"reorder_levels",
		{
			"warehouse": warehouse,
			"warehouse_reorder_level": 5,
			"warehouse_reorder_qty": 30,
			"material_request_type": "Purchase",
		},
	)

	if existed:
		item.save(ignore_permissions=True)
	else:
		item.insert(ignore_permissions=True)

	_ensure_item_price(spec.code, selling_pl, spec.selling_price)
	if frappe.db.exists("Price List", "Standard Buying"):
		_ensure_item_price(spec.code, "Standard Buying", spec.buying_price)

	image_url = _attach_image(spec.code, display_name)
	if image_url:
		frappe.db.set_value("Item", spec.code, "image", image_url, update_modified=False)

	return {
		"code": spec.code,
		"name": display_name,
		"created": not existed,
		"imported": spec.imported,
		"tax_template": spec.tax_template,
		"image": image_url,
	}


def seed_catalog() -> dict[str, Any]:
	frappe.only_for("System Manager")
	frappe.set_user("Administrator")

	log: dict[str, Any] = {
		"company": COMPANY,
		"import_tax_template": _ensure_import_tax_template(),
		"groups": [],
		"items": [],
		"errors": [],
	}

	# Normalize legacy flat Drinks group if present under All Item Groups
	if frappe.db.exists("Item Group", "Drinks") and not frappe.db.exists("Item Group", "Drinks - مشروبات"):
		try:
			frappe.rename_doc("Item Group", "Drinks", "Drinks - مشروبات", force=True, merge=False)
		except Exception:
			pass

	for name, parent, is_group in GROUP_TREE:
		try:
			_ensure_item_group(name, parent, is_group)
			log["groups"].append(name)
		except Exception as exc:
			log["errors"].append({"group": name, "error": str(exc)})

	warehouse = _default_warehouse()
	selling_pl = frappe.db.get_value("POS Profile", "Main pos", "selling_price_list") or "Standard Selling"

	for spec in ITEMS:
		try:
			log["items"].append(_upsert_item(spec, warehouse, selling_pl))
		except Exception as exc:
			log["errors"].append({"item": spec.code, "error": str(exc)})

	frappe.db.commit()
	frappe.clear_cache()
	log["item_count"] = frappe.db.count("Item")
	log["group_count"] = frappe.db.count("Item Group")
	return log


def attach_catalog_images() -> dict[str, Any]:
	frappe.only_for("System Manager")
	frappe.set_user("Administrator")
	rows = []
	for spec in ITEMS:
		url = _attach_image(spec.code, f"{spec.name_en} | {spec.name_ar}")
		rows.append({"code": spec.code, "image": url, "local": _local_catalog_image(spec.code) is not None})
	frappe.db.commit()
	return {"attached": rows, "catalog_dir": str(CATALOG_IMAGE_DIR)}


def execute():
	result = seed_catalog()
	print(json.dumps(result, indent=2, default=str))
	return result


def execute_attach_images():
	result = attach_catalog_images()
	print(json.dumps(result, indent=2, default=str))
	return result

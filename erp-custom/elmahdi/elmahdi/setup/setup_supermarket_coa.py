"""
Trim and label Chart of Accounts for a retail supermarket (Egypt).

Keeps POS, stock, purchases, VAT, and store operating accounts.
Removes fixed-asset, payroll, marketing, and FX accounts not needed for a small market.

Run:
  bench --site <site> execute elmahdi.setup.setup_supermarket_coa.execute
"""

from __future__ import annotations

import frappe

COMPANY = "Elmahdi Supermarket"
COMPANY_ABBR = "ES"

# account_name updates (key = Account.name)
ACCOUNT_RENAMES: dict[str, str] = {
	"Sales - ES": "مبيعات التجزئة (Retail Sales)",
	"Cost of Goods Sold - ES": "تكلفة البضاعة المباعة (COGS)",
	"Stock In Hand - ES": "بضاعة بالمخزن (Inventory)",
	"Stock Adjustment - ES": "تسويات المخزون",
	"1 - Cash - ES": "صندوق المحل (Cash)",
	"2 - Bank - ES - ES": "حساب بنكي (Bank)",
	"Creditors - ES": "موردون (Suppliers)",
	"Debtors - ES": "عملاء آجل (Receivables)",
	"GST - ES": "ضريبة القيمة المضافة (VAT)",
	"Administrative Expenses - ES": "مصاريف إدارية",
	"Office Rent - ES": "إيجار المحل",
	"Utility Expenses - ES": "كهرباء ومياه",
	"Salary - ES": "رواتب",
	"Freight and Forwarding Charges - ES": "شحن ومشتريات",
	"Round Off - ES": "فروق التقريب",
	"Write Off - ES": "إهلاك ديون/فروق",
	"Stock Received But Not Billed - ES": "بضاعة مستلمة غير مفوترة",
	"Asset Received But Not Billed - ES": "أصول مستلمة غير مفوترة",
	"Expenses Included In Valuation - ES": "مصاريف ضمن تقييم المخزون",
}

# Leaf accounts safe to remove for a supermarket without fixed assets / payroll / FX.
ACCOUNTS_TO_DELETE: tuple[str, ...] = (
	"CWIP Account - ES",
	"Electronic Equipments - ES",
	"Furnitures and Fixtures - ES",
	"Accumulated Depreciation - ES",
	"Depreciation - ES",
	"Gain/Loss on Asset Disposal - ES",
	"Marketing Expenses - ES",
	"Exchange Gain/Loss - ES",
	"Payroll Payable - ES",
	"Expenses Included In Asset Valuation - ES",
)

# Empty groups removed after children are deleted.
GROUPS_TO_DELETE: tuple[str, ...] = (
	"Fixed Assets - ES",
	"Tax Assets - ES",
)

COMPANY_ACCOUNT_CLEARS: tuple[str, ...] = (
	"exchange_gain_loss_account",
	"unrealized_exchange_gain_loss_account",
	"accumulated_depreciation_account",
	"depreciation_expense_account",
	"disposal_account",
	"capital_work_in_progress_account",
	"expenses_included_in_asset_valuation",
)


def _clear_company_account_links() -> list[str]:
	cleared: list[str] = []
	for field in COMPANY_ACCOUNT_CLEARS:
		if frappe.db.get_value("Company", COMPANY, field):
			frappe.db.set_value("Company", COMPANY, field, None, update_modified=False)
			cleared.append(field)
	return cleared


def _rename_accounts() -> list[str]:
	renamed: list[str] = []
	for name, new_label in ACCOUNT_RENAMES.items():
		if not frappe.db.exists("Account", name):
			continue
		current = frappe.db.get_value("Account", name, "account_name")
		if current == new_label:
			continue
		frappe.db.set_value("Account", name, "account_name", new_label, update_modified=True)
		renamed.append(name)
	return renamed


def _delete_account(name: str, log: dict) -> None:
	if not frappe.db.exists("Account", name):
		return
	children = frappe.get_all("Account", filters={"parent_account": name}, pluck="name")
	if children:
		log["skipped_group_with_children"].append(name)
		return
	try:
		frappe.delete_doc("Account", name, force=True, ignore_permissions=True)
		log["deleted"].append(name)
	except Exception as exc:
		log["delete_errors"].append({"account": name, "error": str(exc)})


def _set_company_defaults() -> list[str]:
	applied: list[str] = []
	bank = "2 - Bank - ES - ES"
	if frappe.db.exists("Account", bank) and frappe.db.get_value("Company", COMPANY, "default_bank_account") != bank:
		frappe.db.set_value("Company", COMPANY, "default_bank_account", bank, update_modified=False)
		applied.append(f"default_bank_account={bank}")
	return applied


def _account_tree_summary() -> dict:
	accounts = frappe.get_all(
		"Account",
		filters={"company": COMPANY, "disabled": 0},
		fields=["name", "account_name", "parent_account", "is_group", "root_type", "account_type"],
		order_by="lft",
	)
	return {
		"total": len(accounts),
		"by_root": {
			rt: sum(1 for a in accounts if a.root_type == rt)
			for rt in ("Asset", "Liability", "Equity", "Income", "Expense")
		},
		"accounts": accounts,
	}


def run_setup() -> dict:
	frappe.only_for("System Manager")
	frappe.set_user("Administrator")

	log: dict = {
		"company": COMPANY,
		"cleared_company_fields": [],
		"renamed": [],
		"deleted": [],
		"delete_errors": [],
		"skipped_group_with_children": [],
		"company_defaults": [],
		"before_count": frappe.db.count("Account", {"company": COMPANY}),
	}

	log["cleared_company_fields"] = _clear_company_account_links()
	frappe.db.commit()

	log["renamed"] = _rename_accounts()

	for name in ACCOUNTS_TO_DELETE:
		_delete_account(name, log)

	for name in GROUPS_TO_DELETE:
		_delete_account(name, log)

	log["company_defaults"] = _set_company_defaults()
	frappe.db.commit()
	frappe.clear_cache()

	log["after_count"] = frappe.db.count("Account", {"company": COMPANY})
	log["summary"] = _account_tree_summary()
	return log


def execute():
	log = run_setup()
	import json

	print(json.dumps({k: v for k, v in log.items() if k != "summary"}, indent=2, default=str))
	print("\n--- Chart of Accounts ---")
	for row in log["summary"]["accounts"]:
		prefix = "[G] " if row.is_group else "    "
		print(f"{prefix}{row.name} | {row.account_name}")
	return log

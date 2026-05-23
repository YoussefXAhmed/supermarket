"""Provision Elmahdi operational users, role profiles, and user permissions."""

from __future__ import annotations

import secrets
import string

import frappe
from frappe.utils.password import update_password

COMPANY = "Elmahdi Supermarket"
MAIN_WH = "WH - Main - ES"
OUTER_WH = "Outer WH - ES"
SELLING_PL = "Standard Selling"

ELMAHDI_HR_USER_ROLE = "Elmahdi HR User"

FORBIDDEN_ROLES_ON_OPERATIONAL_PROFILES = frozenset(
	{
		"System Manager",
		"Administrator",
		"Accounts User",
		"Accounts Manager",
		"Stock User",
		"Stock Manager",
		"Purchase User",
		"Purchase Manager",
		"Sales Manager",
		"POS Manager",
	}
)

ROLE_PROFILES = {
	"Elmahdi Administrator": ["System Manager"],
	"Elmahdi Cashier": ["POS User", "Sales User"],
	"Elmahdi Inventory Clerk": ["Stock User"],
	"Elmahdi Purchasing Officer": ["Purchase User"],
	"Elmahdi Store Manager": [
		"Stock Manager",
		"Purchase Manager",
		"Sales Manager",
		"POS Manager",
	],
	"Elmahdi Accountant": ["Accounts User", "Accounts Manager"],
	"Elmahdi HR Officer": [ELMAHDI_HR_USER_ROLE],
}

USERS = [
	{
		"email": "cashier@elmahdi.com",
		"first_name": "Cashier",
		"last_name": "Floor",
		"role_profile": "Elmahdi Cashier",
		"warehouses": [MAIN_WH],
		"price_list": SELLING_PL,
	},
	{
		"email": "inventory@elmahdi.com",
		"first_name": "Inventory",
		"last_name": "Clerk",
		"role_profile": "Elmahdi Inventory Clerk",
		"warehouses": [MAIN_WH, OUTER_WH],
	},
	{
		"email": "purchasing@elmahdi.com",
		"first_name": "Purchasing",
		"last_name": "Officer",
		"role_profile": "Elmahdi Purchasing Officer",
		"warehouses": [MAIN_WH, OUTER_WH],
	},
	{
		"email": "manager@elmahdi.com",
		"first_name": "Store",
		"last_name": "Manager",
		"role_profile": "Elmahdi Store Manager",
		"warehouses": [MAIN_WH, OUTER_WH],
		"create": True,
	},
	{
		"email": "accountant@elmahdi.com",
		"first_name": "Accountant",
		"last_name": "Finance",
		"role_profile": "Elmahdi Accountant",
		"warehouses": [],
		"create": True,
	},
	{
		"email": "hr@elmahdi.com",
		"first_name": "HR",
		"last_name": "Officer",
		"role_profile": "Elmahdi HR Officer",
		"warehouses": [],
		"create": True,
	},
	{
		"email": "youssefayyman@gmail.com",
		"first_name": "Youssef",
		"last_name": "Admin",
		"role_profile": "Elmahdi Administrator",
		"warehouses": [MAIN_WH, OUTER_WH],
		"reset_password": False,
	},
]


def _random_password(length: int = 14) -> str:
	alphabet = string.ascii_letters + string.digits + "!@#$%"
	return "".join(secrets.choice(alphabet) for _ in range(length))


def _ensure_erp_role(role_name: str) -> None:
	if frappe.db.exists("Role", role_name):
		return
	doc = frappe.new_doc("Role")
	doc.role_name = role_name
	doc.desk_access = 1
	doc.insert(ignore_permissions=True)


def _validate_role_profile_roles(profile: str, roles: list[str]) -> None:
	forbidden = FORBIDDEN_ROLES_ON_OPERATIONAL_PROFILES & set(roles)
	if profile == "Elmahdi HR Officer" and forbidden:
		frappe.throw(
			f"HR Officer profile must not include privileged roles: {sorted(forbidden)}",
			frappe.ValidationError,
		)
	if profile != "Elmahdi Administrator" and "System Manager" in roles:
		frappe.throw(
			f"Operational profile {profile} must not include System Manager",
			frappe.ValidationError,
		)


def _ensure_role_profile(name: str, roles: list[str]) -> None:
	_validate_role_profile_roles(name, roles)
	if not frappe.db.exists("Role Profile", name):
		doc = frappe.new_doc("Role Profile")
		doc.role_profile = name
	else:
		doc = frappe.get_doc("Role Profile", name)

	doc.roles = []
	for role in roles:
		if frappe.db.exists("Role", role):
			doc.append("roles", {"role": role})
	doc.save(ignore_permissions=True)


def _clear_user_permissions(user: str) -> None:
	for row in frappe.get_all("User Permission", filters={"user": user}, pluck="name"):
		frappe.delete_doc("User Permission", row, ignore_permissions=True, force=True)


def _set_user_permissions(user: str, warehouses: list[str], price_list: str | None = None) -> None:
	_clear_user_permissions(user)
	frappe.get_doc(
		{
			"doctype": "User Permission",
			"user": user,
			"allow": "Company",
			"for_value": COMPANY,
			"apply_to_all_doctypes": 1,
		}
	).insert(ignore_permissions=True)

	for wh in warehouses or []:
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user,
				"allow": "Warehouse",
				"for_value": wh,
				"apply_to_all_doctypes": 1,
			}
		).insert(ignore_permissions=True)

	if price_list:
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user,
				"allow": "Price List",
				"for_value": price_list,
				"apply_to_all_doctypes": 1,
			}
		).insert(ignore_permissions=True)


def _provision_user(spec: dict, password: str | None) -> dict:
	email = spec["email"]
	if spec.get("create") or not frappe.db.exists("User", email):
		user = frappe.new_doc("User")
		user.email = email
		user.first_name = spec.get("first_name") or email.split("@")[0]
		user.last_name = spec.get("last_name") or ""
		user.send_welcome_email = 0
		user.user_type = "System User"
	else:
		user = frappe.get_doc("User", email)

	user.enabled = 1
	user.role_profile_name = spec["role_profile"]
	user.desk_theme = user.desk_theme or "Dark"
	user.language = user.language or "en"

	user.save(ignore_permissions=True)

	# Re-apply profile so child roles match template (drops stray roles).
	user = frappe.get_doc("User", email)
	user.role_profile_name = spec["role_profile"]
	user.save(ignore_permissions=True)

	_set_user_permissions(email, spec.get("warehouses") or [MAIN_WH], spec.get("price_list"))

	from elmahdi.setup.user_module_profiles import apply_user_modules

	apply_user_modules(email, spec["role_profile"])

	credential_password = None
	if spec.get("reset_password", True) and password:
		update_password(email, password)
		credential_password = password

	return {
		"email": email,
		"full_name": user.full_name,
		"role_profile": user.role_profile_name,
		"roles": frappe.get_roles(email),
		"password": credential_password,
	}


def provision_all() -> list[dict]:
	_ensure_erp_role(ELMAHDI_HR_USER_ROLE)
	for profile, roles in ROLE_PROFILES.items():
		_ensure_role_profile(profile, roles)

	results = []
	for spec in USERS:
		pwd = None if spec.get("reset_password") is False else _random_password()
		results.append(_provision_user(spec, pwd))

	from elmahdi.setup.operational_permissions import apply_permission_matrix
	from elmahdi.setup.user_module_profiles import sync_operational_user_modules

	apply_permission_matrix()
	sync_operational_user_modules()

	frappe.db.commit()
	frappe.clear_cache()
	return results


def execute():
	return provision_all()

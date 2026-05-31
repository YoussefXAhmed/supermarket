"""Provision Elmahdi operational users, role profiles, and user permissions."""

from __future__ import annotations

import os
import secrets
import string

import frappe
from frappe import _
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

# Operational passwords are sourced from environment variables only — never
# committed to the repository. Each user maps to an env var named
# `ELMAHDI_PWD_<LOCAL_PART_UPPERCASE>`; e.g. `cashier@elmahdi.com` reads from
# `ELMAHDI_PWD_CASHIER`. When provisioning for the first time without env
# vars, a cryptographically random password is generated and returned in the
# result dict (printed once to whoever ran the bench command).
#
# `reset_operational_passwords()` is stricter: it REQUIRES the env vars to be
# set and refuses to run on a production site unless
# `ELMAHDI_ALLOW_PRODUCTION_RESET=1` is also set.


def _env_key_for_email(email: str) -> str:
	local = email.split("@", 1)[0] if "@" in email else email
	return "ELMAHDI_PWD_" + local.upper().replace(".", "_").replace("-", "_")


def _is_production_site() -> bool:
	"""Best-effort check whether the current site is flagged as production."""
	try:
		conf = frappe.conf or {}
		if conf.get("production") or conf.get("production_mode"):
			return True
		site_config = getattr(frappe.local, "site_config", {}) or {}
		return bool(site_config.get("production") or site_config.get("production_mode"))
	except Exception:  # noqa: BLE001 — guard must never raise
		return False


def _assert_password_resets_allowed() -> None:
	"""Refuse password resets on a production site without explicit override."""
	if _is_production_site() and not os.environ.get("ELMAHDI_ALLOW_PRODUCTION_RESET"):
		frappe.throw(
			_(
				"Refusing to reset operational passwords on a production site. "
				"Set ELMAHDI_ALLOW_PRODUCTION_RESET=1 to override (and rotate immediately after)."
			),
			frappe.ValidationError,
		)

USERS = [
	{
		"email": "cashier@elmahdi.com",
		"first_name": "Cashier",
		"last_name": "Floor",
		"role_profile": "Elmahdi Cashier",
		"warehouses": [MAIN_WH],
		"price_list": SELLING_PL,
		# Empty = resolve enabled POS Profile(s) for assigned warehouse(es).
		# Also grants the profile's warehouse when it differs (e.g. register on Outer WH).
		"pos_profiles": [],
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
]


def _random_password(length: int = 14) -> str:
	alphabet = string.ascii_letters + string.digits + "!@#$%"
	return "".join(secrets.choice(alphabet) for _ in range(length))


def _password_for_user(email: str) -> str | None:
	"""Return the operator-provided password from environment, or None."""
	return os.environ.get(_env_key_for_email(email)) or None


def reset_operational_passwords() -> list[dict]:
	"""Set operational passwords from environment variables.

	Strict: every operational user listed in USERS must have its env var set.
	Fails closed on production sites unless ELMAHDI_ALLOW_PRODUCTION_RESET=1.
	"""
	_assert_password_resets_allowed()

	updated: list[dict] = []
	missing_envs: list[str] = []
	for spec in USERS:
		email = spec["email"]
		password = _password_for_user(email)
		if not password:
			missing_envs.append(_env_key_for_email(email))
			continue
		if not frappe.db.exists("User", email):
			continue
		update_password(email, password)
		updated.append({"email": email, "password_set": True})

	if missing_envs:
		frappe.throw(
			_("Password env vars missing: {0}. Export each before re-running.").format(
				", ".join(sorted(set(missing_envs)))
			),
			frappe.ValidationError,
		)
	frappe.db.commit()
	return updated


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


def _resolve_pos_profiles(spec: dict) -> list[str]:
	"""POS profiles explicitly assigned or linked to the user's warehouses."""
	explicit = [p for p in (spec.get("pos_profiles") or []) if frappe.db.exists("POS Profile", p)]
	if explicit:
		return explicit

	found: list[str] = []
	for wh in spec.get("warehouses") or [MAIN_WH]:
		name = frappe.db.get_value("POS Profile", {"disabled": 0, "warehouse": wh}, "name")
		if name and name not in found:
			found.append(name)
	return found


def _warehouses_for_pos_access(base_warehouses: list[str], pos_profiles: list[str]) -> list[str]:
	"""Include each assigned profile's warehouse so link-field user permissions allow read."""
	warehouses = list(dict.fromkeys(base_warehouses or []))
	for pname in pos_profiles:
		wh = frappe.db.get_value("POS Profile", pname, "warehouse")
		if wh and wh not in warehouses:
			warehouses.append(wh)
	return warehouses


def _set_user_permissions(
	user: str,
	warehouses: list[str],
	price_list: str | None = None,
	pos_profiles: list[str] | None = None,
) -> None:
	_clear_user_permissions(user)
	pos_profiles = list(pos_profiles or [])
	warehouses = _warehouses_for_pos_access(warehouses, pos_profiles)

	frappe.get_doc(
		{
			"doctype": "User Permission",
			"user": user,
			"allow": "Company",
			"for_value": COMPANY,
			"apply_to_all_doctypes": 1,
		}
	).insert(ignore_permissions=True)

	for wh in warehouses:
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

	for pname in pos_profiles:
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user,
				"allow": "POS Profile",
				"for_value": pname,
				"apply_to_all_doctypes": 0,
				"is_default": 1 if pname == pos_profiles[0] else 0,
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
	if spec["role_profile"] != "Elmahdi Administrator" and frappe.get_meta("User").has_field(
		"desk_access"
	):
		user.desk_access = 0
	user.desk_theme = user.desk_theme or "Dark"
	user.language = user.language or "en"

	user.save(ignore_permissions=True)

	# Re-apply profile so child roles match template (drops stray roles).
	user = frappe.get_doc("User", email)
	user.role_profile_name = spec["role_profile"]
	user.save(ignore_permissions=True)

	pos_profiles = _resolve_pos_profiles(spec)
	if spec["role_profile"] == "Elmahdi Cashier" and not pos_profiles:
		pos_profiles = frappe.get_all(
			"POS Profile", filters={"disabled": 0}, pluck="name", limit_page_length=1
		)
	_set_user_permissions(
		email,
		spec.get("warehouses") or [MAIN_WH],
		spec.get("price_list"),
		pos_profiles=pos_profiles,
	)

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
		email = spec["email"]
		if spec.get("reset_password") is False:
			pwd = None
		else:
			pwd = _password_for_user(email) or _random_password()
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


def execute_reset_passwords():
	return reset_operational_passwords()

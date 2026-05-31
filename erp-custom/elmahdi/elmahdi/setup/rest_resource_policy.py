"""
SPA REST resource catalog and expected DocPerm shape per operational role.

Used by operational_permissions.apply_permission_matrix() and regression tests.
Mirrors capabilityProfiles.js segregation (fail-closed on finance/stock execution).
"""

from __future__ import annotations

# All DocTypes the SPA touches via /api/resource/* (audit catalog)
SPA_REST_DOCTYPES: tuple[str, ...] = (
	"Activity Log",
	"Batch",
	"Bin",
	"Company",
	"Customer",
	"GL Entry",
	"Has Role",
	"Item",
	"Item Barcode",
	"Item Price",
	"Mode of Payment",
	"Payment Entry",
	"POS Closing Entry",
	"POS Invoice",
	"POS Opening Entry",
	"POS Profile",
	"Price List",
	"Purchase Invoice",
	"Purchase Invoice Item",
	"Purchase Receipt",
	"Purchase Receipt Item",
	"Role Profile",
	"Sales Invoice",
	"Stock Entry",
	"Stock Ledger Entry",
	"Stock Reconciliation",
	"Supplier",
	"Supplier Group",
	"User",
	"User Permission",
	"Warehouse",
	"Employee",
	"Department",
	"Designation",
)

PERM_FIELDS: tuple[str, ...] = ("read", "write", "create", "submit", "cancel", "delete")

# Outside SPA_REST_DOCTYPES but applied by operational_permissions.apply_permission_matrix()
FINANCE_AUXILIARY_DOCTYPES: tuple[str, ...] = ("Account",)

OPERATIONAL_ERP_ROLES: tuple[str, ...] = (
	"POS User",
	"Sales User",
	"Stock User",
	"Purchase User",
	"Sales Manager",
	"POS Manager",
	"Accounts User",
	"Accounts Manager",
	"Stock Manager",
	"Purchase Manager",
	"Store Manager",
	"Elmahdi HR User",
)

NONE = dict.fromkeys(PERM_FIELDS, 0)
READ = {**NONE, "read": 1}
WRITE_DRAFT = {**READ, "write": 1, "create": 1}
EXECUTE = {**WRITE_DRAFT, "submit": 1, "cancel": 1}


def _catalog(*pairs: tuple[str, dict[str, int]]) -> dict[str, dict[str, int]]:
	return dict(pairs)


# Shared read-only bundles
_CATALOG_READ = _catalog(
	("Item", READ),
	("Item Barcode", READ),
	("Item Price", READ),
	("Company", READ),
	("Customer", READ),
	("POS Profile", READ),
	("Mode of Payment", READ),
	("Bin", READ),
)

_CASHIER = {
	**_CATALOG_READ,
	"POS Invoice": EXECUTE,
	"POS Opening Entry": EXECUTE,
	"POS Closing Entry": WRITE_DRAFT,
	"Payment Entry": NONE,
	"Purchase Invoice": NONE,
	"Purchase Receipt": NONE,
	"Stock Entry": NONE,
	"Stock Reconciliation": NONE,
	"Sales Invoice": NONE,
	"Supplier": NONE,
	"User": NONE,
	"User Permission": NONE,
	"Warehouse": READ,
	"Has Role": NONE,
	"Role Profile": READ,
	"Activity Log": NONE,
}

_INVENTORY = {
	**_CATALOG_READ,
	"Warehouse": READ,
	"Batch": READ,
	"Stock Ledger Entry": READ,
	"Stock Entry": EXECUTE,
	"Stock Reconciliation": READ,
	"Purchase Receipt": NONE,
	"Purchase Invoice": NONE,
	"Payment Entry": NONE,
	"POS Invoice": NONE,
	"POS Opening Entry": NONE,
	"POS Closing Entry": NONE,
	"Sales Invoice": NONE,
	"Supplier": NONE,
	"User": NONE,
	"User Permission": NONE,
	"Has Role": NONE,
	"Role Profile": READ,
	"Activity Log": NONE,
}

_PURCHASING = {
	**_CATALOG_READ,
	"Warehouse": READ,
	"Supplier": WRITE_DRAFT,
	"Supplier Group": READ,
	"Purchase Receipt": WRITE_DRAFT,
	"Purchase Receipt Item": WRITE_DRAFT,
	"Purchase Order": NONE,
	"Purchase Invoice": READ,
	"Purchase Invoice Item": READ,
	"Payment Entry": NONE,
	"Stock Entry": READ,
	"Stock Reconciliation": NONE,
	"POS Invoice": NONE,
	"Sales Invoice": NONE,
	"Stock Ledger Entry": NONE,
	"Batch": NONE,
	"User": NONE,
	"User Permission": NONE,
	"Has Role": NONE,
	"Role Profile": READ,
	"Activity Log": NONE,
}

_MONITOR = {
	**_CATALOG_READ,
	"Warehouse": READ,
	"Batch": READ,
	"Stock Ledger Entry": READ,
	"Supplier": READ,
	"Supplier Group": READ,
	"Purchase Receipt": READ,
	"Purchase Receipt Item": READ,
	"Purchase Invoice": READ,
	"Purchase Invoice Item": READ,
	"POS Invoice": READ,
	"Sales Invoice": READ,
	"POS Opening Entry": READ,
	"POS Closing Entry": {**READ, "write": 1, "submit": 1, "cancel": 1},
	"Stock Entry": READ,
	"Stock Reconciliation": READ,
	"Payment Entry": NONE,
	"Activity Log": READ,
	"User": NONE,
	"User Permission": NONE,
	"Has Role": NONE,
	"Role Profile": READ,
}

_ACCOUNTANT = {
	**_CATALOG_READ,
	"Warehouse": READ,
	"Supplier": READ,
	"Supplier Group": READ,
	# AP supplier payments: validate paid_from / paid_to and list cash-bank accounts (read-only COA)
	"Account": READ,
	"Purchase Receipt": READ,
	"Purchase Receipt Item": READ,
	"Purchase Invoice": EXECUTE,
	"Purchase Invoice Item": READ,
	"Payment Entry": EXECUTE,
	"Sales Invoice": READ,
	"POS Invoice": READ,
	# write+submit: ERPNext update_after_submit on linked opening when closing is approved
	"POS Opening Entry": {**READ, "write": 1, "submit": 1},
	"POS Closing Entry": {**READ, "write": 1, "submit": 1, "cancel": 1},
	"GL Entry": READ,
	"Stock Entry": READ,
	"Stock Reconciliation": NONE,
	"Stock Ledger Entry": READ,
	"Batch": READ,
	"Activity Log": READ,
	"User": NONE,
	"User Permission": NONE,
	"Has Role": NONE,
	"Role Profile": READ,
	"Price List": READ,
}

# HR — operational users, employees, shift visibility; no finance/stock/purchasing execution
_HR = {
	"Company": READ,
	"Warehouse": READ,
	"Price List": READ,
	"POS Profile": READ,
	"Mode of Payment": READ,
	"User": WRITE_DRAFT,
	"User Permission": WRITE_DRAFT,
	"Role Profile": READ,
	"Employee": {**WRITE_DRAFT, "submit": 1},
	"Department": READ,
	"Designation": READ,
	"Has Role": READ,
	"POS Opening Entry": READ,
	"POS Closing Entry": READ,
	"Item": NONE,
	"Item Barcode": NONE,
	"Item Price": NONE,
	"Customer": NONE,
	"Bin": NONE,
	"Batch": NONE,
	"Stock Ledger Entry": NONE,
	"Stock Entry": NONE,
	"Stock Reconciliation": NONE,
	"Purchase Receipt": NONE,
	"Purchase Receipt Item": NONE,
	"Purchase Invoice": NONE,
	"Purchase Invoice Item": NONE,
	"Payment Entry": NONE,
	"POS Invoice": NONE,
	"Sales Invoice": NONE,
	"Supplier": NONE,
	"Supplier Group": NONE,
	"GL Entry": NONE,
	"Activity Log": NONE,
}

# ERP role -> REST DocPerm layer (merged into PERM_MATRIX)
REST_ROLE_LAYERS: dict[str, dict[str, dict[str, int]]] = {
	"POS User": _CASHIER,
	"Sales User": _CASHIER,
	"Stock User": _INVENTORY,
	"Purchase User": _PURCHASING,
	"Sales Manager": _MONITOR,
	"POS Manager": _MONITOR,
	"Store Manager": _MONITOR,
	"Accounts User": _ACCOUNTANT,
	"Accounts Manager": _ACCOUNTANT,
	# Legacy manager roles — keep monitor-only even if assigned outside store profile
	"Stock Manager": _MONITOR,
	"Purchase Manager": _MONITOR,
	"Elmahdi HR User": _HR,
}

# Regression expectations keyed by operational user email
REST_USER_EXPECTATIONS: dict[str, list[tuple[str, str, bool]]] = {
	"cashier@elmahdi.com": [
		("POS Invoice", "create", True),
		("POS Invoice", "submit", True),
		("Payment Entry", "create", False),
		("Purchase Invoice", "create", False),
		("Stock Entry", "create", False),
		("Purchase Receipt", "create", False),
		("Sales Invoice", "read", False),
		("User", "create", False),
		("Warehouse", "create", False),
		("Item", "write", False),
	],
	"inventory@elmahdi.com": [
		("Stock Entry", "create", True),
		("Stock Entry", "submit", True),
		("Purchase Receipt", "create", False),
		("Payment Entry", "create", False),
		("Purchase Invoice", "create", False),
		("POS Invoice", "create", False),
		("Warehouse", "create", False),
		("Item", "write", False),
	],
	"purchasing@elmahdi.com": [
		("Purchase Receipt", "create", True),
		("Purchase Receipt", "submit", False),
		("Purchase Order", "create", False),
		("Purchase Order", "submit", False),
		("Purchase Invoice", "create", False),
		("Purchase Invoice", "submit", False),
		("Payment Entry", "create", False),
		("Stock Entry", "create", False),
		("Stock Entry", "submit", False),
		("Supplier", "write", True),
		("Sales Invoice", "read", False),
	],
	"manager@elmahdi.com": [
		("POS Closing Entry", "submit", True),
		("Purchase Receipt", "create", False),
		("Purchase Receipt", "submit", False),
		("Stock Entry", "create", False),
		("Payment Entry", "create", False),
		("Purchase Invoice", "create", False),
		("POS Invoice", "read", True),
		("Sales Invoice", "read", True),
		("User", "create", False),
	],
	"accountant@elmahdi.com": [
		("Account", "read", True),
		("Account", "create", False),
		("Account", "write", False),
		("Payment Entry", "create", True),
		("Payment Entry", "submit", True),
		("Purchase Invoice", "create", True),
		("Purchase Invoice", "submit", True),
		("POS Opening Entry", "write", True),
		("POS Opening Entry", "submit", True),
		("POS Closing Entry", "submit", True),
		("Stock Entry", "create", False),
		("Purchase Receipt", "create", False),
		("Sales Invoice", "read", True),
		("POS Invoice", "read", True),
		("User", "create", False),
	],
	"hr@elmahdi.com": [
		("User", "create", True),
		("User", "read", True),
		("User", "write", True),
		("Employee", "read", True),
		("Employee", "create", True),
		("Employee", "write", True),
		("Employee", "delete", False),
		("Employee", "cancel", False),
		("Department", "read", True),
		("Department", "write", False),
		("Designation", "read", True),
		("Designation", "write", False),
		("User Permission", "create", True),
		("Payment Entry", "create", False),
		("Stock Entry", "create", False),
		("Purchase Receipt", "create", False),
		("POS Invoice", "create", False),
		("POS Opening Entry", "submit", False),
	],
}

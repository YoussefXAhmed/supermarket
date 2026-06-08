"""
Realign Frappe DocPerm rows on the Supplier doctype to match the supermarket
workflow expressed in `api/supplier_authorization.py`.

Policy (re-stated):
- Sales Manager (Elmahdi Store Manager role) → read + write + create + delete
- System Manager (Elmahdi Administrator) → read + write + create + delete (stock)
- Stock User (Elmahdi Inventory Clerk) → read only (explicit Custom DocPerm)
- Purchase User (Elmahdi Purchasing Officer) → read only (explicit Custom DocPerm)
- Accounts User / Manager (Elmahdi Accountant) → read only

Idempotent. Safe to re-run after a Frappe upgrade restores stock perms.

Run:
    bench --site <site> execute elmahdi.setup.supplier_permissions.execute
"""

from __future__ import annotations

import frappe


SUPPLIER = "Supplier"


def _remove_custom_perm_write(role: str) -> bool:
    """Remove Custom DocPerm row for (Supplier, role) if it grants write."""
    rows = frappe.db.get_all(
        "Custom DocPerm",
        filters={"parent": SUPPLIER, "role": role},
        pluck="name",
    )
    removed = False
    for name in rows:
        frappe.delete_doc("Custom DocPerm", name, ignore_permissions=True, force=True)
        removed = True
    return removed


def _ensure_custom_perm(role: str, *, create: int, write: int, do_read: int = 1, delete: int = 0) -> bool:
    """Insert / update a Custom DocPerm for the given role on Supplier."""
    existing = frappe.db.get_value(
        "Custom DocPerm",
        {"parent": SUPPLIER, "role": role, "permlevel": 0},
        "name",
    )
    if existing:
        doc = frappe.get_doc("Custom DocPerm", existing)
        doc.read = do_read
        doc.write = write
        doc.create = create
        doc.delete = delete
        doc.save(ignore_permissions=True)
        return False  # updated, not new
    frappe.get_doc({
        "doctype": "Custom DocPerm",
        "parent": SUPPLIER,
        "parenttype": "DocType",
        "parentfield": "permissions",
        "role": role,
        "permlevel": 0,
        "read": do_read,
        "write": write,
        "create": create,
        "delete": delete,
        "submit": 0,
        "cancel": 0,
        "amend": 0,
    }).insert(ignore_permissions=True)
    return True


def execute():
    actions = []

    # 1. Re-state Purchase User → Supplier as READ-ONLY. The previous setup
    #    pass removed all rows for Purchase User; relying on stock DocPerm
    #    fallback is fragile. Pin an explicit row so the policy survives
    #    Frappe upgrades and any future DocPerm reset.
    _remove_custom_perm_write("Purchase User")
    if _ensure_custom_perm("Purchase User", create=0, write=0, do_read=1, delete=0):
        actions.append("added Custom DocPerm: Purchase User → Supplier (read only)")
    else:
        actions.append("updated Custom DocPerm: Purchase User → Supplier (read only)")

    # 2. Stock User → Supplier (Elmahdi Inventory Clerk) explicit read-only.
    if _ensure_custom_perm("Stock User", create=0, write=0, do_read=1, delete=0):
        actions.append("added Custom DocPerm: Stock User → Supplier (read only)")
    else:
        actions.append("updated Custom DocPerm: Stock User → Supplier (read only)")

    # 3. Grant Sales Manager (Elmahdi Store Manager profile) full supplier
    #    rights — read + create + write + delete. The before_trash hook
    #    still rejects deletion when the supplier has linked transactions.
    if _ensure_custom_perm("Sales Manager", create=1, write=1, do_read=1, delete=1):
        actions.append("added Custom DocPerm: Sales Manager → Supplier (read/write/create/delete)")
    else:
        actions.append("updated Custom DocPerm: Sales Manager → Supplier (read/write/create/delete)")

    # 4. Accounts roles: read-only is already the Custom DocPerm baseline;
    #    don't tamper.

    frappe.db.commit()

    print("Supplier DocPerm realignment complete:")
    for a in actions:
        print(f"  - {a}")
    if not actions:
        print("  (no changes — already aligned)")

    # Verify by listing current perms
    rows = frappe.db.get_all(
        "Custom DocPerm",
        filters={"parent": SUPPLIER},
        fields=["role", "create", "read", "write", "delete"],
        order_by="role",
    )
    print("\nCurrent Custom DocPerm rows on Supplier:")
    for p in rows:
        print(f"  role={p.role:<25} read={p.read} create={p.create} write={p.write} delete={p.delete}")

"""Smoke test: show capabilities for test users + item_master perm flags."""
import frappe
from elmahdi.api import spa_authorization as sa
from elmahdi.api import item_master as im


def execute():
    users = [
        ("Administrator", "(admin)"),
        ("cashier@elmahdi.com", "Cashier"),
        ("manager@elmahdi.com", "Store Manager"),
        ("hr@elmahdi.com", "HR"),
    ]
    for u, label in users:
        if u != "Administrator" and not frappe.db.exists("User", u):
            print(f"-- skip {u}")
            continue
        rp = frappe.db.get_value("User", u, "role_profile_name") if u != "Administrator" else "Administrator"
        frappe.set_user(u)
        caps = sa.get_capabilities()
        true_caps = sorted([k for k, v in caps.items() if v])
        try:
            data = im.get_item_master("EG-0001")
            print(f"\n=== {label}: {u} ===")
            print(f"  role_profile = {rp}")
            print(f"  true caps    = {true_caps[:6]}")
            print(f"  can_edit_item    = {data.get('can_edit_item')}")
            print(f"  can_edit_pricing = {data.get('can_edit_pricing')}")
        except frappe.PermissionError as e:
            print(f"\n=== {label}: {u} ===")
            print(f"  role_profile = {rp}")
            print(f"  true caps    = {true_caps[:6]}")
            print(f"  VIEW BLOCKED → {str(e)[:80]}")
    frappe.set_user("Administrator")

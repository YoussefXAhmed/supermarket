"""Verify backend pricing-edit guard."""
import frappe
from elmahdi.api import item_master as im


def execute():
    mgr = "manager@elmahdi.com"
    if not frappe.db.exists("User", mgr):
        print("manager user missing")
        return
    frappe.set_user(mgr)
    print(f"Acting as: {frappe.session.user}")

    # 1. Try pricing edit — must be blocked
    try:
        im.update_item_master("EG-0001", selling_price=99.99)
        print("  ❌ BUG: Store Manager edited pricing!")
    except frappe.PermissionError as e:
        print(f"  ✅ Pricing edit blocked: {str(e)[:80]}")

    # 2. Try item-detail edit (description) — must succeed
    try:
        result = im.update_item_master("EG-0001", description="Updated by manager test")
        print(f"  ✅ Detail edit allowed; description = {result.get('description')[:50]}")
    except Exception as e:
        print(f"  ❌ Detail edit unexpectedly blocked: {type(e).__name__}: {e}")

    # 3. Try mixed — pricing field present should reject the whole call
    try:
        im.update_item_master("EG-0001", description="x", buying_price=10)
        print("  ❌ BUG: Mixed edit succeeded with pricing!")
    except frappe.PermissionError as e:
        print(f"  ✅ Mixed edit (with pricing) blocked: {str(e)[:80]}")
    frappe.set_user("Administrator")

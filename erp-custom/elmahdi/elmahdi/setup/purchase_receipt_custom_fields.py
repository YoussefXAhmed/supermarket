"""Custom fields on Purchase Receipt for buying-rate approval workflow."""

import frappe


CUSTOM_FIELDS = [
    {
        "dt": "Purchase Receipt",
        "fieldname": "pending_purchase_approval",
        "label": "Pending Purchase Approval",
        "fieldtype": "Check",
        "insert_after": "status",
        "default": "0",
        "read_only": 1,
    },
    {
        "dt": "Purchase Receipt",
        "fieldname": "purchase_approval_level",
        "label": "Purchase Approval Level",
        "fieldtype": "Select",
        "options": "\nManager\nAccountant",
        "insert_after": "pending_purchase_approval",
        "read_only": 1,
    },
    {
        "dt": "Purchase Receipt",
        "fieldname": "purchase_rate_audit",
        "label": "Purchase Rate Audit (JSON)",
        "fieldtype": "Long Text",
        "insert_after": "purchase_approval_level",
        "read_only": 1,
        "hidden": 1,
    },
]


def execute():
    for row in CUSTOM_FIELDS:
        name = f"Purchase Receipt-{row['fieldname']}"
        if frappe.db.exists("Custom Field", name):
            continue
        doc = frappe.get_doc({"doctype": "Custom Field", **row})
        doc.insert(ignore_permissions=True)
    frappe.db.commit()

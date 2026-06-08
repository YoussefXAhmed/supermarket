"""HR custom-field installer.

Adds three Elmahdi-specific fields to ERPNext's `Employee` doctype:

  • elmahdi_branch_warehouse — Link → Warehouse
        Our branch model. The standard `branch` field on Employee links to
        ERPNext's "Branch" doctype which we don't use; this Warehouse link
        is the authoritative branch reference for HR + Store Manager
        scoping.
  • national_id  — Data
        Egyptian National ID. Surfaced on the Employee form, used in
        salary reports + KYC.
  • elmahdi_address — Small Text
        Home address (city / street / building). Kept as a single text
        field for simplicity; Employee Address links exist in ERPNext but
        are over-engineered for a supermarket payroll workflow.

The installer is idempotent — re-runs only update the field definition,
they never delete data.

Wire-up:
  hooks.after_migrate → setup.hr_custom_fields.install_hr_custom_fields
"""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


HR_FIELDS = {
    "Employee": [
        {
            "fieldname": "elmahdi_branch_warehouse",
            "label": "Branch (Warehouse)",
            "fieldtype": "Link",
            "options": "Warehouse",
            "insert_after": "branch",
            "description": (
                "The store branch this employee is attached to. Used for "
                "row-level scoping (Store Managers see only their own "
                "branch's employees) and for branch filters on HR reports."
            ),
            "in_list_view": 1,
            "in_standard_filter": 1,
        },
        {
            "fieldname": "national_id",
            "label": "National ID",
            "fieldtype": "Data",
            "insert_after": "cell_number",
            "length": 32,
            "description": "Egyptian National ID (14 digits).",
            "in_standard_filter": 0,
            "unique": 0,  # not enforced as unique to accommodate corrections / typos
        },
        {
            "fieldname": "elmahdi_address",
            "label": "Home Address",
            "fieldtype": "Small Text",
            "insert_after": "personal_email",
            "description": "Free-text home address (city, street, building).",
        },
    ],
}


def install_hr_custom_fields() -> dict:
    """Idempotent — re-running only updates field metadata."""
    create_custom_fields(HR_FIELDS, update=True)
    frappe.db.commit()
    return {
        "installed": ["Employee.elmahdi_branch_warehouse", "Employee.national_id", "Employee.elmahdi_address"],
    }

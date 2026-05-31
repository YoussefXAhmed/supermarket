"""Custom fields for purchase + shift approval audit trails."""

import frappe

CUSTOM_FIELDS = [
	# Purchase Receipt
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
		"fieldname": "approval_status",
		"label": "Approval Status",
		"fieldtype": "Select",
		"options": "\ndraft\npending_manager\npending_accountant\napproved\nrejected\nsubmitted",
		"insert_after": "pending_purchase_approval",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "purchase_approval_level",
		"label": "Purchase Approval Level",
		"fieldtype": "Select",
		"options": "\nmanager\naccountant",
		"insert_after": "approval_status",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "variance_percent",
		"label": "Variance %",
		"fieldtype": "Percent",
		"insert_after": "purchase_approval_level",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "approval_role",
		"label": "Approval Role",
		"fieldtype": "Data",
		"insert_after": "variance_percent",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "approved_by",
		"label": "Approved By",
		"fieldtype": "Link",
		"options": "User",
		"insert_after": "approval_role",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "approved_at",
		"label": "Approved At",
		"fieldtype": "Datetime",
		"insert_after": "approved_by",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "approval_reason",
		"label": "Approval Reason",
		"fieldtype": "Small Text",
		"insert_after": "approved_at",
		"read_only": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "purchase_rate_audit",
		"label": "Purchase Rate Audit (JSON)",
		"fieldtype": "Long Text",
		"insert_after": "approval_reason",
		"read_only": 1,
		"hidden": 1,
	},
	{
		"dt": "Purchase Receipt",
		"fieldname": "invoice_matching_audit",
		"label": "Invoice Matching Audit (JSON)",
		"fieldtype": "Long Text",
		"insert_after": "purchase_rate_audit",
		"read_only": 1,
		"hidden": 1,
	},
	# Payment Entry
	{
		"dt": "Payment Entry",
		"fieldname": "elmahdi_payment_audit",
		"label": "Elmahdi Payment Audit (JSON)",
		"fieldtype": "Long Text",
		"insert_after": "remarks",
		"read_only": 1,
		"hidden": 1,
	},
	# POS Invoice — checkout idempotency (retry-safe)
	{
		"dt": "POS Invoice",
		"fieldname": "elmahdi_idempotency_key",
		"label": "Elmahdi Idempotency Key",
		"fieldtype": "Data",
		"insert_after": "pos_profile",
		"read_only": 1,
		"unique": 1,
		"hidden": 1,
		"no_copy": 1,
	},
	# POS Invoice — opening-entry attribution. Lets shift summaries and
	# closing entries scope invoices to a specific shift even when multiple
	# shifts share the same cashier + profile + posting_date.
	{
		"dt": "POS Invoice",
		"fieldname": "pos_opening_entry",
		"label": "POS Opening Entry",
		"fieldtype": "Link",
		"options": "POS Opening Entry",
		"insert_after": "elmahdi_idempotency_key",
		"read_only": 1,
		"no_copy": 1,
	},
	# POS Closing Entry
	{
		"dt": "POS Closing Entry",
		"fieldname": "pending_shift_approval",
		"label": "Pending Shift Approval",
		"fieldtype": "Check",
		"insert_after": "status",
		"default": "0",
		"read_only": 1,
	},
	{
		"dt": "POS Closing Entry",
		"fieldname": "variance_percent",
		"label": "Cash Variance %",
		"fieldtype": "Percent",
		"insert_after": "pending_shift_approval",
		"read_only": 1,
	},
	{
		"dt": "POS Closing Entry",
		"fieldname": "approval_role",
		"fieldtype": "Data",
		"label": "Approval Role",
		"insert_after": "variance_percent",
		"read_only": 1,
	},
	{
		"dt": "POS Closing Entry",
		"fieldname": "approved_by",
		"label": "Approved By",
		"fieldtype": "Link",
		"options": "User",
		"insert_after": "approval_role",
		"read_only": 1,
	},
	{
		"dt": "POS Closing Entry",
		"fieldname": "approved_at",
		"label": "Approved At",
		"fieldtype": "Datetime",
		"insert_after": "approved_by",
		"read_only": 1,
	},
	{
		"dt": "POS Closing Entry",
		"fieldname": "approval_reason",
		"label": "Approval Reason",
		"fieldtype": "Small Text",
		"insert_after": "approved_at",
		"read_only": 1,
	},
]


def execute():
	for row in CUSTOM_FIELDS:
		name = f"{row['dt']}-{row['fieldname']}"
		if frappe.db.exists("Custom Field", name):
			continue
		frappe.get_doc({"doctype": "Custom Field", **row}).insert(ignore_permissions=True)
	frappe.db.commit()

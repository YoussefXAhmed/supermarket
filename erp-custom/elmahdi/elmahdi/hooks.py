from . import __version__ as app_version

app_name = "elmahdi"
app_title = "Elmahdi"
app_publisher = "Elmahdi"
app_description = "SPA session identity API for supermarket ERP frontend"
app_email = "support@elmahdi.com"
app_license = "mit"
app_version = app_version

required_apps = ["frappe"]

before_request = ["elmahdi.api.rest_resource_guard.before_request"]

doc_events = {
    "Purchase Receipt": {
        "validate": "elmahdi.api.purchasing.validate_purchase_receipt",
        "before_submit": "elmahdi.api.purchasing.before_submit_purchase_receipt",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "User": {
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_user",
    },
    "Payment Entry": {
        # Fail-closed: any user writing/submitting a Payment Entry (incl. via
        # REST) must pass the SPA capability check, not just Frappe DocPerm.
        "validate": "elmahdi.api.write_guards.validate_payment_entry_write",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Purchase Invoice": {
        "validate": "elmahdi.api.write_guards.validate_purchase_invoice_write",
        # Notify the Accountant when a Purchase Invoice lands, regardless of
        # whether it was created via the approval flow or directly.
        "after_insert": "elmahdi.api.write_guards.after_insert_purchase_invoice",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Sales Invoice": {
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "POS Invoice": {
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "POS Closing Entry": {
        "before_submit": "elmahdi.api.pos_closing_approval.before_submit_pos_closing",
        "on_update": "elmahdi.api.pos_closing_approval.on_update_pos_closing",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "POS Opening Entry": {
        "before_submit": "elmahdi.api.pos_opening_policy.before_submit_pos_opening",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Stock Entry": {
        "validate": "elmahdi.api.write_guards.validate_stock_entry_write",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Stock Reconciliation": {
        "validate": "elmahdi.api.write_guards.validate_stock_reconciliation_write",
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Journal Entry": {
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Employee": {
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Supplier": {
        "validate":  "elmahdi.api.supplier_authorization.validate_supplier_write",
        "on_trash":  "elmahdi.api.supplier_authorization.before_trash_supplier",
    },
}

# Row-level scoping. Cashiers can only see their own POS Invoices / POS
# Opening / POS Closing — without this, a Cashier hitting the REST API
# directly would see every cashier's records (Frappe DocPerm has no
# concept of "owned-by-me").
permission_query_conditions = {
    "POS Invoice":        "elmahdi.api.row_scoping.pos_invoice_pqc",
    "POS Opening Entry":  "elmahdi.api.row_scoping.pos_opening_pqc",
    "POS Closing Entry":  "elmahdi.api.row_scoping.pos_closing_pqc",
    "Sales Invoice":      "elmahdi.api.row_scoping.sales_invoice_pqc",
    # HR — Store Manager scoped to own branch (warehouse); employees see
    # only their own records. Branch field is `Employee.elmahdi_branch_warehouse`.
    "Employee":           "elmahdi.api.row_scoping.employee_pqc",
    "Leave Application":  "elmahdi.api.row_scoping.leave_application_pqc",
    "Salary Slip":        "elmahdi.api.row_scoping.salary_slip_pqc",
    "Attendance":         "elmahdi.api.row_scoping.attendance_pqc",
}

# Daily AP overdue scan — emits Notification Log entries for accountants when
# a Purchase Invoice becomes overdue. Idempotent per day.
scheduler_events = {
    "daily": [
        "elmahdi.api.accounts_payable.scan_and_notify_overdue_invoices",
        # Phase 4.a — nightly prune of Elmahdi Batch Audit rows older
        # than the configured retention (Elmahdi Settings.
        # batch_audit_retention_days, default 365). Rows with
        # retention_locked=1 are skipped. The job is idempotent and
        # self-throttling (100k-row safety cap).
        "elmahdi.api.audit.prune_expired_audits",
    ],
}

# Install/refresh Print Format records on every migration. Idempotent — only
# the HTML body is replaced; existing records keep their name + metadata.
after_migrate = [
    "elmahdi.setup.print_formats.install_print_formats",
    # HR Batch A — Employee custom fields (branch warehouse, national_id,
    # address). Re-runs only update metadata; never deletes data.
    "elmahdi.setup.hr_custom_fields.install_hr_custom_fields",
    # HR Batch D — default Leave Types (Annual / Sick / Emergency /
    # Unpaid). Idempotent; only creates types that don't already exist.
    "elmahdi.api.hr_leave.seed_leave_types",
    # HR Batch E — default Salary Components + a base Salary Structure.
    # Each employee still needs an individual Salary Structure Assignment
    # before payroll generation will pick them up.
    "elmahdi.api.hr_payroll.seed_payroll_defaults",
    # Phase 3 (Global System Settings) — install `Elmahdi Settings` Single
    # (Feature Flags + Backup defaults) and the audit-log doctype. Both
    # are idempotent; re-runs only fill missing fields, never overwrite.
    "elmahdi.setup.elmahdi_settings_install.run",
    # Phase 5 (Personal Settings) — 6 User custom fields driven by the
    # SPA /me/* pages. Per-user, no admin involvement.
    "elmahdi.setup.personal_custom_fields.run",
]

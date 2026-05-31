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
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Purchase Invoice": {
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
        "before_cancel": "elmahdi.api.rest_resource_guard.before_cancel_guard",
        "on_trash": "elmahdi.api.rest_resource_guard.on_trash_guard",
    },
    "Stock Reconciliation": {
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
}

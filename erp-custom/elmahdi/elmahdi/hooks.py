from . import __version__ as app_version

app_name = "elmahdi"
app_title = "Elmahdi"
app_publisher = "Elmahdi"
app_description = "SPA session identity API for supermarket ERP frontend"
app_email = "support@elmahdi.com"
app_license = "mit"
app_version = app_version

required_apps = ["frappe"]

doc_events = {
    "Purchase Receipt": {
        "validate": "elmahdi.api.purchasing.validate_purchase_receipt",
        "before_submit": "elmahdi.api.purchasing.before_submit_purchase_receipt",
    },
    "POS Closing Entry": {
        "before_submit": "elmahdi.api.pos_closing_approval.before_submit_pos_closing",
        "on_update": "elmahdi.api.pos_closing_approval.on_update_pos_closing",
    },
    "POS Opening Entry": {
        "before_submit": "elmahdi.api.pos_opening_policy.before_submit_pos_opening",
    },
}

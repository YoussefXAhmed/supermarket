"""Set elmahdi_alert_level=2 on all Egyptian catalog items.

Run:
    bench --site supermarket.local execute elmahdi._seed_alerts.execute
"""
import frappe


def execute():
    items = frappe.get_all(
        "Item",
        filters={"item_code": ["like", "EG-%"], "disabled": 0},
        pluck="name",
    )
    print(f"Setting low-stock alert level = 2 on {len(items)} items...")
    for code in items:
        frappe.db.set_value(
            "Item",
            code,
            {
                "elmahdi_alert_level": 2,
                "elmahdi_reorder_level": 2,
                "elmahdi_reorder_qty": 20,
            },
        )
    frappe.db.commit()
    for code in items:
        row = frappe.db.get_value(
            "Item",
            code,
            ["item_name", "elmahdi_alert_level", "elmahdi_reorder_level", "elmahdi_reorder_qty"],
            as_dict=True,
        )
        print(
            f"  {code:10s} alert={row.elmahdi_alert_level:.0f} "
            f"reorder={row.elmahdi_reorder_level:.0f} qty={row.elmahdi_reorder_qty:.0f}"
        )
    return {"updated": len(items)}

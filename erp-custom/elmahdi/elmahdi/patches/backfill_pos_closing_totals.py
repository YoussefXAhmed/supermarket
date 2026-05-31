"""
Backfill grand_total / net_total / total_quantity on POS Closing Entry records
that were created before prepare_closing_entry populated pos_transactions.

Without this, the Daily Cash Register report's "Shift revenue" column reads 0
for historical shifts even though the underlying POS Invoices exist.

When the POS Invoice.pos_opening_entry custom field is present we scope strictly
by it. Otherwise we fall back to (cashier + pos_profile + creation window
between opening.creation and closing.creation), which correctly separates
multiple shifts that share the same posting_date.

The fields are non-ledger metadata on POS Closing Entry — the real GL impact
comes from POS Invoice / POS Invoice Merge Log, which is untouched. Safe to
update on submitted documents via db_set.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt


def execute():
    closings = frappe.get_all(
        "POS Closing Entry",
        fields=["name", "docstatus", "pos_opening_entry", "creation"],
    )
    if not closings:
        return

    has_field = frappe.get_meta("POS Invoice").has_field("pos_opening_entry")

    for row in closings:
        if not row.pos_opening_entry:
            continue
        try:
            opening = frappe.get_doc("POS Opening Entry", row.pos_opening_entry)
        except frappe.DoesNotExistError:
            continue

        invoices = []
        if has_field:
            invoices = frappe.get_all(
                "POS Invoice",
                filters={
                    "docstatus": 1,
                    "is_pos": 1,
                    "pos_profile": opening.pos_profile,
                    "pos_opening_entry": opening.name,
                    **({"owner": opening.user} if opening.user else {}),
                },
                fields=["name", "customer", "posting_date", "grand_total", "net_total", "is_return"],
            )

        if not invoices:
            # Historical fallback: scope by the cashier's activity window.
            # Use the opening's creation as the lower bound and the closing's
            # creation as the upper bound — invoices for this shift were
            # created in that interval.
            filters = {
                "docstatus": 1,
                "is_pos": 1,
                "pos_profile": opening.pos_profile,
                "creation": ["between", [opening.creation, row.creation]],
            }
            if opening.user:
                filters["owner"] = opening.user
            invoices = frappe.get_all(
                "POS Invoice",
                filters=filters,
                fields=["name", "customer", "posting_date", "grand_total", "net_total", "is_return"],
            )
            # Persist the linkage so future queries don't need the time-window
            # fallback.
            if has_field and invoices:
                for inv in invoices:
                    frappe.db.set_value(
                        "POS Invoice",
                        inv.name,
                        "pos_opening_entry",
                        opening.name,
                        update_modified=False,
                    )

        names = [i.name for i in invoices]
        qty_rows = (
            frappe.get_all(
                "POS Invoice Item",
                filters={"parent": ["in", names], "parenttype": "POS Invoice"},
                fields=["parent", "qty"],
            )
            if names
            else []
        )
        qty_by_inv = {}
        for q in qty_rows:
            qty_by_inv[q.parent] = flt(qty_by_inv.get(q.parent, 0)) + flt(q.qty)

        grand_total = sum(flt(i.grand_total) for i in invoices)
        net_total = sum(flt(i.net_total) for i in invoices)
        total_quantity = sum(flt(qty_by_inv.get(i.name, 0)) for i in invoices)

        # Reset child table first so re-running the patch corrects prior
        # mis-attribution.
        frappe.db.delete(
            "POS Invoice Reference",
            {"parent": row.name, "parenttype": "POS Closing Entry"},
        )
        for idx, inv in enumerate(invoices, start=1):
            child = frappe.new_doc("POS Invoice Reference")
            child.parent = row.name
            child.parenttype = "POS Closing Entry"
            child.parentfield = "pos_transactions"
            child.idx = idx
            child.pos_invoice = inv.name
            child.customer = inv.customer
            child.posting_date = inv.posting_date
            child.grand_total = inv.grand_total
            child.is_return = 1 if inv.is_return else 0
            child.db_insert()

        frappe.db.set_value(
            "POS Closing Entry",
            row.name,
            {
                "grand_total": grand_total,
                "net_total": net_total,
                "total_quantity": total_quantity,
            },
            update_modified=False,
        )

    frappe.db.commit()

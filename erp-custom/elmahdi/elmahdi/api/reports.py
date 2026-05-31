"""
Embedded reporting dispatcher.

Read-only, additive. Each report is a `_report_<name>` builder returning a
partial envelope (columns/rows/summary/warnings). The dispatcher wraps it
with `meta` and exposes it via `run_report(name, filters)`.

To add a report:
  1) Write `_report_<key>(filters: dict) -> dict`.
  2) Register it in REPORT_REGISTRY.
  3) Add the matching name in src/services/reports/reportKeys.js (frontend).

The envelope shape MUST mirror src/services/reports/reportEnvelope.js:

    {
      "columns":  [{ "key", "label", "type", "align"?, "sortable"? }],
      "rows":     [...],
      "summary":  { ...flat aggregates },
      "warnings": [...string messages],
      "meta":     { "name", "filters", "source" }
    }
"""

from __future__ import annotations

import json
from typing import Any, Callable

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate, add_days

from elmahdi.api.spa_authorization import has_cap


def _assert_may_view_reports() -> None:
    """Fail-closed: backend mirror of SPA's canViewReports gate.

    Per-report builders rely on `_safe()` to swallow doctype permission
    errors as warnings, which is correct row-level scoping. But without
    this check, an authenticated user without any report capability can
    still enumerate registered reports and request their envelopes.
    """
    if has_cap("can_view_reports") or has_cap("can_manage_system"):
        return
    if has_cap("can_view_purchase_approvals") or has_cap("can_view_supplier_payments"):
        return
    frappe.throw(_("You do not have permission to view reports."), frappe.PermissionError)


# ───────── helpers ─────────

def _parse_filters(filters: Any) -> dict:
    """Frappe sometimes hands us a JSON string, sometimes a dict — accept both."""
    if not filters:
        return {}
    if isinstance(filters, dict):
        return filters
    if isinstance(filters, str):
        try:
            return json.loads(filters) or {}
        except json.JSONDecodeError:
            return {}
    return {}


def _resolve_default_company() -> str:
    """First Company on the site — exports include this in the report header."""
    try:
        return frappe.db.get_value("Company", {}, "name") or ""
    except Exception:  # noqa: BLE001
        return ""


def _envelope(partial: dict, *, name: str, filters: dict, source: str = "backend") -> dict:
    return {
        "columns": partial.get("columns", []),
        "rows": partial.get("rows", []),
        "summary": partial.get("summary", {}),
        "warnings": [w for w in (partial.get("warnings") or []) if w],
        "meta": {
            "name": name,
            "filters": filters,
            "source": source,
            "company": _resolve_default_company(),
        },
    }


def _safe(call: Callable, default, *, warning_list: list, label: str):
    """Run a side-step query; record a warning instead of failing the report."""
    try:
        return call()
    except frappe.PermissionError:
        warning_list.append(f"{label}: permission denied")
        return default
    except Exception as exc:  # noqa: BLE001 — reports never 500
        warning_list.append(f"{label}: {exc}")
        return default


def _resolve_date_range(filters: dict) -> tuple[str, str]:
    """Default to last 7 days inclusive if neither bound supplied."""
    to_date = filters.get("to_date") or nowdate()
    from_date = filters.get("from_date") or add_days(to_date, -6)
    return (str(from_date), str(to_date))


# ───────── builders ─────────

def _report_sales_register(filters: dict) -> dict:
    """Per-invoice sales register over a date range.

    Source of truth: consolidated Sales Invoices (final stock + GL) PLUS
    submitted POS Invoices that have not yet consolidated (the day's
    in-flight sales before shift close). Both are real revenue.
    """
    warnings: list[str] = []
    from_date, to_date = _resolve_date_range(filters)
    cashier = (filters.get("cashier") or "").strip()
    customer = (filters.get("customer") or "").strip()

    si_filters: dict[str, Any] = {
        "docstatus": 1,
        "is_consolidated": 1,
        "posting_date": ["between", [from_date, to_date]],
    }
    if customer:
        si_filters["customer"] = customer

    consolidated = _safe(
        lambda: frappe.get_all(
            "Sales Invoice",
            filters=si_filters,
            fields=[
                "name",
                "posting_date",
                "posting_time",
                "customer",
                "customer_name",
                "set_warehouse",
                "owner",
                "grand_total",
                "total_taxes_and_charges",
                "status",
            ],
            order_by="posting_date desc, posting_time desc",
            limit=2000,
        ),
        default=[],
        warning_list=warnings,
        label="Sales Invoice (consolidated)",
    )

    pi_filters: dict[str, Any] = {
        "docstatus": 1,
        "consolidated_invoice": ["in", ["", None]],
        "posting_date": ["between", [from_date, to_date]],
    }
    if customer:
        pi_filters["customer"] = customer

    pos_invoices = _safe(
        lambda: frappe.get_all(
            "POS Invoice",
            filters=pi_filters,
            fields=[
                "name",
                "posting_date",
                "posting_time",
                "customer",
                "customer_name",
                "set_warehouse",
                "owner",
                "grand_total",
                "total_taxes_and_charges",
                "status",
            ],
            order_by="posting_date desc, posting_time desc",
            limit=2000,
        ),
        default=[],
        warning_list=warnings,
        label="POS Invoice (unconsolidated)",
    )

    rows = []
    total_revenue = 0.0
    total_tax = 0.0
    for r in consolidated:
        if cashier and r.get("owner") != cashier:
            continue
        amt = flt(r.get("grand_total"))
        tax = flt(r.get("total_taxes_and_charges"))
        total_revenue += amt
        total_tax += tax
        rows.append({
            "name": r["name"],
            "posting_date": r.get("posting_date"),
            "customer": r.get("customer_name") or r.get("customer"),
            "warehouse": r.get("set_warehouse") or "—",
            "cashier": r.get("owner"),
            "tax": tax,
            "grand_total": amt,
            "stage": "consolidated",
            "status": r.get("status"),
        })
    for r in pos_invoices:
        if cashier and r.get("owner") != cashier:
            continue
        amt = flt(r.get("grand_total"))
        tax = flt(r.get("total_taxes_and_charges"))
        total_revenue += amt
        total_tax += tax
        rows.append({
            "name": r["name"],
            "posting_date": r.get("posting_date"),
            "customer": r.get("customer_name") or r.get("customer"),
            "warehouse": r.get("set_warehouse") or "—",
            "cashier": r.get("owner"),
            "tax": tax,
            "grand_total": amt,
            "stage": "pending",  # not yet consolidated
            "status": r.get("status"),
        })

    # Sort by date desc (mixed list)
    rows.sort(key=lambda x: (str(x.get("posting_date") or ""), x.get("name") or ""), reverse=True)

    ticket_count = len(rows)
    avg_ticket = (total_revenue / ticket_count) if ticket_count else 0.0

    return {
        "columns": [
            {"key": "posting_date", "label": _("Date"), "type": "date", "sortable": True},
            {"key": "name", "label": _("Invoice"), "type": "mono", "sortable": True},
            {"key": "customer", "label": _("Customer"), "type": "text", "sortable": True},
            {"key": "warehouse", "label": _("Warehouse"), "type": "text"},
            {"key": "cashier", "label": _("Cashier"), "type": "text", "sortable": True},
            {"key": "tax", "label": _("Tax"), "type": "currency", "align": "right"},
            {"key": "grand_total", "label": _("Total"), "type": "currency", "align": "right", "sortable": True},
            {"key": "stage", "label": _("Stage"), "type": "status"},
        ],
        "rows": rows,
        "summary": {
            "fromDate": from_date,
            "toDate": to_date,
            "ticketCount": ticket_count,
            "totalRevenue": total_revenue,
            "totalTax": total_tax,
            "avgTicket": avg_ticket,
        },
        "warnings": warnings,
    }


def _report_daily_cash_register(filters: dict) -> dict:
    """Per-shift cash reconciliation over a date range.

    Reads POS Closing Entry (closed shifts) and pulls opening + expected +
    actual + variance per shift. Sorted newest first. Open shifts (no closing
    yet) are not included — they aren't reconciled yet.
    """
    warnings: list[str] = []
    from_date, to_date = _resolve_date_range(filters)
    cashier = (filters.get("cashier") or "").strip()

    closing_filters: dict[str, Any] = {
        "docstatus": ["in", [0, 1]],  # include drafts waiting on approval
        "posting_date": ["between", [from_date, to_date]],
    }
    if cashier:
        closing_filters["user"] = cashier

    closings = _safe(
        lambda: frappe.get_all(
            "POS Closing Entry",
            filters=closing_filters,
            fields=[
                "name",
                "posting_date",
                "period_start_date",
                "period_end_date",
                "user",
                "pos_profile",
                "pos_opening_entry",
                "docstatus",
                "status",
                "grand_total",
                "total_quantity",
                "net_total",
            ],
            order_by="posting_date desc, period_end_date desc",
            limit=200,
        ),
        default=[],
        warning_list=warnings,
        label="POS Closing Entry",
    )

    rows = []
    total_expected = 0.0
    total_actual = 0.0
    total_variance_abs = 0.0
    shifts_with_variance = 0
    grand_revenue = 0.0
    ticket_count = 0

    for c in closings:
        # Pull payment reconciliation child rows for this closing — these
        # hold the per-mode opening / expected / closing / variance.
        recon = _safe(
            lambda n=c["name"]: frappe.get_all(
                "POS Closing Entry Detail",
                filters={"parent": n},
                fields=["mode_of_payment", "opening_amount", "expected_amount", "closing_amount", "difference"],
            ),
            default=[],
            warning_list=warnings,
            label=f"recon rows for {c['name']}",
        )
        cash_row = next((r for r in recon if (r.get("mode_of_payment") or "").lower() == "cash"), None)
        opening = flt(cash_row.get("opening_amount")) if cash_row else 0.0
        expected = flt(cash_row.get("expected_amount")) if cash_row else 0.0
        actual = flt(cash_row.get("closing_amount")) if cash_row else 0.0
        variance = flt(cash_row.get("difference")) if cash_row else (actual - expected)

        total_expected += expected
        total_actual += actual
        total_variance_abs += abs(variance)
        if abs(variance) > 0.005:
            shifts_with_variance += 1
        grand_revenue += flt(c.get("grand_total"))
        ticket_count += cint(c.get("total_quantity"))

        rows.append({
            "name": c["name"],
            "posting_date": c.get("posting_date") or c.get("period_end_date"),
            "cashier": c.get("user"),
            "pos_profile": c.get("pos_profile"),
            "opening_cash": opening,
            "expected_cash": expected,
            "actual_cash": actual,
            "variance": variance,
            "ticket_total": flt(c.get("grand_total")),
            "stage": "submitted" if cint(c.get("docstatus")) == 1 else "pending",
        })

    return {
        "columns": [
            {"key": "posting_date", "label": _("Date"), "type": "date", "sortable": True},
            {"key": "name", "label": _("Closing"), "type": "mono", "sortable": True},
            {"key": "cashier", "label": _("Cashier"), "type": "text", "sortable": True},
            {"key": "pos_profile", "label": _("POS profile"), "type": "text"},
            {"key": "opening_cash", "label": _("Opening cash"), "type": "currency", "align": "right"},
            {"key": "expected_cash", "label": _("Expected cash"), "type": "currency", "align": "right"},
            {"key": "actual_cash", "label": _("Counted cash"), "type": "currency", "align": "right"},
            {"key": "variance", "label": _("Variance"), "type": "currency", "align": "right", "sortable": True},
            {"key": "ticket_total", "label": _("Shift revenue"), "type": "currency", "align": "right"},
            {"key": "stage", "label": _("Stage"), "type": "status"},
        ],
        "rows": rows,
        "summary": {
            "fromDate": from_date,
            "toDate": to_date,
            "shiftCount": len(rows),
            "shiftsWithVariance": shifts_with_variance,
            "totalExpectedCash": total_expected,
            "totalActualCash": total_actual,
            "totalAbsVariance": total_variance_abs,
            "totalRevenue": grand_revenue,
            "totalTicketLines": ticket_count,
        },
        "warnings": warnings,
    }


def _report_stock_balance(filters: dict) -> dict:
    """Real-time stock-on-hand per (item × warehouse).

    Source: Bin (the same canonical store the POS sellable-stock queries use).
    Reserved qty is shown so the difference between actual and sellable is
    visible without two queries.
    """
    warnings: list[str] = []
    warehouse = (filters.get("warehouse") or "").strip()
    item_code = (filters.get("item_code") or "").strip()

    bin_filters: dict[str, Any] = {}
    if warehouse:
        bin_filters["warehouse"] = warehouse
    if item_code:
        bin_filters["item_code"] = item_code

    rows = _safe(
        lambda: frappe.get_all(
            "Bin",
            filters=bin_filters,
            fields=[
                "item_code",
                "warehouse",
                "actual_qty",
                "reserved_qty",
                "projected_qty",
                "valuation_rate",
            ],
            order_by="item_code asc, warehouse asc",
            limit=5000,
        ),
        default=[],
        warning_list=warnings,
        label="Bin",
    )

    # Enrich with item_name once (single map lookup).
    if rows:
        codes = list({r["item_code"] for r in rows})
        names = _safe(
            lambda: {
                d["name"]: d.get("item_name") or d["name"]
                for d in frappe.get_all(
                    "Item",
                    filters={"name": ["in", codes]},
                    fields=["name", "item_name"],
                )
            },
            default={},
            warning_list=warnings,
            label="Item names",
        )
        for r in rows:
            r["item_name"] = names.get(r["item_code"], r["item_code"])
            r["sellable_qty"] = flt(r.get("actual_qty")) - flt(r.get("reserved_qty"))
            r["stock_value"] = flt(r.get("actual_qty")) * flt(r.get("valuation_rate"))

    # Drop zero-qty rows when no item filter was supplied — keeps the report
    # focused on what's actually on hand. With a specific item filter, show
    # the row even if zero so the user can see "yes, this item is out".
    if not item_code:
        rows = [r for r in rows if abs(flt(r.get("actual_qty"))) > 0.0001]

    total_value = sum(flt(r.get("stock_value")) for r in rows)
    total_qty = sum(flt(r.get("actual_qty")) for r in rows)

    return {
        "columns": [
            {"key": "item_code", "label": _("Item"), "type": "mono", "sortable": True},
            {"key": "item_name", "label": _("Name"), "type": "text", "sortable": True},
            {"key": "warehouse", "label": _("Warehouse"), "type": "text", "sortable": True},
            {"key": "actual_qty", "label": _("On hand"), "type": "number", "align": "right", "sortable": True},
            {"key": "reserved_qty", "label": _("Reserved"), "type": "number", "align": "right"},
            {"key": "sellable_qty", "label": _("Sellable"), "type": "number", "align": "right"},
            {"key": "valuation_rate", "label": _("Rate"), "type": "currency", "align": "right"},
            {"key": "stock_value", "label": _("Value"), "type": "currency", "align": "right", "sortable": True},
        ],
        "rows": rows,
        "summary": {
            "lineCount": len(rows),
            "totalQty": total_qty,
            "totalValue": total_value,
            "warehouseFilter": warehouse or "all",
        },
        "warnings": warnings,
    }


def _report_customer_ledger(filters: dict) -> dict:
    """Per-customer AR snapshot.

    For each customer with at least one consolidated POS sale in the date
    range: total billed, total paid, total outstanding (open invoices),
    last invoice date.
    """
    warnings: list[str] = []
    from_date, to_date = _resolve_date_range_or_long(filters)
    customer = (filters.get("customer") or "").strip()

    si_filters: dict[str, Any] = {
        "docstatus": 1,
        "is_consolidated": 1,
        "posting_date": ["between", [from_date, to_date]],
    }
    if customer:
        si_filters["customer"] = customer

    invoices = _safe(
        lambda: frappe.get_all(
            "Sales Invoice",
            filters=si_filters,
            fields=[
                "customer",
                "customer_name",
                "posting_date",
                "grand_total",
                "outstanding_amount",
            ],
            order_by="posting_date desc",
            limit=10000,
        ),
        default=[],
        warning_list=warnings,
        label="Sales Invoice",
    )

    # Bucket by customer.
    bucket: dict[str, dict] = {}
    for inv in invoices:
        cid = inv.get("customer") or "—"
        b = bucket.setdefault(cid, {
            "customer": cid,
            "customer_name": inv.get("customer_name") or cid,
            "invoice_count": 0,
            "total_billed": 0.0,
            "total_outstanding": 0.0,
            "last_invoice_date": None,
        })
        b["invoice_count"] += 1
        b["total_billed"] += flt(inv.get("grand_total"))
        b["total_outstanding"] += flt(inv.get("outstanding_amount"))
        date = inv.get("posting_date")
        if date and (b["last_invoice_date"] is None or str(date) > str(b["last_invoice_date"])):
            b["last_invoice_date"] = date

    rows = []
    for cid, b in bucket.items():
        b["total_paid"] = b["total_billed"] - b["total_outstanding"]
        rows.append(b)
    rows.sort(key=lambda r: r["total_outstanding"], reverse=True)

    return {
        "columns": [
            {"key": "customer_name", "label": _("Customer"), "type": "text", "sortable": True},
            {"key": "invoice_count", "label": _("Invoices"), "type": "number", "align": "right", "sortable": True},
            {"key": "total_billed", "label": _("Billed"), "type": "currency", "align": "right", "sortable": True},
            {"key": "total_paid", "label": _("Paid"), "type": "currency", "align": "right"},
            {"key": "total_outstanding", "label": _("Outstanding"), "type": "currency", "align": "right", "sortable": True},
            {"key": "last_invoice_date", "label": _("Last invoice"), "type": "date", "sortable": True},
        ],
        "rows": rows,
        "summary": {
            "fromDate": from_date,
            "toDate": to_date,
            "customerCount": len(rows),
            "totalBilled": sum(r["total_billed"] for r in rows),
            "totalOutstanding": sum(r["total_outstanding"] for r in rows),
            "totalInvoices": sum(r["invoice_count"] for r in rows),
        },
        "warnings": warnings,
    }


def _report_profit_and_loss(filters: dict) -> dict:
    """Simplified Profit & Loss for the period.

    Aggregates GL Entry by Account, restricted to Income / Expense root types.
    Income rows show credit-net (revenue increases credits); expense rows
    show debit-net. Net profit = total income − total expense.
    """
    warnings: list[str] = []
    from_date, to_date = _resolve_date_range_or_long(filters)
    company = (filters.get("company") or frappe.db.get_value("Company", {}, "name") or "").strip()

    gl_filters: dict[str, Any] = {
        "posting_date": ["between", [from_date, to_date]],
        "is_cancelled": 0,
    }
    if company:
        gl_filters["company"] = company

    entries = _safe(
        lambda: frappe.get_all(
            "GL Entry",
            filters=gl_filters,
            fields=["account", "debit", "credit"],
            limit=20000,
        ),
        default=[],
        warning_list=warnings,
        label="GL Entry",
    )

    # Need account root_type to classify income vs expense.
    accounts = list({e["account"] for e in entries})
    account_meta: dict[str, dict] = {}
    if accounts:
        account_meta = {
            a["name"]: a
            for a in _safe(
                lambda: frappe.get_all(
                    "Account",
                    filters={"name": ["in", accounts]},
                    fields=["name", "account_name", "root_type", "account_currency"],
                ),
                default=[],
                warning_list=warnings,
                label="Account meta",
            )
        }

    bucket: dict[str, dict] = {}
    for e in entries:
        meta = account_meta.get(e["account"])
        if not meta or meta.get("root_type") not in ("Income", "Expense"):
            continue
        root = meta["root_type"]
        b = bucket.setdefault(e["account"], {
            "account": e["account"],
            "account_name": meta.get("account_name") or e["account"],
            "root_type": root,
            "debit": 0.0,
            "credit": 0.0,
        })
        b["debit"] += flt(e.get("debit"))
        b["credit"] += flt(e.get("credit"))

    rows = []
    total_income = 0.0
    total_expense = 0.0
    for r in bucket.values():
        if r["root_type"] == "Income":
            amount = r["credit"] - r["debit"]  # net credit
            total_income += amount
        else:
            amount = r["debit"] - r["credit"]  # net debit
            total_expense += amount
        r["amount"] = amount
        rows.append(r)
    # Income first, then Expense; within each, largest first.
    rows.sort(key=lambda r: (0 if r["root_type"] == "Income" else 1, -r["amount"]))

    return {
        "columns": [
            {"key": "root_type", "label": _("Category"), "type": "status", "sortable": True},
            {"key": "account_name", "label": _("Account"), "type": "text", "sortable": True},
            {"key": "amount", "label": _("Amount"), "type": "currency", "align": "right", "sortable": True},
        ],
        "rows": rows,
        "summary": {
            "fromDate": from_date,
            "toDate": to_date,
            "company": company,
            "totalIncome": total_income,
            "totalExpense": total_expense,
            "netProfit": total_income - total_expense,
            "accountCount": len(rows),
        },
        "warnings": warnings,
    }


def _report_item_wise_sales(filters: dict) -> dict:
    """Item-wise sales aggregated over the date range.

    Pulls Sales Invoice Item rows for consolidated POS sales (the canonical
    sales record). Groups by item_code, sums qty + revenue, derives avg rate.
    """
    warnings: list[str] = []
    from_date, to_date = _resolve_date_range_or_long(filters)
    item_group = (filters.get("item_group") or "").strip()

    # Step 1: collect candidate invoice names for the date range.
    invoices = _safe(
        lambda: frappe.get_all(
            "Sales Invoice",
            filters={
                "docstatus": 1,
                "is_consolidated": 1,
                "posting_date": ["between", [from_date, to_date]],
            },
            fields=["name"],
            limit=20000,
        ),
        default=[],
        warning_list=warnings,
        label="Sales Invoice",
    )
    inv_names = [i["name"] for i in invoices]

    bucket: dict[str, dict] = {}
    if inv_names:
        item_filters: dict[str, Any] = {"parent": ["in", inv_names]}
        if item_group:
            item_filters["item_group"] = item_group
        sii_rows = _safe(
            lambda: frappe.get_all(
                "Sales Invoice Item",
                filters=item_filters,
                fields=["item_code", "item_name", "item_group", "qty", "amount", "rate"],
                limit=50000,
            ),
            default=[],
            warning_list=warnings,
            label="Sales Invoice Item",
        )
        for r in sii_rows:
            code = r.get("item_code") or "—"
            b = bucket.setdefault(code, {
                "item_code": code,
                "item_name": r.get("item_name") or code,
                "item_group": r.get("item_group") or "",
                "qty_sold": 0.0,
                "revenue": 0.0,
                "tx_count": 0,
            })
            b["qty_sold"] += flt(r.get("qty"))
            b["revenue"] += flt(r.get("amount"))
            b["tx_count"] += 1

    rows = []
    for b in bucket.values():
        qty = b["qty_sold"] or 0.0
        b["avg_rate"] = (b["revenue"] / qty) if qty else 0.0
        rows.append(b)
    rows.sort(key=lambda r: r["revenue"], reverse=True)

    total_qty = sum(r["qty_sold"] for r in rows)
    total_revenue = sum(r["revenue"] for r in rows)

    return {
        "columns": [
            {"key": "item_code", "label": _("Code"), "type": "mono", "sortable": True},
            {"key": "item_name", "label": _("Item"), "type": "text", "sortable": True},
            {"key": "item_group", "label": _("Group"), "type": "text"},
            {"key": "qty_sold", "label": _("Qty sold"), "type": "number", "align": "right", "sortable": True},
            {"key": "avg_rate", "label": _("Avg rate"), "type": "currency", "align": "right"},
            {"key": "revenue", "label": _("Revenue"), "type": "currency", "align": "right", "sortable": True},
            {"key": "tx_count", "label": _("Tx"), "type": "number", "align": "right"},
        ],
        "rows": rows,
        "summary": {
            "fromDate": from_date,
            "toDate": to_date,
            "itemCount": len(rows),
            "totalQty": total_qty,
            "totalRevenue": total_revenue,
            "invoiceCount": len(inv_names),
        },
        "warnings": warnings,
    }


def _resolve_date_range_or_long(filters: dict) -> tuple[str, str]:
    """Default to last 30 days for longer-window reports (P&L, customer, items)."""
    to_date = filters.get("to_date") or nowdate()
    from_date = filters.get("from_date") or add_days(to_date, -29)
    return (str(from_date), str(to_date))


# ───────── registry ─────────

REPORT_REGISTRY: dict[str, Callable[[dict], dict]] = {
    "sales-register": _report_sales_register,
    "daily-cash-register": _report_daily_cash_register,
    "stock-balance": _report_stock_balance,
    "customer-ledger": _report_customer_ledger,
    "profit-and-loss": _report_profit_and_loss,
    "item-wise-sales": _report_item_wise_sales,
}


# ───────── whitelisted entry points ─────────

@frappe.whitelist()
def run_report(name: str, filters: Any = None) -> dict:
    """Run a registered report and return the unified envelope.

    Unexpected exceptions inside a builder are recorded via
    `frappe.log_error` with the report name + filters as context, then
    re-raised so the caller sees a normal error response. This is what
    feeds the operational dashboard (Error Log doctype) and any
    downstream Sentry/log aggregator wired to it.
    """
    _assert_may_view_reports()
    if not name:
        frappe.throw(_("Report name is required"), frappe.ValidationError)
    fn = REPORT_REGISTRY.get(name)
    if not fn:
        frappe.throw(_("Unknown report: {0}").format(name), frappe.ValidationError)
    parsed = _parse_filters(filters)
    try:
        partial = fn(parsed) or {}
    except frappe.ValidationError:
        # Expected business-validation errors propagate as-is; not "errors"
        # in the observability sense.
        raise
    except Exception:
        frappe.log_error(
            title=f"Report failed: {name}",
            message=f"filters={parsed!r}\n\n{frappe.get_traceback()}",
        )
        raise
    return _envelope(partial, name=name, filters=parsed)


@frappe.whitelist()
def list_reports() -> list[str]:
    """Return the names of every backend-registered report."""
    _assert_may_view_reports()
    return sorted(REPORT_REGISTRY.keys())

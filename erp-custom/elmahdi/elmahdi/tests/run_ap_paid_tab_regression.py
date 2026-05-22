"""
Regression test: AP paid-tab visibility after supplier payment.

Verifies that after a Purchase Invoice is fully paid via Payment Entry:
  - invoice leaves the unpaid tab
  - invoice appears in the paid tab
  - invoice appears in the all tab
  - payment_status field is classified as "paid"
  - dashboard aging (open-payables-only) decreases by the paid amount

Root cause this guards: _base_invoice_filters hardcoded outstanding_amount > 0,
making it impossible for fully paid invoices (outstanding = 0) to appear in any tab.

Run:
  bench --site <site> execute \
    elmahdi.tests.run_ap_paid_tab_regression.execute
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt, today

from elmahdi.api.accounts_payable import (
    create_supplier_payment,
    get_ap_dashboard,
    list_ap_invoices,
)
from elmahdi.api.erp_submit import _gle_count
from elmahdi.tests.pos_stock_flow_audit import (
    audit_record,
    print_report,
    summarize_report,
)


# ---------------------------------------------------------------------------
# Resolvers
# ---------------------------------------------------------------------------

def _resolve_company(company=None):
    if company and frappe.db.exists("Company", company):
        return company
    row = frappe.db.get_value("Company", {}, "name")
    if not row:
        frappe.throw(_("No Company configured"), frappe.ValidationError)
    return row


def _resolve_supplier(supplier=None):
    if supplier and frappe.db.exists("Supplier", supplier):
        return supplier
    row = frappe.db.get_value("Supplier", {"disabled": 0}, "name")
    if not row:
        frappe.throw(_("No Supplier configured"), frappe.ValidationError)
    return row


def _resolve_cash_account(company):
    for account_type in ("Cash", "Bank"):
        acc = frappe.db.get_value(
            "Account",
            {"company": company, "is_group": 0, "account_type": account_type},
            "name",
        )
        if acc:
            return acc
    frappe.throw(
        _("No cash/bank account found for company {0}").format(company),
        frappe.ValidationError,
    )


def _resolve_service_item():
    """Find or create a non-stock service item safe for direct PI creation."""
    for item_code in ("AP-TEST-SERVICE-ITEM", ):
        if frappe.db.exists("Item", item_code):
            return item_code

    # Try any existing non-stock item first
    existing = frappe.db.get_value("Item", {"is_stock_item": 0, "disabled": 0}, "name")
    if existing:
        return existing

    # Create a minimal service item
    it = frappe.new_doc("Item")
    it.item_code = "AP-TEST-SERVICE-ITEM"
    it.item_name = "AP Regression Test Service Item"
    it.item_group = frappe.db.get_value("Item Group", {}, "name") or "Services"
    it.stock_uom = "Nos"
    it.is_stock_item = 0
    it.insert(ignore_permissions=True)
    frappe.db.commit()
    return it.name


def _resolve_expense_account(company):
    acc = frappe.db.get_value(
        "Account",
        {"company": company, "is_group": 0, "root_type": "Expense", "account_type": "Expense Account"},
        "name",
    )
    if acc:
        return acc
    # fallback: any expense leaf
    acc = frappe.db.get_value(
        "Account",
        {"company": company, "is_group": 0, "root_type": "Expense"},
        "name",
    )
    return acc


def _resolve_payable_account(company):
    acc = frappe.db.get_value(
        "Account",
        {"company": company, "is_group": 0, "account_type": "Payable"},
        "name",
    )
    return acc


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _step(report, row, stop_on_fail=True):
    report.append(row)
    if stop_on_fail and not row.get("pass"):
        raise frappe.ValidationError(row.get("message") or row.get("step"))


def _cancel_doc(doctype, name):
    if not name:
        return
    try:
        doc = frappe.get_doc(doctype, name)
        if doc.docstatus == 1:
            doc.cancel()
            frappe.db.commit()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def execute(supplier=None, company=None, stop_on_fail=1):
    """
    Run AP paid-tab regression.

    Leaves no permanent artifacts: PI and PE are cancelled in a finally block.
    """
    stop_on_fail = bool(int(stop_on_fail))
    frappe.set_user("Administrator")

    company = _resolve_company(company)
    supplier = _resolve_supplier(supplier)
    cash_account = _resolve_cash_account(company)
    item_code = _resolve_service_item()
    expense_account = _resolve_expense_account(company)
    payable_account = _resolve_payable_account(company)
    amount = 500.0

    report = []
    pi_name = None
    pe_name = None

    try:
        # ------------------------------------------------------------------ #
        # Step 01 — Create and submit a Purchase Invoice                      #
        # ------------------------------------------------------------------ #
        pi = frappe.new_doc("Purchase Invoice")
        pi.supplier = supplier
        pi.company = company
        pi.posting_date = today()
        pi.bill_date = today()
        pi.bill_no = f"AP-REG-{frappe.generate_hash('', 6).upper()}"
        pi.update_stock = 0
        if payable_account:
            pi.credit_to = payable_account
        pi.append(
            "items",
            {
                "item_code": item_code,
                "qty": 1,
                "rate": amount,
                "uom": "Nos",
                **({"expense_account": expense_account} if expense_account else {}),
            },
        )
        pi.insert(ignore_permissions=True)
        pi.submit()
        frappe.db.commit()
        pi_name = pi.name
        pi.reload()

        pi_submitted = pi.docstatus == 1
        _step(
            report,
            audit_record(
                step="01_purchase_invoice_submitted",
                passed=pi_submitted,
                document=pi_name,
                doctype="Purchase Invoice",
                gl_count=_gle_count("Purchase Invoice", pi_name),
                message=f"docstatus={pi.docstatus}, outstanding={flt(pi.outstanding_amount)}",
                root_cause=None if pi_submitted else "pi_submission_failed",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 02 — Invoice appears in unpaid tab                             #
        # ------------------------------------------------------------------ #
        unpaid_before = list_ap_invoices(company=company, supplier=supplier, status="unpaid")
        in_unpaid = any(r["name"] == pi_name for r in unpaid_before)
        _step(
            report,
            audit_record(
                step="02_invoice_in_unpaid_tab",
                passed=in_unpaid,
                document=pi_name,
                doctype="Purchase Invoice",
                message=f"Found in unpaid tab: {in_unpaid} (total unpaid rows: {len(unpaid_before)})",
                root_cause=None if in_unpaid else "ap_list_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 03 — Invoice NOT yet in paid tab                               #
        # ------------------------------------------------------------------ #
        paid_before = list_ap_invoices(company=company, supplier=supplier, status="paid")
        in_paid_before = any(r["name"] == pi_name for r in paid_before)
        _step(
            report,
            audit_record(
                step="03_invoice_not_in_paid_tab_before_payment",
                passed=not in_paid_before,
                document=pi_name,
                doctype="Purchase Invoice",
                message=f"Prematurely in paid tab: {in_paid_before}",
                root_cause=None if not in_paid_before else "ap_filter_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 04 — Dashboard aging includes the unpaid invoice               #
        # ------------------------------------------------------------------ #
        dashboard_before = get_ap_dashboard(company=company, supplier=supplier)
        aging_before = flt(dashboard_before.get("amounts", {}).get("total_outstanding", 0))
        pi_outstanding = flt(frappe.db.get_value("Purchase Invoice", pi_name, "outstanding_amount"))
        aging_covers = aging_before >= pi_outstanding - 0.01
        _step(
            report,
            audit_record(
                step="04_dashboard_aging_covers_unpaid_invoice",
                passed=aging_covers,
                document=pi_name,
                message=f"aging_total={aging_before}, pi_outstanding={pi_outstanding}",
                root_cause=None if aging_covers else "dashboard_aging_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 05 — Create and submit Payment Entry (full payment)            #
        # ------------------------------------------------------------------ #
        pe_result = create_supplier_payment(
            supplier=supplier,
            company=company,
            paid_from=cash_account,
            allocations=json.dumps([{"invoice": pi_name, "amount": pi_outstanding}]),
            submit=1,
        )
        pe_name = pe_result.get("name")
        out_after = flt(frappe.db.get_value("Purchase Invoice", pi_name, "outstanding_amount"))

        pe_ok = bool(pe_name) and out_after < 0.01
        _step(
            report,
            audit_record(
                step="05_payment_entry_submitted_outstanding_zero",
                passed=pe_ok,
                document=pe_name or "",
                doctype="Payment Entry",
                gl_count=_gle_count("Payment Entry", pe_name) if pe_name else 0,
                message=f"PE={pe_name}, outstanding_after={out_after}",
                root_cause=None if pe_ok else "payment_submission_failed",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 06 — Invoice disappears from unpaid tab                        #
        # ------------------------------------------------------------------ #
        unpaid_after = list_ap_invoices(company=company, supplier=supplier, status="unpaid")
        still_in_unpaid = any(r["name"] == pi_name for r in unpaid_after)
        _step(
            report,
            audit_record(
                step="06_invoice_leaves_unpaid_tab",
                passed=not still_in_unpaid,
                document=pi_name,
                message=f"Still in unpaid after full payment: {still_in_unpaid}",
                root_cause=None if not still_in_unpaid else "ap_filter_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 07 — Invoice appears in paid tab  (was the original bug)       #
        # ------------------------------------------------------------------ #
        paid_after = list_ap_invoices(company=company, supplier=supplier, status="paid")
        in_paid_after = any(r["name"] == pi_name for r in paid_after)
        _step(
            report,
            audit_record(
                step="07_invoice_appears_in_paid_tab",
                passed=in_paid_after,
                document=pi_name,
                message=f"Found in paid tab: {in_paid_after} (total paid rows: {len(paid_after)})",
                root_cause=None if in_paid_after else "ap_paid_tab_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 08 — Invoice appears in all tab                                #
        # ------------------------------------------------------------------ #
        all_after = list_ap_invoices(company=company, supplier=supplier, status="all")
        in_all = any(r["name"] == pi_name for r in all_after)
        _step(
            report,
            audit_record(
                step="08_invoice_appears_in_all_tab",
                passed=in_all,
                document=pi_name,
                message=f"Found in all tab: {in_all} (total rows: {len(all_after)})",
                root_cause=None if in_all else "ap_all_tab_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 09 — payment_status field is "paid" in the returned row        #
        # ------------------------------------------------------------------ #
        paid_row = next((r for r in all_after if r["name"] == pi_name), None)
        status_ok = paid_row is not None and paid_row.get("payment_status") == "paid"
        _step(
            report,
            audit_record(
                step="09_payment_status_classified_paid",
                passed=status_ok,
                document=pi_name,
                message=(
                    f"payment_status={paid_row.get('payment_status') if paid_row else 'row_missing'}, "
                    f"outstanding={paid_row.get('outstanding_amount') if paid_row else 'n/a'}, "
                    f"paid_pct={paid_row.get('paid_pct') if paid_row else 'n/a'}"
                ),
                root_cause=None if status_ok else "ap_status_classification_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

        # ------------------------------------------------------------------ #
        # Step 10 — Dashboard aging DECREASES (paid PI excluded from open)    #
        # ------------------------------------------------------------------ #
        dashboard_after = get_ap_dashboard(company=company, supplier=supplier)
        aging_after = flt(dashboard_after.get("amounts", {}).get("total_outstanding", 0))
        # Allow 1 cent tolerance for float rounding
        aging_decreased = aging_after <= aging_before - pi_outstanding + 0.01
        _step(
            report,
            audit_record(
                step="10_dashboard_aging_excludes_paid_invoice",
                passed=aging_decreased,
                document=pi_name,
                message=(
                    f"aging_before={aging_before}, aging_after={aging_after}, "
                    f"pi_outstanding={pi_outstanding}, delta={round(aging_before - aging_after, 2)}"
                ),
                root_cause=None if aging_decreased else "dashboard_aging_regression",
            ),
            stop_on_fail=stop_on_fail,
        )

    finally:
        # Cancel in reverse submission order so ERPNext restores outstanding
        _cancel_doc("Payment Entry", pe_name)
        _cancel_doc("Purchase Invoice", pi_name)

    summary = summarize_report(report)
    summary["config"] = {
        "company": company,
        "supplier": supplier,
        "pi": pi_name,
        "pe": pe_name,
        "amount": amount,
    }
    _print_ap_report(summary)

    if not summary.get("success"):
        frappe.throw(
            _("AP paid-tab regression failed: {0} step(s) failed").format(summary.get("failed")),
            frappe.ValidationError,
        )
    return summary


def _print_ap_report(summary: dict) -> None:
    print("\n" + "=" * 72)
    print("  ELMAHDI AP PAID-TAB REGRESSION — INTEGRITY REPORT")
    print("=" * 72)
    print(f"  Result: {'PASS' if summary.get('success') else 'FAIL'}")
    print(f"  Steps:  {summary.get('passed')}/{summary.get('total_steps')} passed")
    cfg = summary.get("config", {})
    print(f"  PI:     {cfg.get('pi', '—')}   PE: {cfg.get('pe', '—')}")
    print("-" * 72)
    for row in summary.get("steps") or []:
        status = "PASS" if row.get("pass") else "FAIL"
        print(f"  [{status}] {row.get('step')}")
        if row.get("message"):
            print(f"         {row.get('message')}")
    print("=" * 72 + "\n")

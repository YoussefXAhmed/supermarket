"""
permission_query_conditions — row-level scoping for the cashier role.

Frappe's DocPerm only answers "may this user read this doctype?" — it has
no concept of "owned-by-me". Without these conditions, a Cashier hitting
/api/resource/POS Invoice would get every cashier's invoices, which breaks
the audit trail and surfaces takings of other users.

Each function returns either:
  - "" (empty string) → no extra restriction
  - a SQL fragment to AND with the existing query, e.g. "`tabPOS Invoice`.owner = 'user@example.com'"

Frappe substitutes the table alias `tabDocType` and passes our string as-is
into the WHERE clause. We always escape the user with frappe.db.escape().
"""

from __future__ import annotations

import frappe

from elmahdi.api.spa_authorization import (
    is_break_glass_user,
    has_cap,
    user_role_profile,
    ROLE_PROFILE_CASHIER,
    ROLE_PROFILE_STORE_MANAGER,
)


# ── HR row-level scoping helpers ──────────────────────────────────────────
# Branch model = Warehouse. The Store Manager's "own branch" is the set of
# warehouses listed in their User Permission rows for the Warehouse doctype.

def _is_store_manager(user: str | None = None) -> bool:
    if is_break_glass_user(user):
        return False
    # HR Officer + Admin see all employees regardless of branch.
    if has_cap("can_manage_employees", user):
        return False
    return user_role_profile(user) == ROLE_PROFILE_STORE_MANAGER


def _user_warehouses(user: str | None = None) -> list[str]:
    """Warehouses the user is User-Permission-bound to. Empty list = no
    restriction (handled by caller — fall back to deny in that case)."""
    user = user or frappe.session.user
    rows = frappe.db.sql(
        """
        SELECT for_value FROM `tabUser Permission`
        WHERE user = %s AND allow = 'Warehouse'
        """,
        (user,),
        as_dict=True,
    )
    return [r.for_value for r in rows if r.for_value]


def _user_employee_id(user: str | None = None) -> str | None:
    """The Employee.name linked to this user, if any. Used to scope the
    self-service Salary Slip / Leave Application / Attendance datasets."""
    user = user or frappe.session.user
    return frappe.db.get_value("Employee", {"user_id": user}, "name")


def _employees_in_user_branches(user: str | None = None) -> list[str]:
    """Employee names whose `elmahdi_branch_warehouse` matches any
    warehouse the user is User-Permission-bound to. Empty list if the
    field isn't installed yet (Batch A.1 fixture may not have run)."""
    if not frappe.db.has_column("Employee", "elmahdi_branch_warehouse"):
        return []
    wh = _user_warehouses(user)
    if not wh:
        return []
    rows = frappe.db.sql_list(
        """
        SELECT name FROM `tabEmployee`
        WHERE elmahdi_branch_warehouse IN %(wh)s
        """,
        {"wh": wh},
    )
    return list(rows or [])


def _is_cashier(user: str | None = None) -> bool:
    """A user is a cashier when their role profile is Elmahdi Cashier AND
    they don't hold a higher-privilege cap (manager / accountant / admin)."""
    if is_break_glass_user(user):
        return False
    if has_cap("can_monitor_cashiers", user):
        return False  # store manager — full visibility
    if has_cap("can_view_supplier_payments", user):
        return False  # accountant
    return user_role_profile(user) == ROLE_PROFILE_CASHIER


def _own_only(doctype: str, user: str | None = None) -> str:
    user = user or frappe.session.user
    return f"`tab{doctype}`.owner = {frappe.db.escape(user)}"


def pos_invoice_pqc(user: str | None = None) -> str:
    return _own_only("POS Invoice", user) if _is_cashier(user) else ""


def pos_opening_pqc(user: str | None = None) -> str:
    return _own_only("POS Opening Entry", user) if _is_cashier(user) else ""


def pos_closing_pqc(user: str | None = None) -> str:
    return _own_only("POS Closing Entry", user) if _is_cashier(user) else ""


def sales_invoice_pqc(user: str | None = None) -> str:
    # Sales Invoices are usually consolidated from POS — cashiers should
    # only see their own (matches the POS Invoice scoping above).
    return _own_only("Sales Invoice", user) if _is_cashier(user) else ""


# ── Employee scoping ──────────────────────────────────────────────────────


def employee_pqc(user: str | None = None) -> str:
    """Store Manager sees only employees whose elmahdi_branch_warehouse
    matches one of their User-Permission warehouses. HR + Admin see all.

    Note: if the branch field isn't installed yet (custom-field fixture
    hasn't run), we deliberately return a fail-closed condition so the
    Store Manager sees NOTHING — better than leaking everyone's data.
    """
    if not _is_store_manager(user):
        return ""
    if not frappe.db.has_column("Employee", "elmahdi_branch_warehouse"):
        return "1=0"  # fail closed
    wh = _user_warehouses(user)
    if not wh:
        return "1=0"  # store manager with no warehouse → see nothing
    in_list = ", ".join(frappe.db.escape(w) for w in wh)
    return f"`tabEmployee`.elmahdi_branch_warehouse IN ({in_list})"


# ── Leave Application scoping ────────────────────────────────────────────


def leave_application_pqc(user: str | None = None) -> str:
    """
    HR + Admin: all leave applications.
    Store Manager: applications for own-branch employees.
    Everyone else: only own.
    """
    if is_break_glass_user(user) or has_cap("can_manage_employees", user):
        return ""
    if _is_store_manager(user):
        employees = _employees_in_user_branches(user)
        if not employees:
            return "1=0"
        in_list = ", ".join(frappe.db.escape(e) for e in employees)
        return f"`tabLeave Application`.employee IN ({in_list})"
    # Self-service: scope to the employee record linked to the user.
    emp = _user_employee_id(user)
    if not emp:
        return "1=0"
    return f"`tabLeave Application`.employee = {frappe.db.escape(emp)}"


# ── Salary Slip scoping ──────────────────────────────────────────────────


def salary_slip_pqc(user: str | None = None) -> str:
    """
    HR + Admin: all payslips.
    Store Manager: own-branch employees' payslips.
    Everyone else: only own.
    """
    if is_break_glass_user(user) or has_cap("can_manage_payroll", user):
        return ""
    if _is_store_manager(user):
        employees = _employees_in_user_branches(user)
        if not employees:
            return "1=0"
        in_list = ", ".join(frappe.db.escape(e) for e in employees)
        return f"`tabSalary Slip`.employee IN ({in_list})"
    emp = _user_employee_id(user)
    if not emp:
        return "1=0"
    return f"`tabSalary Slip`.employee = {frappe.db.escape(emp)}"


# ── Attendance scoping ───────────────────────────────────────────────────


def attendance_pqc(user: str | None = None) -> str:
    """
    HR + Admin: all attendance records.
    Store Manager: own-branch employees only.
    Everyone else: only own.
    """
    if is_break_glass_user(user) or has_cap("can_manage_attendance", user):
        return ""
    if _is_store_manager(user):
        employees = _employees_in_user_branches(user)
        if not employees:
            return "1=0"
        in_list = ", ".join(frappe.db.escape(e) for e in employees)
        return f"`tabAttendance`.employee IN ({in_list})"
    emp = _user_employee_id(user)
    if not emp:
        return "1=0"
    return f"`tabAttendance`.employee = {frappe.db.escape(emp)}"

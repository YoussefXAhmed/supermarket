# Backend Permission Audit — Elmahdi Custom API

**Date:** 2026-05-22  
**Scope:** `erp-custom/elmahdi/elmahdi/api/` — all whitelisted Frappe methods.  
**Methodology:** Static analysis of every `@frappe.whitelist()` endpoint for role checks, `frappe.has_permission()` calls, `frappe.flags.ignore_permissions` usage, input scope validation, and self-approval guards.  
**Approach:** Report-first; minimal safe fixes only; no workflow rewrites, no API contract changes.

---

## Summary Table

| # | Severity | Endpoint / File | Issue |
|---|----------|-----------------|-------|
| B-01 | 🔴 HIGH | `erp_submit.submit_document` | Generic submit accepts any DocType — no business-context guard |
| B-02 | 🔴 HIGH | `shifts.open_pos_shift` | POS profile and company are fully caller-supplied — no scope validation |
| B-03 | 🔴 HIGH | `purchasing.get_buying_rate_suggestions` | No permission check — leaks purchase pricing to any authenticated session |
| B-04 | 🟠 MEDIUM | `purchasing.create_purchase_receipt_workflow` | `ignore_permissions = True` set globally during auto-submit path |
| B-05 | 🟠 MEDIUM | `pos_closing_approval.approve_pos_closing_entry` | `doc.save(ignore_permissions=True)` bypasses ERPNext save hooks |
| B-06 | 🟠 MEDIUM | `shift_authorization.SHIFT_CLOSING_APPROVER_ERP_ROLES` | `Accounts User` (data-entry role) can approve shift closings |
| B-07 | 🟠 MEDIUM | `stock.*` — all stock-read endpoints | Warehouse parameter is caller-supplied; any Bin-read user can query any warehouse |
| B-08 | 🟠 MEDIUM | `invoice_matching.retry_auto_payable_for_receipt` | No role check — any Purchase Receipt reader can trigger PI creation/submit |
| B-09 | 🟡 LOW | `auth.get_session_identity` | `allow_guest=True` + full role list exposure |
| B-10 | 🟡 LOW | `shifts.prepare_closing_entry` | `actual_cash` and `payment_counts` are fully caller-supplied |
| B-11 | 🟡 LOW | `invoice_matching.create_purchase_invoice_from_receipt` | PI submit without explicit `has_permission("Purchase Invoice", "submit")` |

---

## B-01 — `submit_document` Accepts Any DocType Without Business Guards

**Severity:** 🔴 HIGH  
**File:** `erp-custom/elmahdi/elmahdi/api/erp_submit.py` (line 168–171)  
**Endpoint:** `elmahdi.api.erp_submit.submit_document`

### Code

```python
@frappe.whitelist()
def submit_document(name, doctype):
    """Generic native submit with side-effect verification."""
    return _submit_named(name, doctype)
```

`_submit_named` calls `native_submit` which calls:
```python
frappe.has_permission(doc.doctype, "submit", doc=doc, throw=True)
```

### Issue

The only check is ERPNext's standard DocType submit permission. There are **no additional Elmahdi-level guards**:
- No role check (`assert_may_act_as_pos_closing_approver`, etc.)
- No DocType allowlist — a caller can pass `doctype="Payment Entry"` or `doctype="GL Entry"`
- Any authenticated user who has `submit` permission on *any* DocType can submit *any* document of that type, including documents outside their intended operational scope

### Exploit Scenario

1. A cashier with `POS Invoice` submit permission calls `submit_document(name="POS-CLG-2024-00001", doctype="POS Closing Entry")`.
2. ERPNext checks if the cashier has submit on `POS Closing Entry`. If DocType permissions are misconfigured (e.g., `POS User` has submit on `POS Closing Entry`), the cashier bypasses the shift approval workflow entirely.
3. Alternatively: a purchasing officer who has `Purchase Invoice` submit permission calls `submit_document` to submit a purchase invoice that was not approved through the buying-rate audit.

### Recommended Fix

Add a DocType allowlist that restricts `submit_document` to non-sensitive document types, or remove the generic endpoint entirely and force callers to use the specific typed wrappers (`submit_stock_entry`, `submit_sales_invoice`, etc.):

```python
_GENERIC_SUBMIT_ALLOWLIST = frozenset({
    "Stock Entry",
    "Delivery Note",
})

@frappe.whitelist()
def submit_document(name, doctype):
    if doctype not in _GENERIC_SUBMIT_ALLOWLIST:
        frappe.throw(
            _("Use the specific submit endpoint for {0}.").format(doctype),
            frappe.PermissionError,
        )
    return _submit_named(name, doctype)
```

### Production Impact

High if ERPNext DocType permissions are ever misconfigured. The specific typed wrappers (`submit_pos_invoice`, `submit_purchase_receipt`, etc.) are fine — only the generic `submit_document` endpoint is the problem.

---

## B-02 — `open_pos_shift` Does Not Validate POS Profile Scope

**Severity:** 🔴 HIGH  
**File:** `erp-custom/elmahdi/elmahdi/api/shifts.py` (lines 45–95)  
**Endpoint:** `elmahdi.api.shifts.open_pos_shift`

### Code

```python
@frappe.whitelist()
def open_pos_shift(pos_profile, company, user=None, opening_amount=0, ...):
    frappe.has_permission("POS Opening Entry", "create", throw=True)
    # ... builds and submits opening entry with caller-supplied pos_profile and company
```

### Issue

The `pos_profile` and `company` parameters are accepted directly from the frontend with **no server-side validation** that:
1. The `pos_profile` is assigned to the calling user (via `POS Profile` → `Applicable for Users`)
2. The `company` matches the user's scope (User Default Company)
3. The `user` parameter (overridable by the caller) is the actual session user

A cashier can open a shift on **any** POS profile in the system by passing its name in the request.

### Exploit Scenario

1. Cashier A is assigned to `Main Store POS Profile` but wants to process sales under `Warehouse B POS Profile` (which has a different warehouse and price list).
2. Cashier A calls `open_pos_shift(pos_profile="Warehouse B POS Profile", company="ElmahdiCo")`.
3. A valid shift is opened with incorrect warehouse scope, allowing Cashier A to sell stock from Warehouse B.
4. Additionally, passing `user="another.cashier@company.com"` would open a shift attributed to a different user.

### Recommended Fix

Add server-side validation:

```python
@frappe.whitelist()
def open_pos_shift(pos_profile, company, user=None, opening_amount=0, ...):
    frappe.has_permission("POS Opening Entry", "create", throw=True)

    # Validate that the calling user is authorized for this POS profile
    session_user = frappe.session.user
    allowed_profiles = frappe.get_all(
        "POS Profile User",
        filters={"user": session_user, "parent": pos_profile},
        pluck="name",
    )
    # Break-glass: System Manager / Administrator skip scope check
    if not allowed_profiles and not is_break_glass_user():
        frappe.throw(
            _("You are not authorized for POS Profile {0}.").format(pos_profile),
            frappe.PermissionError,
        )

    # Block user parameter override (only admins may open on behalf of another user)
    if user and user != session_user and not is_break_glass_user():
        frappe.throw(
            _("You cannot open a shift on behalf of another user."),
            frappe.PermissionError,
        )
    # ...
```

### Production Impact

High. Without this check, any cashier can cross-warehouse-scope if they discover another POS profile name (visible via autocomplete or ERPNext desk access).

---

## B-03 — `get_buying_rate_suggestions` Has No Permission Check

**Severity:** 🔴 HIGH  
**File:** `erp-custom/elmahdi/elmahdi/api/purchasing.py` (lines 245–256)  
**Endpoint:** `elmahdi.api.purchasing.get_buying_rate_suggestions`

### Code

```python
@frappe.whitelist()
def get_buying_rate_suggestions(item_codes):
    # No frappe.has_permission() call
    out = {}
    for code in item_codes or []:
        expected = get_expected_buying_rate(code)
        out[code] = {"expected_rate": expected, "source": "item_price" if expected else "none"}
    return out
```

### Issue

This endpoint returns **the last purchase buying rate** for every item code passed. It uses:
- `Item Price` with `buying_price_map` (if `Item Price` read permission exists)
- Falls back to **the last submitted `Purchase Receipt Item` rate** via raw SQL

There is **no permission check** on the endpoint itself. Any authenticated ERPNext session (including a Guest session escalated via another vulnerability) can call this endpoint and enumerate all buying rates.

### Exploit Scenario

1. A cashier with only `POS Invoice` create permission calls:
   ```
   GET /api/method/elmahdi.api.purchasing.get_buying_rate_suggestions?item_codes=["PEPSI-500ML","COLA-250ML"]
   ```
2. The response reveals the last supplier buying rate for each item.
3. The cashier now knows the store's profit margins for every product.

### Recommended Fix

Add a minimum `Purchase Receipt` read check at the top of the function:

```python
@frappe.whitelist()
def get_buying_rate_suggestions(item_codes):
    frappe.has_permission("Purchase Receipt", "read", throw=True)
    # ...
```

This restricts the endpoint to users with purchasing read access (Purchasing Officers, Store Managers, Accountants) who are operationally expected to see buying rates.

### Production Impact

High for business confidentiality. Purchase margins are exposed to cashier and inventory clerk roles.

---

## B-04 — `ignore_permissions = True` Set Globally During Auto-Submit

**Severity:** 🟠 MEDIUM  
**File:** `erp-custom/elmahdi/elmahdi/api/purchasing.py` (lines 407–429, 604–615)  
**Endpoints:** `create_purchase_receipt_workflow`, `approve_purchase_receipt`

### Code

```python
frappe.flags.elmahdi_purchase_approval_submit = True
frappe.flags.ignore_permissions = True
try:
    doc.submit()
    doc.reload()
    assert_submitted_side_effects(doc)
    ...
finally:
    frappe.flags.elmahdi_purchase_approval_submit = False
    frappe.flags.ignore_permissions = False
```

### Issue

`frappe.flags.ignore_permissions = True` is a **global process flag** in Frappe. When set, it bypasses ALL DocType permission checks for any operation that runs within the same request context, not just the intended `doc.submit()`.

The `finally` block correctly resets the flag. However:
1. If `doc.submit()` triggers `on_submit` hooks that make other `frappe.get_doc()` / `frappe.get_all()` calls, those calls also execute without permission checks during the window.
2. The `auto_create_and_submit_purchase_invoice_for_receipt` call inside the `try` block (which creates and submits a Purchase Invoice) also runs with `ignore_permissions=True`.

### Exploit Scenario

If an attacker can inject a malicious `on_submit` hook (via a custom app or desk script) on `Purchase Receipt`, it would execute without permission checks when triggered by the approval flow.

### Recommended Fix

Scope the `ignore_permissions` flag more narrowly by using ERPNext's `frappe.set_user()` pattern with the Administrator user only for the submit operation, or use the document-specific bypass already available:

```python
# Preferred: set flag only around doc.submit(), not around the PI creation
frappe.flags.elmahdi_purchase_approval_submit = True
try:
    doc.submit()  # ignore_permissions needed only here
finally:
    frappe.flags.elmahdi_purchase_approval_submit = False

# Then call PI creation without ignore_permissions
auto_create_and_submit_purchase_invoice_for_receipt(doc.name, ignore_permissions=False)
```

Alternatively, document the pattern with a clear comment explaining that `ignore_permissions=True` is necessary because ERPNext's `before_submit` hook calls our `before_submit_purchase_receipt` guard (which would re-check approval and block), and the `elmahdi_purchase_approval_submit` flag is used to distinguish the approved path.

### Production Impact

Medium. The current `finally` block prevents the flag from leaking across requests. Risk is theoretical unless on_submit hooks are added.

---

## B-05 — `approve_pos_closing_entry` Uses `doc.save(ignore_permissions=True)`

**Severity:** 🟠 MEDIUM  
**File:** `erp-custom/elmahdi/elmahdi/api/pos_closing_approval.py` (lines 113–115)

### Code

```python
frappe.flags.elmahdi_pos_closing_skip_pending = True
try:
    doc.save(ignore_permissions=True)
finally:
    frappe.flags.elmahdi_pos_closing_skip_pending = False
```

### Issue

`doc.save(ignore_permissions=True)` bypasses ERPNext's standard save permission checks, including any `validate` hooks on `POS Closing Entry`. The flag is used to skip the custom `on_update` hook (which would re-set `pending_shift_approval=1`), but it also suppresses any future validate hooks added to the DocType.

The method does call `assert_may_act_as_pos_closing_approver()` and `assert_not_self_approval(doc)` before the save, so the authorization itself is correct. The issue is that save with `ignore_permissions=True` is broader than necessary.

### Recommended Fix

Use `frappe.flags.ignore_permissions = True` only for the specific window needed:
```python
# Save with only the skip_pending flag; rely on ERP permissions for the save itself
doc.save()  # or pass ignore_permissions=False explicitly
```

If ERPNext's save check raises a PermissionError for managers (because they don't have the `POS Closing Entry` write DocPerm), fix the DocType permission row to grant write to approver roles rather than bypassing the check globally.

### Production Impact

Medium. The authorization check before `save` is correct. Risk is that future `validate` hooks on `POS Closing Entry` would be bypassed by this save call.

---

## B-06 — `Accounts User` Can Approve Shift Closings

**Severity:** 🟠 MEDIUM  
**File:** `erp-custom/elmahdi/elmahdi/api/shift_authorization.py` (lines 20–30)

### Code

```python
SHIFT_CLOSING_APPROVER_ERP_ROLES = frozenset({
    "Store Manager",
    "POS Manager",
    "Accounts Manager",
    "Accounts User",   # ← data-entry role
    "Sales Manager",
    "Stock Manager",
    "Purchase Manager",
})
```

### Issue

`Accounts User` is a standard ERPNext role for accounts-data-entry clerks (AP/AR data entry). Including it in `SHIFT_CLOSING_APPROVER_ERP_ROLES` means any accounts clerk can:
- Call `approve_pos_closing_entry` on any POS Closing Entry they don't own
- Call `reject_pos_closing_entry` on any POS Closing Entry
- Call `list_pending_shift_closings` to see all pending closings

This is the backend enforcement of the same over-broad grant identified in the frontend audit (F-03). Unlike the frontend issue, this is the actual authorization gate.

### Exploit Scenario

An accounts-data-entry clerk (with `Accounts User` role) should only record AP transactions. If they are also the cashier (not permitted but possible in misconfiguration), they can:
1. Open shift as cashier
2. Close shift as "approver" (using Accounts User role)
3. Submit their own closing entry (self-approval is blocked separately, but if the clerk created the receipt as `owner` of a different closing, they could approve it)

### Recommended Fix

Remove `Accounts User` from `SHIFT_CLOSING_APPROVER_ERP_ROLES`:

```python
SHIFT_CLOSING_APPROVER_ERP_ROLES = frozenset({
    "Store Manager",
    "POS Manager",
    "Accounts Manager",   # senior accounting only
    "Sales Manager",
    "Stock Manager",
    "Purchase Manager",
})
```

Also remove the corresponding entry from `src/auth/capabilities.js` (frontend `SHIFT_APPROVE_ROLES`). Verify that the Elmahdi Accountant role profile maps to `Accounts Manager` (not `Accounts User`) before deploying.

### Production Impact

Medium. If the system has cashiers who also hold `Accounts User`, they gain self-approval of shift closings if they are not the `doc.owner`. The `assert_not_self_approval` guard only checks `doc.owner`, not `doc.user` (the POS operator field).

---

## B-07 — Warehouse Parameter in Stock Reads Is Fully Caller-Supplied

**Severity:** 🟠 MEDIUM  
**File:** `erp-custom/elmahdi/elmahdi/api/stock.py`  
**Endpoints:** `get_sellable_stock`, `get_sellable_stock_bulk`, `get_warehouse_stock`, `list_sellable_bins`, `get_pos_profile_stock`, `get_pos_profile_warehouse`

### Issue

All stock-read endpoints require only `frappe.has_permission("Bin", "read")` — a generic DocType-level permission. The `warehouse` parameter is accepted directly from the caller with no validation that the user is authorized to read stock for that specific warehouse.

If ERPNext User Permissions rows are correctly set (e.g., "Allow: Warehouse — for value: Main Store"), ERPNext's own ORM filtering would prevent unauthorized reads through standard `frappe.get_all()`. However, the code uses `frappe.db.get_value("Bin", {"item_code": ..., "warehouse": ...}, ...)` which **bypasses User Permission row filtering** by using a direct DB lookup.

### Exploit Scenario

1. Cashier A is scoped to `Main Store - Warehouse` via User Permissions.
2. Cashier A calls `get_warehouse_stock(warehouse="Back Office Warehouse")`.
3. `frappe.db.get_value("Bin", {"item_code": ..., "warehouse": "Back Office Warehouse"}, ...)` returns stock data directly without User Permission filtering.
4. Cashier A sees stock quantities for a warehouse they should not have access to.

### Recommended Fix

Add warehouse scope validation using `frappe.has_permission("Warehouse", "read", doc=warehouse_name)`:

```python
def _require_warehouse_read(warehouse: str) -> None:
    _require_stock_read()
    if not frappe.has_permission("Warehouse", "read", doc=warehouse):
        frappe.throw(
            _("You do not have permission to read stock for warehouse {0}.").format(warehouse),
            frappe.PermissionError,
        )
```

Call `_require_warehouse_read(warehouse)` in all single-warehouse endpoints before executing the query. For `list_sellable_bins` (no required warehouse), rely on ERPNext's ORM filtering which is respected by `frappe.get_all`.

### Production Impact

Medium. Requires User Permissions to be misconfigured for this to be a real leak (if Bin has User Permission filtering active). If User Permissions on Bin are not configured, any Bin-read user can enumerate all stock across all warehouses regardless of this fix.

---

## B-08 — `retry_auto_payable_for_receipt` Has No Role Check

**Severity:** 🟠 MEDIUM  
**File:** `erp-custom/elmahdi/elmahdi/api/invoice_matching.py` (lines 939–942)  
**Endpoint:** `elmahdi.api.invoice_matching.retry_auto_payable_for_receipt`

### Code

```python
@frappe.whitelist()
def retry_auto_payable_for_receipt(receipt_name):
    """Retry payable creation when auto-invoice failed after approval."""
    return auto_create_and_submit_purchase_invoice_for_receipt(receipt_name)
```

### Issue

This endpoint triggers `Purchase Invoice` creation and submission for a given receipt. The only check is `frappe.has_permission("Purchase Receipt", "read", throw=True)` inside the nested `_validate_receipt_for_matching`. 

Any user with `Purchase Receipt` read permission (including Inventory Clerks and Purchasing Officers who are not approvers) can trigger:
1. Creation of a `Purchase Invoice` from a receipt that was not yet approved
2. Submission of that `Purchase Invoice` (which creates GL entries creating a supplier payable)

The `auto_create_and_submit_purchase_invoice_for_receipt` function does check `pr.docstatus == 1` (receipt must be submitted), but does not check that the receipt went through the approval workflow.

### Exploit Scenario

1. Purchasing Officer creates a receipt with high variance (requires accountant approval).
2. Instead of waiting for approval, Purchasing Officer calls `retry_auto_payable_for_receipt(receipt_name)`.
3. A `Purchase Invoice` is created and submitted, bypassing the buying-rate approval gate.
4. Supplier payable is created in the GL without proper authorization.

### Recommended Fix

Add an approver role check:

```python
@frappe.whitelist()
def retry_auto_payable_for_receipt(receipt_name):
    # Only managers/accountants may retry payable creation
    if not (_can_approve_manager() or _can_approve_accountant() or _is_admin_user()):
        frappe.throw(
            _("You do not have permission to retry payable creation."),
            frappe.PermissionError,
        )
    return auto_create_and_submit_purchase_invoice_for_receipt(receipt_name)
```

Import the role-check helpers from `purchasing.py` or move them to a shared module.

### Production Impact

Medium. Requires that the receipt is already submitted (docstatus=1), which requires purchase approval first if variance was detected. However, if a receipt was submitted outside the workflow (e.g., directly via ERPNext desk), this endpoint would create a payable without any Elmahdi audit trail.

---

## B-09 — `get_session_identity` Returns Full Role List via `allow_guest=True`

**Severity:** 🟡 LOW  
**File:** `erp-custom/elmahdi/elmahdi/api/auth.py` (line 13)  
**Endpoint:** `elmahdi.api.auth.get_session_identity`

### Issue

```python
@frappe.whitelist(allow_guest=True)
def get_session_identity():
```

This is intentional design (the SPA needs to probe whether a session is active without getting a 403 for guests). However, for authenticated users it returns the **full role list** including all ERPNext roles assigned to the user. This is accessible via a simple GET to any script that holds a valid session cookie.

### Production Impact

Low — this is necessary for the SPA auth flow. The risk is that roles are enumerable by any script with a valid session (including XSS, if CSP is not set). Mitigation: ensure the Frappe site has a Content Security Policy set and session cookies have `HttpOnly` and `SameSite=Strict` (ERPNext default).

### No Code Change Required

Document that this is intentional. Add a comment in the file:
```python
# allow_guest=True required for SPA session probe — returns empty roles for Guest.
# For authenticated users, roles are returned deliberately to drive SPA capability derivation.
```

---

## B-10 — Closing Entry `actual_cash` Is Fully Frontend-Supplied

**Severity:** 🟡 LOW  
**File:** `erp-custom/elmahdi/elmahdi/api/shifts.py` (lines 268–346)  
**Endpoint:** `elmahdi.api.shifts.prepare_closing_entry`

### Issue

```python
def prepare_closing_entry(pos_opening_entry, actual_cash, notes=None, payment_counts=None):
    # ...
    actual_cash = flt(actual_cash)
    if actual_cash < 0:
        frappe.throw(...)
```

The `actual_cash` (counted cash) and `payment_counts` (counted amounts per mode) are taken directly from the frontend with only a non-negative validation. The closing entry stores these as `closing_amount` in `payment_reconciliation` rows.

There is no server-side check that `actual_cash` is within any reasonable range (e.g., not more than 10× the expected cash, which would indicate a typo or manipulation).

### Exploit Scenario

A cashier could submit a closing entry with `actual_cash = 999999` to make the variance appear positive (as if more cash was counted than expected), or `actual_cash = 0` to show a loss. The manager who approves the closing would need to manually detect this discrepancy via `variance_percent`.

### Production Impact

Low. The `variance_percent` is computed server-side and displayed to the approver. The approval workflow is designed to flag high-variance closings. This is a UX/fraud-detection gap rather than an authorization bypass.

### Recommended Fix

Add a sanity range check on `actual_cash`:
```python
max_cash = flt(summary.get("expected_cash")) * 5  # 500% tolerance
if max_cash > 0 and actual_cash > max_cash:
    frappe.throw(
        _("Counted cash {0} is unreasonably high (expected ~{1}). Verify and resubmit.").format(
            actual_cash, flt(summary.get("expected_cash"))
        ),
        frappe.ValidationError,
    )
```

---

## B-11 — `create_purchase_invoice_from_receipt` Submits PI Without Explicit Submit Permission Check

**Severity:** 🟡 LOW  
**File:** `erp-custom/elmahdi/elmahdi/api/invoice_matching.py` (lines 945–1007)

### Issue

```python
if cint(submit):
    pi.submit()  # no frappe.has_permission("Purchase Invoice", "submit", doc=pi, throw=True)
    pi.reload()
    assert_submitted_side_effects(pi)
```

The `frappe.has_permission("Purchase Invoice", "create", throw=True)` check covers the insert, but there is no explicit submit permission check before `pi.submit()`. ERPNext's `doc.submit()` internally calls `frappe.throw_permission_error()` if the user lacks submit permission (via the standard submit workflow), but this relies on ERPNext's internal behavior rather than an explicit Elmahdi-level check.

### Recommended Fix

Add an explicit check before submit:
```python
if cint(submit):
    frappe.has_permission("Purchase Invoice", "submit", doc=pi, throw=True)
    pi.submit()
```

### Production Impact

Low. ERPNext's `doc.submit()` already enforces the permission internally. This is a defense-in-depth improvement.

---

## Positive Findings — What Is Well-Implemented

The following patterns are correctly implemented and should be preserved:

| Pattern | Location |
|---------|----------|
| `assert_may_act_as_pos_closing_approver()` before every closing action | `pos_closing_approval.py` |
| `assert_not_self_approval(doc)` on both approve and reject paths | `pos_closing_approval.py`, `purchasing.py` |
| `frappe.has_permission("POS Invoice", "create", throw=True)` before checkout | `pos_checkout.py` |
| `frappe.has_permission("Payment Entry", "create/submit", ...)` before payment | `accounts_payable.py` |
| `frappe.has_permission("POS Opening Entry", "submit", ...)` before submission | `shifts.py` |
| `before_submit_pos_closing` hook blocks cashier REST submit | `pos_closing_approval.py` |
| `before_submit_purchase_receipt` hook blocks unapproved high-variance receipts | `purchasing.py` |
| `assert_submitted_side_effects()` after every submit (SLE/GL verification) | `erp_submit.py` |
| Supplier and company cross-validation in payment allocations | `accounts_payable._validate_allocations` |
| `_is_purchasing_only_user()` prevents auto-submit for purchasing-only role | `purchasing.py` |

---

## Action Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 (Do now) | B-03: Add `has_permission("Purchase Receipt", "read")` to `get_buying_rate_suggestions` | ~2 min |
| 2 (Do now) | B-01: Add DocType allowlist to `submit_document` or remove the generic endpoint | ~10 min |
| 3 (Soon) | B-06: Remove `Accounts User` from `SHIFT_CLOSING_APPROVER_ERP_ROLES` (after frontend F-03 fix) | ~3 min |
| 4 (Soon) | B-08: Add role check to `retry_auto_payable_for_receipt` | ~5 min |
| 5 (Soon) | B-02: Add POS profile scope validation in `open_pos_shift` | ~20 min |
| 6 (Backlog) | B-07: Add warehouse-level permission check to stock-read endpoints | ~30 min |
| 7 (Backlog) | B-04: Narrow `ignore_permissions` scope in approval submit paths | ~30 min |
| 8 (Optional) | B-05, B-10, B-11: Targeted hardening improvements | ~30 min |

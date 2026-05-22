# POS Profile Authorization

**Implemented:** 2026-05-22  
**Module:** `erp-custom/elmahdi/elmahdi/api/pos_profile_auth.py`  
**Status:** Production-ready, fail-closed.

---

## Why This Exists

Before this change, any authenticated cashier could open a shift or submit an
invoice on **any** POS Profile in the system by passing its name in the API
payload.  A cashier at Branch A could:

- Open a shift on Branch B's POS Profile
- Sell stock from Branch B's warehouse
- Submit invoices under a profile they were not assigned to

This was identified in **BACKEND_PERMISSION_AUDIT.md — Finding B-02**.

---

## Policy

| Scenario | Access |
|----------|--------|
| POS Profile has no `applicable_for_users` rows | All authenticated POS users may use it (open profile) |
| POS Profile has `applicable_for_users` rows | Only listed users may use it |
| User is System Manager or Administrator | Bypass — always allowed (break-glass) |
| User is Store Manager, POS Manager, or Sales Manager | Bypass — supervisory access |
| User is `Guest` | Always denied |
| Profile does not exist | `ValidationError` — fail closed |
| Warehouse in payload ≠ Profile warehouse | `PermissionError` — payload spoofing blocked |

### ERPNext Convention

ERPNext's own `POS Profile` DocType has an `applicable_for_users` child table.
When this table is **empty**, ERPNext treats the profile as available to all
users with the correct role — this module respects the same convention.

---

## Architecture

### Single Source of Truth

All POS authorization logic lives in one file:

```
erp-custom/elmahdi/elmahdi/api/pos_profile_auth.py
```

No other file implements profile user checks. Every endpoint imports and calls
the functions from this module.

### Public Functions

#### `assert_user_authorized_for_pos_profile(pos_profile, user=None)`

The primary guard.  Raises:
- `frappe.ValidationError` — if `pos_profile` is blank or does not exist
- `frappe.PermissionError` — if the user is not authorized for the profile

Call this **early** in every endpoint that accepts a `pos_profile` from the
client, before any document is built or inserted.

#### `assert_invoice_warehouse_matches_profile(pos_profile, declared_warehouse)`

Secondary guard for checkout payloads.  Raises `frappe.PermissionError` if
the warehouse declared in the client payload does not match the POS Profile's
configured warehouse. Managers and break-glass users bypass this check.

#### `is_user_authorized_for_pos_profile(pos_profile, user=None) -> bool`

Pure predicate — returns `True`/`False`, never raises.  Used in tests and
anywhere a boolean check is needed without interrupting the flow.

---

## Protected Endpoints

| Endpoint | File | Guard applied |
|----------|------|--------------|
| `elmahdi.api.shifts.open_pos_shift` | `shifts.py` | Profile auth + user-override block |
| `elmahdi.api.pos_checkout.create_and_submit_pos_invoice` | `pos_checkout.py` | Profile auth + warehouse match |
| `elmahdi.api.pos_checkout.submit_pos_invoice` | `pos_checkout.py` | Profile auth (from persisted doc) |
| `elmahdi.api.stock.get_pos_profile_stock` | `stock.py` | Profile auth |
| `elmahdi.api.stock.get_pos_profile_warehouse` | `stock.py` | Profile auth |

---

## Call-Site Detail

### `shifts.open_pos_shift`

```python
frappe.has_permission("POS Opening Entry", "create", throw=True)
assert_user_authorized_for_pos_profile(pos_profile)           # ← NEW

# Block cashiers from opening a shift on behalf of another user
if user and user != session_user and not is_break_glass_user():
    frappe.throw(...)                                          # ← NEW
```

### `pos_checkout._build_pos_invoice` (called by `create_and_submit_pos_invoice`)

```python
# After required-field validation, before document construction:
assert_user_authorized_for_pos_profile(pos_profile)           # ← NEW
assert_invoice_warehouse_matches_profile(pos_profile, warehouse)  # ← NEW
```

### `pos_checkout.submit_pos_invoice` (retry path)

```python
if doc.pos_profile:
    assert_user_authorized_for_pos_profile(doc.pos_profile)   # ← NEW
```

### `stock.get_pos_profile_stock` / `get_pos_profile_warehouse`

```python
assert_user_authorized_for_pos_profile(pos_profile)           # ← NEW
```

---

## Override Roles

Managers and administrators bypass the `applicable_for_users` check and the
warehouse-match check.  This allows:

- **Store Manager / POS Manager**: Monitor any till, recover from stuck shifts,
  view stock for any profile.
- **System Manager / Administrator**: Full break-glass access.

Override roles are defined in `pos_profile_auth._MANAGER_OVERRIDE_ROLES`:

```python
_MANAGER_OVERRIDE_ROLES = frozenset({
    "Administrator",
    "System Manager",
    "Store Manager",
    "POS Manager",
    "Sales Manager",
})
```

To add or remove override roles, edit this set.  No other code needs to change.

---

## Tests

Test file: `erp-custom/elmahdi/elmahdi/tests/test_pos_profile_auth.py`

### Test classes

| Class | What it covers |
|-------|---------------|
| `TestIsUserAuthorized` | Pure predicate — authorized, unauthorized, open, manager, guest, non-existent profile |
| `TestAssertUserAuthorized` | Exception variant — correct exceptions for each failure mode |
| `TestWarehouseMatchesProfile` | Warehouse spoofing blocked; manager bypass; blank warehouse skipped |
| `TestOpenProfile` | Any POS user may use a profile with no user list |
| `TestMultiUserProfile` | Multiple listed users; unlisted user denied |
| `TestAdministratorOverride` | System Manager bypasses user-list restriction |

### Running tests

```bash
# Full suite via bench
bench run-tests --app elmahdi --module elmahdi.tests.test_pos_profile_auth

# Or via bench console
bench execute elmahdi.tests.test_pos_profile_auth.run_all
```

---

## ERPNext Configuration (Production Setup)

### Step 1 — Open profiles

Leave `applicable_for_users` empty on a POS Profile to allow any authorized
POS user to use it.  This is the default for single-branch deployments.

### Step 2 — Restricted profiles (multi-branch)

For each branch POS Profile:

1. Go to **POS Profile → [Profile Name]**
2. Under **Applicable for Users**, add each cashier who should use this profile
3. Save

After saving, any cashier not in the list will receive a `PermissionError`
when attempting to open a shift or submit an invoice under this profile.

### Step 3 — Verify warehouse is set

Each POS Profile must have a **Warehouse** set.  If the warehouse field is
empty, the warehouse-match check is skipped (the profile itself is misconfigured
and ERPNext will reject documents at submit time anyway).

---

## What Is NOT Changed

This implementation intentionally does not touch:

- POS Invoice accounting entries or GL logic
- Stock Ledger Entry generation
- Payment Entry workflows
- Shift approval or closing workflows
- The `native_submit` / `assert_submitted_side_effects` pipeline
- Any frontend component or API contract

The only behavioral change is that unauthorized API calls to the protected
endpoints now return HTTP 417 / `PermissionError` instead of succeeding.

---

## Error Messages (as seen by the cashier)

| Situation | Error |
|-----------|-------|
| Not in user list | "You are not authorized to use POS Profile {name}. Contact your store manager to be added to this profile." |
| Wrong warehouse in payload | "Warehouse {wh} does not match POS Profile {name} (expected {profile_wh}). Do not modify the warehouse field." |
| Profile does not exist | "POS Profile {name} does not exist." |
| Blank profile | "POS Profile is required." |
| Guest | "You must be logged in to use POS." |
| Opening shift on behalf of another user | "You cannot open a shift on behalf of another user." |

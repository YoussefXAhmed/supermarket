# POS Shift — ERP Permission Matrix & Desk Setup

**Principle:** ERPNext is authoritative. The SPA only calls APIs the user’s role is allowed to run. Cashiers must **not** receive Submit on POS Closing Entry.

**Related:** `docs/SHIFT_PERMISSION_MODEL.md` (policy summary), `docs/ERP_PERMISSION_ALIGNMENT.md`, `docs/SHIFT_CAPABILITY_MATRIX.md`

---

## 1. Root cause of current 403

| Symptom | Typical cause |
|---------|----------------|
| 403 on **create** POS Closing Entry | Role lacks **Create** and/or **Write** on `POS Closing Entry` |
| 403 on **submit** (`PUT docstatus: 1`) | Role lacks **Submit** — **expected for cashier**; SPA must not call submit |
| UI shows “session expired” on 403 | Was mapping all 403 → auth message — **fixed** in `errorHandling.js` |
| `prepare_closing_entry` worked in dev only | Previously used `ignore_permissions=True` — **removed**; uses normal `insert()` |

---

## 2. Final permission matrix

Legend: **R** Read · **W** Write · **C** Create · **S** Submit · **X** Cancel · **—** Deny

### POS Opening Entry

| Permission | POS User (Cashier) | Store Manager | Administrator |
|------------|-------------------|---------------|---------------|
| Select | ✅ | ✅ | ✅ |
| Read | ✅ | ✅ | ✅ |
| Write | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ | ✅ |
| Submit | ✅ | ✅ | ✅ |
| Cancel | — | ✅ | ✅ |
| Delete | — | — | ✅ |
| Amend | — | — | ✅ |

**Cashier behavior:** Open shift = Create + Submit opening (submitted entry, status Open).

**Optional:** Role Permission → **If creator** / User Permission so cashier only sees own openings.

---

### POS Closing Entry

| Permission | POS User (Cashier) | Store Manager | Administrator |
|------------|-------------------|---------------|---------------|
| Select | ✅ | ✅ | ✅ |
| Read | ✅ | ✅ | ✅ |
| Write | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ | ✅ |
| Submit | **—** | **✅** | **✅** |
| Cancel | **—** | ✅ | ✅ |
| Delete | **—** | — | ✅ |
| Amend | — | — | ✅ |

**Cashier behavior:** Close shift = Create/update **draft** (`docstatus = 0`) only. **Never Submit.**

**Store Manager behavior:** Submit (and optionally Cancel) draft closings from `/shifts/history` approval flow.

**Dangerous for cashier:** Submit, Cancel, Delete on POS Closing Entry (bypasses manager control).

---

### POS Invoice (POS sales)

| Permission | POS User | Store Manager | Administrator |
|------------|----------|---------------|---------------|
| Read | ✅ | ✅ | ✅ |
| Write | ✅ | — | ✅ |
| Create | ✅ | — | ✅ |
| Submit | ✅ | — | ✅ |
| Cancel | — | ✅ | ✅ |

Align with existing POS Profile / warehouse User Permissions.

**Child table:** `Sales Invoice Payment` — readable via parent; no separate grant usually needed.

---

### Supporting DocTypes (cashier minimum)

| DocType | Cashier | Notes |
|---------|---------|--------|
| Item | Read | Catalog search |
| Item Price | Read | Price list on profile |
| Bin | Read | Stock on POS warehouse |
| Customer | Read | Walk-in / select |
| Mode of Payment | Read | Tender types |
| POS Profile | Read | Register config |
| Company | Read | Legal entity |

**Deny for cashier:** User (write), Stock Entry, Purchase Receipt/Invoice, Item Price (write).

---

### Elmahdi API methods (whitelist + role)

| Method | Cashier | Manager | Notes |
|--------|---------|---------|-------|
| `elmahdi.api.shifts.get_shift_summary` | ✅* | ✅ | *Session gate: opening `user`/`owner`, approver profile/role, or break-glass; plus Read on opening |
| `elmahdi.api.shifts.prepare_closing_entry` | ✅* | ✅ | *Same session gate + Create on POS Closing Entry |
| `elmahdi.api.pos_closing_approval.approve_pos_closing_entry` | — | ✅ | Finalize: audit fields + controlled submit |
| `elmahdi.api.pos_closing_approval.reject_pos_closing_entry` | — | ✅ | Keeps draft; records rejection |
| `elmahdi.api.pos_closing_approval.list_pending_shift_closings` | — | ✅ | Approver queue |

Configure via **Role** access to whitelisted methods (Frappe v15: role must be able to execute; document perms still apply on `insert()`).

---

## 3. SPA capability ↔ ERP alignment

| SPA capability | ERP expectation |
|----------------|-----------------|
| `canOpenShift` | Opening Entry: C, W, S |
| `canCloseShift` | Closing Entry: C, W (draft only) — **no S** |
| `canApproveShift` | Closing Entry: S (+ R, W) |
| `canViewShiftReports` | Closing/Opening: R |

**Frontend rules (implemented):**

- **Never** use REST `PUT …/POS Closing Entry/… { docstatus: 1 }` for cashier finalize. Managers use `approvePOSClosingEntryOnServer` → `elmahdi.api.pos_closing_approval.approve_pos_closing_entry`.
- `closeShift({ canSubmitClosing })` when the manager may auto-finalize calls **`approve_pos_closing_entry`** (not raw REST submit).
- Cashiers always end with draft closing until an approver runs approve (or manager path above).
- Large variance → draft until explicit approve action.

---

## 4. Role Permission Manager vs User Permissions vs Role Profiles

| Mechanism | Use for shift workflow |
|-----------|------------------------|
| **Role Permission Manager** | **Primary.** Grant DocType-level R/W/C/S per role (tables above). |
| **Role Profile** | **Assign personas.** e.g. Role Profile “Elmahdi Cashier” = role `POS User` + custom roles; assign profile on User. |
| **User Permissions** | **Scope data.** Restrict Warehouse, Company, Price List — not a substitute for DocType Submit. |
| **Field-level permissions** | Keep `remarks` read restricted for cashiers; SPA does not query `remarks` on lists (see UI_STABILIZATION / shift API split). |

**Do not** fix 403 by granting System Manager to cashiers.

**Do not** use `ignore_permissions` on production whitelisted methods (removed from `prepare_closing_entry`).

---

## 5. Step-by-step ERPNext Desk setup

### A. Role: POS User (cashier base)

1. **Setup → Users and Permissions → Role** → open **POS User** (or duplicate to **Elmahdi POS User**).
2. **Setup → Users and Permissions → Role Permission Manager**
3. Add / verify row **Document Type = POS Opening Entry**  
   - Level 0: Read, Write, Create, **Submit** = Yes  
   - Cancel, Delete = No
4. Add / verify row **Document Type = POS Closing Entry**  
   - Level 0: Read, Write, Create = Yes  
   - **Submit, Cancel, Delete = No**
5. Verify **POS Invoice** (or Sales Invoice if site uses it for POS): Read, Write, Create, Submit = Yes.
6. **Save**

### B. Role: Store Manager (custom)

1. Create role **Elmahdi Store Manager** (if not exists).
2. Role Permission Manager:
   - **POS Closing Entry:** Read, Write, Create, **Submit**, **Cancel** = Yes
   - **POS Opening Entry:** Read, Submit (optional Cancel for corrections)
   - Read-only on reports as needed (Sales Invoice read, etc.)
3. Do **not** assign System Manager.

### C. Role Profile

1. **Setup → Users and Permissions → Role Profile**
2. **Elmahdi Cashier** → roles: `POS User` (+ any custom read-only roles)
3. **Elmahdi Store Manager** → roles: `Elmahdi Store Manager`, `POS User` (optional read POS), stock/report roles as needed
4. **User → Role Profile** = one profile per user (not mixed ad-hoc roles).

### D. User Permissions (recommended)

1. **Setup → Users and Permissions → User Permissions**
2. Per cashier user:
   - **Allow** Warehouse = store warehouse
   - **Allow** Company = default company
   - **Allow** Price List = POS profile price list (if used)
3. Repeat for managers with broader warehouse access if multi-store.

### E. POS Profile

1. **Retail → POS → POS Profile** → assign profile to cashier users (User field on profile or allowed users list per your ERP version).
2. Confirm warehouse, company, payment modes, selling price list.

### F. Elmahdi app

```bash
cd frappe-bench
bench --site <site> install-app elmahdi   # if not installed
bench --site <site> migrate
bench restart
```

Ensure `elmahdi` is in `sites/apps.txt`. Whitelist is automatic via `@frappe.whitelist()`.

---

## 6. Verification checklist

Run as **three test users** (cashier, manager, admin):

### Cashier

- [ ] Login → `/pos` loads
- [ ] **Open shift** → POS Opening Entry submitted, no 403
- [ ] Sell → POS Invoice submitted
- [ ] **Close shift** → POS Closing Entry **draft** created (docstatus 0), **no 403**
- [ ] UI message: manager must submit (not “session expired”)
- [ ] Network tab: **no** `PUT ... POS Closing Entry/...` with `{ docstatus: 1 }`
- [ ] Cannot submit closing from Desk (Submit button hidden/disabled)

### Store Manager

- [ ] `/shifts/history` loads pending drafts
- [ ] **Approve & submit** closing → docstatus 1, no 403
- [ ] Cannot approve own shift if same user (SPA validation)

### Administrator

- [ ] Full Desk access to Opening/Closing entries
- [ ] Submit/cancel/amend as policy allows

### Negative tests

- [ ] Cashier API submit closing → ERP returns 403 PermissionError
- [ ] SPA shows permission message, not session expired
- [ ] Removing Create on Closing Entry → cashier close fails with clear permission error

---

## 7. Dangerous grants (never on cashier)

| Grant | Risk |
|-------|------|
| Submit on POS Closing Entry | Cashier closes books without oversight |
| Cancel / Delete on POS Closing Entry | Hides variances / fraud |
| System Manager | Full ERP access |
| `ignore_permissions` on custom APIs | Bypasses audit |
| Write on Item Price / Price List | Pricing fraud |
| Write on User | Account takeover |

---

## 8. Production-safe recommendation

1. **Correct ERP matrix first** (Closing Entry: cashier **no Submit**).
2. **Role Profile per persona** — no bare System Manager on floor staff.
3. **User Permissions** for warehouse/company/price list.
4. **Keep SPA fail-closed:** cashiers draft-only close; managers submit via `canApproveShift`.
5. **Train managers** on `/shifts/history` daily approval queue.
6. **Monitor** ERP Error Log for PermissionError on closing during UAT.

After ERP alignment, re-test with browser devtools: cashier close should show only `POST`/`GET` on Closing Entry, never submit `PUT` unless testing manager account.

---

## 9. Screenshot / navigation paths (Desk)

| Task | Path |
|------|------|
| Role permissions | **Setup → Users and Permissions → Role Permission Manager** |
| Edit role | **Setup → Users and Permissions → Role** |
| Role profiles | **Setup → Users and Permissions → Role Profile** |
| User assignment | **Setup → Users and Permissions → User** → Role Profile field |
| User Permissions | **Setup → Users and Permissions → User Permissions** |
| POS Opening Entry list | **Retail → POS → POS Opening Entry** |
| POS Closing Entry list | **Retail → POS → POS Closing Entry** |
| Error log | **Setup → Logs → Error Log** (filter PermissionError) |

---

## 10. Changelog (SPA alignment)

| File | Change |
|------|--------|
| `shiftsService.js` | Submit only when `canSubmitClosing` (manager) |
| `ShiftClosePage.jsx` | Passes `canApproveShift` as `canSubmitClosing` |
| `errorHandling.js` | 403 PermissionError ≠ session expired |
| `elmahdi/api/shifts.py` | `insert()` respects permissions |

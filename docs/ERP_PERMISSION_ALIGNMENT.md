# ERPNext Permission Alignment

**Audit date:** May 2026  
**Principle:** The SPA is a thin client. **Production safety requires ERPNext Role Profiles, User Permissions, and DocType permissions** to match SPA routes. Never rely on UI hiding alone.

---

## SPA ↔ ERP responsibility split

| Concern | SPA | ERPNext |
|---------|-----|---------|
| Login session | Cookie via `/api/method/login` | Frappe auth |
| Route access | `ProtectedRoute` buckets | — |
| List field errors | Explicit `fields` arrays | Permitted fields per role |
| Submit documents | `PUT docstatus: 1` | Workflow, permissions, validation |
| Warehouse scope | Not enforced | User Permissions on Warehouse |
| Price on POS | Sends `rate` in payload | Price List, POS Profile, validate rate |
| User lifecycle | create/disable/delete API | User DocType permissions |
| Audit trail | localStorage + optional Activity Log | Version, Activity Log, Comment |

---

## Recommended ERPNext role profiles (production)

Create **Role Profiles** (not bare roles) for each operational persona:

| Role profile name | Based on | Assign to |
|-------------------|----------|-----------|
| **Elmahdi Administrator** | System Manager (trimmed) | IT lead only |
| **Elmahdi Cashier** | POS User | Register staff |
| **Elmahdi Inventory Clerk** | Stock User | Warehouse staff |
| **Elmahdi Purchasing Officer** | Purchase User | Buyers |
| **Elmahdi Store Manager** | Custom mix | Store lead |

Avoid assigning raw `System Manager` to store staff.

---

## DocType permission matrix (ERPNext Desk)

Minimum permissions per target role (R=read, W=write, C=create, S=submit, Cancel, Amend):

### Cashier — Elmahdi Cashier

| DocType | R | W | C | S | Notes |
|---------|---|---|---|---|-------|
| Sales Invoice / POS Invoice | ✅ | ✅ | ✅ | ✅ | POS Profile linked |
| POS Opening Entry | ✅ | ✅ | ✅ | ✅ | Submit required to open shift |
| POS Closing Entry | ✅ | ✅ | ✅ | — | **Draft only** — no Submit/Cancel/Delete |
| Item | ✅ | — | — | — | For search |
| Item Price | ✅ | — | — | — | POS price list only* |
| Bin | ✅ | — | — | — | POS warehouse* |
| Customer | ✅ | — | — | — | Walk-in / select |
| User | — | — | — | — | **Deny** |
| Stock Entry | — | — | — | — | **Deny** |
| Purchase Receipt/Invoice | — | — | — | — | **Deny** |
| Item Price (write) | — | — | — | — | **Pricing protection** |

\* Use **User Permission** rules: Warehouse = store warehouse; Price List = POS profile list.

### Inventory Clerk — Elmahdi Inventory Clerk

| DocType | R | W | C | S |
|---------|---|---|---|---|
| Stock Entry | ✅ | ✅ | ✅ | ✅ |
| Stock Reconciliation | ✅ | — | — | — |
| Bin | ✅ | — | — | — |
| Item | ✅ | — | — | — |
| Warehouse | ✅ | — | — | — |
| Stock Ledger Entry | ✅ | — | — | — |
| Sales Invoice | — | — | — | — |
| Purchase Receipt | — | — | — | — |
| Item Price | — | — | — | — |
| User | — | — | — | — |

**User Permissions:** Warehouse ∈ {assigned stores}.  
**Reconciliation:** Enable only on **Store Manager** profile or via workflow.

### Purchasing Officer — Elmahdi Purchasing Officer

| DocType | R | W | C | S |
|---------|---|---|---|---|
| Supplier | ✅ | ✅ | ✅ | — |
| Purchase Receipt | ✅ | ✅ | ✅ | ✅ |
| Purchase Invoice | ✅ | ✅ | ✅ | ✅ |
| Purchase Invoice Item | ✅ | — | — | — |
| Item | ✅ | — | — | — |
| Bin | ✅ | — | — | — |
| Stock Entry | — | — | — | — |
| User | — | — | — | — |
| Sales Invoice | — | — | — | — |

**Critical:** Grant read on **Purchase Invoice Item** child (matching page).  
**Never** add `purchase_invoice` to Purchase Receipt list fields (SPA already avoids — see `purchasingQueryUtils.js`).

### Store Manager — Elmahdi Store Manager

| DocType | R | W | C | S |
|---------|---|---|---|---|
| Sales Invoice | ✅ | — | — | — |
| Customer | ✅ | — | — | — |
| Stock Entry | ✅ | — | — | — |
| Stock Reconciliation | ✅ | ✅ | ✅ | ✅ |
| Purchase Receipt/Invoice | ✅ | — | — | — |
| Bin, Item, Warehouse | ✅ | — | — | — |
| User | — | — | — | — |
| Item Price | ✅ | — | — | — |

Optional: **Approve** workflow on Reconciliation and high-value PI.

### Administrator — Elmahdi Administrator

Full operational access except:

- Prefer **disable** users over delete
- Separate production company
- 2FA on privileged accounts (ERP setting)

---

## User Permissions (warehouse & pricing protection)

| Rule type | Apply to | Purpose |
|-----------|----------|---------|
| Warehouse | Cashier, Inventory Clerk | Scope stock visibility |
| Price List | Cashier | POS prices only |
| Company | All store roles | Single legal entity |
| Branch (if used) | Multi-store future | — |

**SPA gap:** Load allowed warehouses from ERP (`User Permission` query or bootinfo) and filter pickers — not implemented.

---

## POS Profile alignment

Per store register:

| Setting | Requirement |
|---------|-------------|
| Warehouse | Store floor / main stock |
| Selling Price List | Standard retail list |
| Company | Default company |
| Payment methods | Cash, Card mapped to accounts |
| User restriction | Profile assigned to cashier users only |

**SPA:** `resolveActivePOSProfile`, `set_warehouse` on checkout — matches ERP.

---

## Known SPA / ERP inconsistencies

| Issue | SPA behavior | ERP fix |
|-------|--------------|---------|
| Purchase roles no SPA path | Need System Manager to open app | Add `requirePurchasing` + ERP profile without System Manager |
| User roles unreadable | Username inference | Grant read on own User doc or use `get_roles` API |
| Matching empty | Child table query fails | PI Item read permission |
| Dashboard profit KPI | Estimated margin | Label in UI; use GL for managers |
| Activity log | localStorage | ERP Activity Log read for managers |
| `createUser` without roles | Incomplete users | Mandatory Role Profile in ERP + UI |
| Admin on POS nav | Blocked route | Hide link or allow supervised POS |

---

## Approval workflows (ERP-side, recommended)

| Document | Suggested workflow | Clerk | Manager |
|----------|-------------------|-------|---------|
| Stock Reconciliation | Draft → Manager approve → Submit | Create draft | Approve |
| Purchase Invoice > X EGP | Draft → Manager approve | Create | Approve |
| Material Issue (shrinkage) | Optional approve | Submit | — |
| Sales return | Return Invoice in Desk | — | Manager |

**SPA:** No workflow UI today — documents submit immediately. Clerks should not have Submit on Reconciliation.

---

## Field-level / API alignment checklist

- [ ] Cashier: no `PUT` on Item Price, Price List, Item.standard_rate
- [ ] Cashier: Sales Invoice `rate` validated against Item Price
- [ ] Inventory: Stock Entry allowed warehouses only
- [ ] Purchasing: PR/PI submit; no User write
- [ ] All roles: explicit list `fields` on customized v15 sites (SPA pattern)
- [ ] Purchase Receipt list: `per_billed` only — not `purchase_invoice` on parent list
- [ ] HTTPS + CORS + cookie domain (see `PRODUCTION_READINESS.md`)

---

## Role name mapping (sync with `AuthContext.jsx`)

When implementing guards, align ERP role names with code:

| ERP role (example) | SPA flag (current) | SPA flag (target) |
|--------------------|--------------------|-------------------|
| System Manager | isAdmin | isAdmin |
| Administrator | isAdmin | isAdmin |
| POS User, Cashier | isPOS | isPOS |
| Profile Manager | isPOS ❌ | remove |
| Website Manager | isPOS ❌ | remove |
| Stock User | isInventory | isInventory |
| Purchase User/Manager | — | isPurchasing |
| Elmahdi Store Manager (custom) | — | isStoreManager |

---

## Deployment verification (permissions)

After ERP profiles applied, test with **five test users** (one per role):

1. Login → correct home path only
2. Direct URL to forbidden route → redirected
3. API mutation denied returns 403 (not silent empty)
4. POS sale deducts correct warehouse stock
5. PR receive blocked for cashier API user
6. User create/delete blocked for non-admin API user
7. Reconciliation submit blocked for clerk API user

---

## Related docs

- `docs/PERMISSION_MATRIX.md`
- `docs/ROLE_CAPABILITIES.md`
- `docs/SECURITY_GAPS.md`
- `docs/REQUIRED_ROUTE_GUARDS.md`
- `docs/ERP_RULES.md`
- `docs/PRODUCTION_READINESS.md`

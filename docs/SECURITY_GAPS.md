# Security Gaps — Authentication & Permissions Audit

**Audit date:** May 2026  
**Severity:** Critical / High / Medium / Low

---

## Executive summary

The SPA uses **cookie session auth** and **three coarse route buckets** (admin, pos, inventory). **ERPNext remains the real enforcement layer**, but several admin-only surfaces are exposed to anyone with `System Manager`, and several operational roles **cannot access their workflows** without full admin. Multiple **high-impact mutations** have no approval step and no frontend role checks beyond the route shell.

---

## Critical

### C1 — Full admin surface behind single `isAdmin` check

**Finding:** All of `/admin/*` including **Users**, **Settings**, **Purchasing**, and **Sales Invoices** share one guard (`require="admin"`).

**Impact:** Any user with `System Manager` or `Administrator` can create/delete users, open ERP settings, submit purchase invoices, and view all sales data.

**Evidence:** `src/App.jsx` lines 86–112; `ProtectedRoute.jsx` line 18.

**Mitigation:** Split route guards; hide nav items; ERP role profiles with least privilege; disable `deleteUser` in production.

---

### C2 — User delete from SPA

**Finding:** `UsersPage` calls `deleteUser` with only `window.confirm`.

**Impact:** Irreversible User doc deletion if ERP permits.

**Evidence:** `src/modules/admin/UsersPage.jsx`, `src/services/api.js` `DELETE /api/resource/User/{name}`.

**Mitigation:** Remove delete from SPA; use disable only; restrict DELETE on User DocType.

---

### C3 — User create without role profile assignment

**Finding:** `createUser` posts email + name only; optional `role_profile_name` never set from UI.

**Impact:** New users may have **no roles** or default desk roles; fallback auth inference may grant wrong home path.

**Evidence:** `src/modules/admin/UsersPage.jsx`, `api.js` `createUser`.

**Mitigation:** Require Role Profile picker; ERP mandatory field validation.

---

### C4 — Role inference fallback when User API restricted

**Finding:** If `getUserRoles` fails or returns empty roles, capabilities inferred from **username substrings** (`cashier`, `admin`, `stock`).

**Impact:** Privilege escalation or wrong landing path; `isManager` forced false.

**Evidence:** `AuthContext.jsx` lines 100–134.

**Mitigation:** Fail closed to `/login`; never infer from identifier in production.

---

## High

### H1 — Purchasing not reachable without Admin bucket

**Finding:** `Purchase Manager` / `Purchase User` not mapped to any SPA flag; purchasing lives under `/admin/purchasing`.

**Impact:** Officers get System Manager (over-permissioned) or cannot use the app.

**Evidence:** `AuthContext.jsx` — no `PURCHASING_ROLES`; `App.jsx` nested under admin.

---

### H2 — Over-broad POS role mapping

**Finding:** `POS_ROLES` includes `Profile Manager`, `Website Manager`.

**Impact:** Non-cashier ERP roles may access POS and checkout.

**Evidence:** `AuthContext.jsx` lines 6–15.

**Mitigation:** Remove; use explicit Cashier / POS User only.

---

### H3 — Inventory high-risk actions without approval

**Finding:** Stock Reconciliation, Material Issue, Transfer, PR/PI submit immediately (`docstatus: 1`).

**Impact:** Stock valuation and payables fraud; no second pair of eyes.

**Evidence:** `inventoryApi.js`, `purchasingApi.js`, Reconciliation/Receive pages.

**Mitigation:** ERP workflow states; SPA hide routes until approved.

---

### H4 — No warehouse scoping in inventory UI

**Finding:** Warehouse pickers load all warehouses from API (`listWarehouses` limit 500); alerts can query 800 bins across all warehouses.

**Impact:** Clerk with ERP access to one warehouse can select others if ERP permissions are loose.

**Evidence:** `StockEntryPage.jsx`, `AlertsPage.jsx`, `inventoryApi.js`.

---

### H5 — Admin blocked from POS but reachable via navigation

**Finding:** `ProtectedRoute` redirects admin away from `/pos`, but **AdminLayout** nav includes POS link; inventory layout links to admin/POS.

**Impact:** Confusing; admins use separate flows. Lower risk than cashier reaching admin.

**Evidence:** `AdminLayout.jsx` NAV; `ProtectedRoute.jsx` line 22.

---

### H6 — `isManager` unused for authorization

**Finding:** Manager detection exists but does not gate routes or destructive actions.

**Impact:** False sense of security from RoleBadge; store managers need explicit policy.

**Evidence:** `AuthContext.jsx`; grep shows only `RoleBadge.jsx`.

---

## Medium

### M1 — POS: no discount / price override UI but rate in cart payload

**Finding:** Checkout sends `rate` per line from cart state (catalog at add time). No UI to edit rate — good — but nothing prevents API tampering.

**Impact:** Malicious client could POST lower rates if ERP allows.

**Mitigation:** ERP validate selling price against Price List; POS Settings.

---

### M2 — POS pending invoice recovery

**Finding:** `recoverPendingInvoice` / `dismissPendingInvoice` can leave draft/submitted invoices in ambiguous state.

**Impact:** Revenue leakage or duplicate submit attempts.

**Evidence:** `usePOS.js`, `POSPage.jsx`.

---

### M3 — Cashier + stock dual role lands on POS not inventory

**Finding:** `homePathFromRoles`: POS checked before inventory.

**Impact:** Stock clerk who also cashes may never land on inventory workspace.

---

### M4 — Activity log not audit-grade

**Finding:** `activityLogService` writes to `localStorage`; merge with ERP Activity Log optional.

**Impact:** Compliance gap; not a permission bypass but audit risk.

---

### M5 — No page-level guards on sensitive admin pages

**Finding:** `UsersPage`, `SettingsPage` have no `if (!isAdmin)` inside page — relies entirely on parent route.

**Impact:** Safe only if route never misconfigured; no defense in depth.

---

### M6 — Export toolbar on operational pages

**Finding:** Customers/Warehouses export all visible rows client-side.

**Impact:** Data exfiltration if route guard wrong; ERP CSV export permissions.

---

## Low

### L1 — Session cookie only; no CSRF token in SPA

**Finding:** Standard Frappe session; SPA uses `withCredentials`.

**Mitigation:** Same-origin deploy; ERP CSRF on API.

---

### L2 — 30s API timeout, no rate limit on login in SPA

**Finding:** `api.js` timeout; login brute force is ERP-side.

---

### L3 — Guest redirect on unknown routes

**Finding:** `*` → `/login` — acceptable.

---

## Dangerous permission gaps (summary table)

| Gap | Who is at risk | What can go wrong |
|-----|----------------|-------------------|
| Monolithic admin route | Organization | Over-privileged purchasing/cashier accounts |
| User CRUD in SPA | IT / HR data | Account lifecycle abuse |
| Role inference | All users | Wrong access on misconfigured ERP |
| Unscoped warehouses | Inventory | Cross-store stock moves |
| Instant reconciliation | Finance | Silent shrinkage adjustment |
| Instant PR/PI | AP / inventory | Fraudulent receipts and bills |
| POS role sprawl | Store | Non-cashiers on register |
| No purchasing route | Buyers | Shadow admin accounts |

---

## Inventory risk actions (no approval)

| Action | Page | Submits |
|--------|------|---------|
| Material Receipt | Stock Entry | Stock Entry |
| Material Issue | Stock Entry | Stock Entry |
| Material Transfer | Transfer | Stock Entry |
| Count adjustment | Reconciliation | Stock Reconciliation |
| Goods receipt | Receive Stock | Purchase Receipt |
| Supplier invoice | Purchase Invoices | Purchase Invoice |

---

## Unsafe cashier capabilities (current)

| Capability | Status | Notes |
|------------|--------|-------|
| Access `/admin` | Blocked unless admin role | ✅ |
| Access `/inventory` | Blocked unless inventory role | ✅ |
| Checkout without shift | Blocked client-side | ✅ |
| Sell over available qty | Blocked if `validateCartStock` | ⚠️ ERP policy |
| Change price at register | No UI | ⚠️ API tampering |
| View all sales invoices | No route | ✅ |
| Open admin from POS menu | Only if `isAdmin` / `isInventory` | ⚠️ dual-role users |
| Profile Manager → POS access | Allowed | ❌ remove mapping |

---

## Related docs

- `docs/PERMISSION_MATRIX.md`
- `docs/ROLE_CAPABILITIES.md`
- `docs/REQUIRED_ROUTE_GUARDS.md`
- `docs/ERP_PERMISSION_ALIGNMENT.md`

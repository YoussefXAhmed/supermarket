# Security Audit Phase 2 — Frontend Permission & Access Control

**Date:** 2026-05-22  
**Scope:** Frontend SPA (`src/`) — route guards, capability model, destructive UI actions, data-scope leakage, and server-enforcement assumptions.  
**Methodology:** Static analysis of auth/capability files, route definitions, page components, and API service layer.  
**Approach:** Report-first; minimal safe fixes only; no backend rewrites, no API contract changes.

---

## Summary Table

| # | Severity | Title |
|---|----------|-------|
| F-01 | 🔴 HIGH | `/admin/invoices` has no route-level capability guard |
| F-02 | 🔴 HIGH | `deleteUser()` API exported and reachable — not dead code |
| F-03 | 🟠 MEDIUM | `SHIFT_APPROVE_ROLES` is over-broad — `accounts user` can approve shift closings |
| F-04 | 🟠 MEDIUM | `inferProfileFromRoles` can incorrectly escalate privilege on ambiguous role sets |
| F-05 | 🟠 MEDIUM | Several `/admin` sub-routes have no `CapabilityRoute` guard (inventory, customers, reports, activity) |
| F-06 | 🟡 LOW | `IS_DEV` flag controls stock debug rendering in POS cards — risk if miscompiled |
| F-07 | 🟡 LOW | `SettingsPage` exposes `ERP_BASE_URL` and auth method in the browser UI |
| F-08 | 🟡 LOW | `window.confirm` used for irreversible destructive actions (warehouse delete, user disable) |

---

## F-01 — `/admin/invoices` Has No Route-Level Capability Guard

**Severity:** 🔴 HIGH  
**Affected files:**
- `src/App.jsx` line 235–236
- `src/auth/routeAccess.js` (missing `canViewInvoices` rule)
- `src/modules/admin/InvoicesPage.jsx`

### Description

`/admin/invoices` renders `InvoicesPage` (all Sales Invoices from ERPNext) inside the `ProtectedRoute require="admin"` shell, which only checks `canAccessAdminWorkspace`. There is **no `CapabilityRoute` guard** and **no entry in `ROUTE_ACCESS`** for this path.

Any authenticated user whose profile grants `canAccessAdminWorkspace` (e.g., `store_manager`, `accountant`) can navigate directly to `/admin/invoices` regardless of whether `canViewInvoices` is true. While the nav links are hidden by capability, direct URL access bypasses this.

```jsx
// App.jsx — no CapabilityRoute wrapping InvoicesPage
<Route path="inventory" element={<LazyPage><InventoryPage /></LazyPage>} />
<Route path="invoices" element={<LazyPage><InvoicesPage /></LazyPage>} />  {/* ← UNGUARDED */}
<Route path="customers" element={<LazyPage><CustomersPage /></LazyPage>} /> {/* ← UNGUARDED */}
```

### Production Risk

A Store Manager or Purchasing Officer who gains `canAccessAdminWorkspace` via profile change can immediately see all customer sales invoices, amounts, and outstanding balances without `canViewInvoices` being set.

### Recommended Fix

Wrap with `CapabilityRoute`:

```jsx
<Route
  path="invoices"
  element={(
    <CapabilityRoute cap="canViewInvoices">
      <LazyPage><InvoicesPage /></LazyPage>
    </CapabilityRoute>
  )}
/>
```

Also add to `ROUTE_ACCESS` in `src/auth/routeAccess.js`:

```js
{ prefix: '/admin/invoices', anyOf: ['canViewInvoices', 'canManageSystem'] },
```

---

## F-02 — `deleteUser()` API Is Exported and Not Dead Code

**Severity:** 🔴 HIGH  
**Affected files:**
- `src/services/api.js` lines 327–329
- `src/services/warehouseAdminApi.js` lines 53–55 (`deleteWarehouseDoc`)

### Description

`deleteUser()` is marked `@deprecated` but remains a live export that performs a `DELETE /api/resource/User/:name` call. It is **not removed from the bundle**. Any future developer, or a compromised dependency, could invoke it.

`deleteWarehouseDoc` is used by `warehouseAdminService.deleteWarehouseSafe()` and is connected to the UI through `AdminWarehousesPage` — this is an active, permanent-destruction action guarded only by `canManageSystem`.

```js
/** @deprecated Do not use from SPA — disable users instead. */
export const deleteUser = (name) =>
  api.delete(`/api/resource/User/${encodeURIComponent(name)}`);
```

### Production Risk

- `deleteUser` is exported and tree-shakeable only if never imported. A mistaken import restores it silently. No server-side rate-limit or audit log is enforced from the SPA side.
- Warehouse physical deletion is irreversible and is protected only by the ERPNext backend validation (`assessWarehouseDeletion`). If the assessment check is bypassed or fails open, stock data is permanently lost.

### Recommended Fix

1. **Remove `deleteUser` entirely** from `api.js`. If server-side ERPNext permits user deletion via API, that's an ERPNext configuration issue to address separately.
2. For warehouse deletion: add a server-side `frappe.has_permission('System Manager')` check in the `elmahdi` backend before calling `frappe.delete_doc`.
3. Minimum safe frontend fix: add a second `canManageSystem` check in `confirmDelete` in `AdminWarehousesPage` before calling the API.

---

## F-03 — `SHIFT_APPROVE_ROLES` Is Over-Broad

**Severity:** 🟠 MEDIUM  
**Affected files:**
- `src/auth/capabilities.js` lines 60–68

### Description

```js
export const SHIFT_APPROVE_ROLES = new Set([
  'accounts manager',
  'accounts user',       // ← grants canApproveShift
  'store manager',
  'pos manager',
  'sales manager',
  'stock manager',
  'purchase manager',
]);
```

`accounts user` (a standard ERPNext role for AP data entry) receives `canApproveShift: true` in the frontend capability model. This means an accounts-data-entry clerk with `accounts user` role in ERPNext — who may not be authorized to approve POS cashier shift closings — gets the shift approval button in the UI.

The backend `pos_closing_approval.py` does perform its own role check, so this is a frontend-only over-grant rather than a true authorization bypass. However, it creates:
- UX confusion (wrong employees see action buttons)
- A potential surface if the backend check is ever loosened

### Production Risk

Medium — backend enforces the real check, but the frontend presents approval UI to accounts-data-entry users who may not be authorized operationally.

### Recommended Fix

Separate `accounts user` out of `SHIFT_APPROVE_ROLES`:

```js
export const SHIFT_APPROVE_ROLES = new Set([
  'accounts manager',  // keep — senior accounting
  'store manager',
  'pos manager',
  'sales manager',
  'stock manager',
  'purchase manager',
  // 'accounts user' removed — use accounts manager for shift approval
]);
```

Verify that `pos_closing_approval.py` in `erp-custom` explicitly names `accounts manager` (not `accounts user`) in its server-side role check before removing from frontend.

---

## F-04 — `inferProfileFromRoles` Can Produce Privilege Escalation on Ambiguous Role Sets

**Severity:** 🟠 MEDIUM  
**Affected files:**
- `src/auth/roleProfileResolution.js` lines 66–86

### Description

When a user has no `role_profile_name` set in ERPNext, the SPA infers an Elmahdi profile by matching ERP role names against `TEMPLATE_ERP_ROLE_SIGNATURES`. The inference resolves only if **exactly one template matches** (tie-breaking returns `''`).

However, a user with a non-standard combination — e.g., both `accounts user` and `sales user` — may partially match multiple templates. If one template scores higher (more hits), that profile is silently assigned, potentially granting capabilities beyond the user's intended operational scope.

```js
// If matches[0].hits > matches[1].hits, the top profile wins unconditionally
if (matches.length > 1 && matches[1].hits === top.hits) {
  return ''; // tie → no profile
}
return top.profile; // partial win → uses this profile
```

A user with `['cashier', 'purchase user']` would infer a Cashier profile (cashier wins with 1 hit vs purchasing's 1 hit — tie → ''). But `['cashier', 'accounts user']` would give Cashier profile (cashier 1, accountant 1 → tie → ''). This is currently safe due to tie-breaking, but a future role addition to any template could break the tie.

### Production Risk

Medium — depends on future role template changes. Currently protected by the tie-break rule, but fragile. No alert when inference is used.

### Recommended Fix

1. Add a dev-mode warning (already has `devAuthLog`) when `inferProfileFromRoles` is used in production (no `role_profile_name` set).
2. In production, treat a missing `role_profile_name` as fail-closed: return `EMPTY_CAPABILITIES` and redirect to login or show a "contact admin" page, rather than falling through to role-based inference.

---

## F-05 — Several `/admin` Sub-Routes Have No `CapabilityRoute` Guard

**Severity:** 🟠 MEDIUM  
**Affected files:**
- `src/App.jsx` lines 235, 245, 262, 263

### Description

Inside the `ProtectedRoute require="admin"` block, the following routes have **no further capability guard** and do not appear in `ROUTE_ACCESS`:

| Route | Page | Missing Guard |
|-------|------|--------------|
| `/admin/inventory` | `InventoryPage` (admin overview) | `canAccessInventory` |
| `/admin/invoices` | `InvoicesPage` | `canViewInvoices` _(see F-01)_ |
| `/admin/customers` | `CustomersPage` | `canViewReports` or similar |
| `/admin/reports` | `ReportsPage` | `canViewReports` |
| `/admin/activity` | `ActivityLogPage` | `canViewReports` or `canManageSystem` |

The nav hides these links by capability, but any `canAccessAdminWorkspace` user can access them directly by typing the URL.

### Production Risk

A Purchasing Officer or Accountant can navigate to `/admin/customers` (customer list + contact data) or `/admin/activity` (audit log of all system operations) without any explicit permission.

### Recommended Fix

Wrap each affected route in `CapabilityRoute`:

```jsx
<Route
  path="inventory"
  element={(
    <CapabilityRoute cap="canAccessInventory">
      <LazyPage><InventoryPage /></LazyPage>
    </CapabilityRoute>
  )}
/>
<Route
  path="customers"
  element={(
    <CapabilityRoute cap="canViewReports">
      <LazyPage><CustomersPage /></LazyPage>
    </CapabilityRoute>
  )}
/>
<Route
  path="reports"
  element={(
    <CapabilityRoute cap="canViewReports">
      <LazyPage><ReportsPage /></LazyPage>
    </CapabilityRoute>
  )}
/>
<Route
  path="activity"
  element={(
    <CapabilityRoute cap="canManageSystem">
      <LazyPage><ActivityLogPage /></LazyPage>
    </CapabilityRoute>
  )}
/>
```

Also add entries to `ROUTE_ACCESS` in `src/auth/routeAccess.js`:

```js
{ prefix: '/admin/customers', anyOf: ['canViewReports', 'canManageSystem'] },
{ prefix: '/admin/reports',   anyOf: ['canViewReports', 'canManageSystem'] },
{ prefix: '/admin/activity',  anyOf: ['canManageSystem'] },
{ prefix: '/admin/inventory', anyOf: ['canAccessInventory', 'canManageSystem'] },
```

---

## F-06 — `IS_DEV` Stock Debug Info Rendered in POS Cards

**Severity:** 🟡 LOW  
**Affected files:**
- `src/modules/pos/POSPage.jsx` lines 42–57
- `src/config/erp.js` line 32

### Description

```jsx
const dev = IS_DEV;
// ...
{dev && item?.is_stock_item !== 0 && (
  <p className="item-card__stock mono" style={{ opacity: 0.75 }}>
    wh: {item.pos_warehouse} · actual: {item.actual_qty} · reserved: {item.reserved_qty} · sellable: {item.sellable_qty}
  </p>
)}
```

`IS_DEV = Boolean(import.meta.env.DEV)` is set at **build time** by Vite. In a correctly built production bundle, `import.meta.env.DEV` will be `false` and the block will be tree-shaken. However:

- If someone builds with `vite --mode development` for a "staging" environment, `IS_DEV` is `true` and internal stock quantities (actual, reserved, sellable) are visible in the POS cashier UI to any logged-in POS user.
- Stock quantity details are internal business data that cashiers don't need and shouldn't see.

### Production Risk

Low for standard `vite build` (production). Medium if dev/staging builds are deployed to real users.

### Recommended Fix

The debug block is acceptable for local development. Add a comment making the build-time dependency explicit, and ensure CI/CD deploys only `vite build` (not `vite build --mode development`):

```jsx
{/* DEV ONLY — never true in `vite build` production output */}
{IS_DEV && item?.is_stock_item !== 0 && ( ... )}
```

Add to CI pipeline documentation that staging builds must use `NODE_ENV=production`.

---

## F-07 — `SettingsPage` Exposes Connection Details in the UI

**Severity:** 🟡 LOW  
**Affected files:**
- `src/modules/admin/SettingsPage.jsx` lines 65–67

### Description

```jsx
<Row label="Base URL" value={ERP_BASE_URL} />
<Row label="Auth" value="Cookie-based (withCredentials)" />
<Row label="Protocol" value="Frappe REST API v2" />
```

The Settings page, visible to any `canManageSettings` user (typically System Manager only), displays the ERP backend URL and authentication mechanism in plain text in the UI. This information is also available in the network tab to any authenticated user, so it is not a high-severity leak — but it reduces the cost of reconnaissance for an insider.

### Production Risk

Low — guarded by `canManageSettings` (System Manager only). No credential is exposed. However, displaying the internal backend URL makes it easier for a malicious insider to directly target the ERPNext API.

### Recommended Fix

Consider removing the `Base URL` row, or replacing it with a masked/truncated form:

```jsx
<Row label="Base URL" value={ERP_BASE_URL.replace(/^https?:\/\//, '').split('/')[0]} />
```

Or show only that the connection is configured without the literal URL.

---

## F-08 — `window.confirm` Used for Irreversible Destructive Actions

**Severity:** 🟡 LOW  
**Affected files:**
- `src/modules/admin/UsersPage.jsx` line 252 (Enable user)
- `src/modules/admin/AdminWarehousesPage.jsx` line 207 (Disable warehouse)
- `src/modules/purchasing/PurchaseApprovalsPage.jsx` line 65 (Reject purchase)
- `src/modules/approvals/pages/ApprovalsDashboardPage.jsx` line 53 (Reject purchase)
- `src/modules/pos/POSPage.jsx` line 223 (Clear cart)

### Description

Multiple irreversible or significant actions (warehouse disable, user enable, purchase receipt rejection) use `window.confirm()` as the sole confirmation mechanism. Browser confirm dialogs:

- Can be auto-dismissed by browser automation or accessibility tools
- Provide no context (e.g., no reference to what exactly is being rejected)
- Have no audit record in the SPA
- Are inconsistent with the rest of the UI (which uses proper confirmation panels)

The `UsersPage` disable flow **correctly** uses a typed-username confirmation panel. The `enable` flow only uses `window.confirm`.

### Production Risk

Low — the actions are ultimately gated by ERPNext server-side permissions. However, an accidental confirm-click can trigger a purchase rejection or warehouse disable that requires backend reversal.

### Recommended Fix

- **Reject actions** (purchase/shift): Replace `window.confirm` with an inline confirmation section matching the existing disable-user UX pattern (type a field to confirm).
- **Warehouse toggle**: Replace with a styled modal or inline confirmation UI.
- **Cart clear** in POS: Low priority — cart data is not persisted; `window.confirm` is acceptable here.
- **Enable user**: Add a typed-name or button-double-press confirmation to match the disable flow.

---

## Frontend-Only Enforcement — General Note

All capability checks in the SPA (`CapabilityRoute`, `hasCapability`, `ProtectedRoute`) are **client-side only**. They improve UX and prevent accidental access, but cannot substitute for backend enforcement. The system's real security posture relies on:

1. **ERPNext DocType permission rules** (Role Permission Manager)
2. **Whitelisted Frappe API methods** in `erp-custom/elmahdi`
3. **`frappe.has_permission()` checks** inside those methods

This audit assumes these backend layers are correctly configured as documented in `docs/SHIFT_PERMISSION_MODEL.md` and `docs/ERP_NATIVE_SUBMIT.md`. A separate backend audit should verify that whitelisted methods perform explicit permission checks before every write operation.

---

## Warehouse/Company Scope

The SPA passes warehouse scope from ERPNext User Permissions via `WAREHOUSE_SCOPE_EMPTY → allowedWarehouses`. This scope is loaded from the backend and applied as UI filters only — not enforced in API calls. API calls do not filter by `allowedWarehouses`; ERPNext's own User Permission rows enforce scoping server-side. This is the correct architecture, but means that if User Permission rows in ERPNext are misconfigured, the SPA will not compensate.

**Recommendation:** Periodically audit ERPNext User Permission rows (Allow: Warehouse, for each operational user) to ensure they match the warehouse scope set during provisioning in `UsersPage`.

---

## Action Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 (Do now) | F-01: Add `CapabilityRoute` to `/admin/invoices` | ~5 min |
| 2 (Do now) | F-05: Add `CapabilityRoute` to 4 unguarded `/admin` routes | ~15 min |
| 3 (Do now) | F-05: Add missing entries to `ROUTE_ACCESS` | ~5 min |
| 4 (Soon) | F-02: Remove `deleteUser` export from `api.js` | ~2 min |
| 5 (Soon) | F-03: Remove `accounts user` from `SHIFT_APPROVE_ROLES` (after backend confirmation) | ~2 min |
| 6 (Backlog) | F-04: Fail-closed on missing `role_profile_name` in production | ~30 min |
| 7 (Backlog) | F-08: Replace `window.confirm` with proper confirmation UI for reject/enable actions | ~1 hr |
| 8 (Optional) | F-06, F-07: Dev flag doc + URL masking | ~10 min |

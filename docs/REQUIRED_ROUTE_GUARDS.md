# Required Route Guards — Implementation Spec

**Audit date:** May 2026  
**Status:** Documentation only — **no code changes in this audit**

Defines guards to add without redesigning the golden table pattern. Align with `docs/ROLE_CAPABILITIES.md` target roles.

---

## Current guard implementation

**File:** `src/components/layout/ProtectedRoute.jsx`

| `require` | Rule |
|-----------|------|
| (default) | Authenticated user only |
| `admin` | `isAdmin` |
| `pos` | `isPOS` and **not** `isAdmin` (admin redirected to `/admin`) |
| `inventory` | `isAdmin` **or** `isInventory` |

**Gaps:** No `purchasing`, `manager`, `users`, `read-only`; no per-route flags; purchasing nested under admin.

---

## Required guard taxonomy

### Tier 0 — Public

| Route | Guard |
|-------|-------|
| `/login` | None |

### Tier 1 — Authenticated

All other routes require `user !== null`.

### Tier 2 — Surface guards (new)

| Guard prop | Condition | Routes |
|------------|-----------|--------|
| `requireAdmin` | `isAdmin` | Legacy full admin (deprecate split) |
| `requirePOS` | `isPOS && !isAdmin` | `/pos` |
| `requireInventory` | `isInventory \|\| isAdmin` | `/inventory/*` |
| `requirePurchasing` | `isPurchasing \|\| isAdmin \|\| isStoreManager` | `/admin/purchasing/*` |
| `requireStoreManager` | `isStoreManager \|\| isAdmin` | Dashboard, reports (partial) |
| `requireUserAdmin` | `canManageUsers` | `/admin/users` |

### Tier 3 — Feature guards (in-page)

Hide nav + block render when false:

| Flag | Pages |
|------|-------|
| `canManageUsers` | Users, Settings (partial) |
| `canExport` | ExportToolbar |
| `canSubmitStock` | Stock entry, transfer |
| `canReconcile` | Reconciliation |
| `canSubmitPurchasing` | Receive, PI create |
| `canDeleteRecords` | User delete (remove) |

---

## Route inventory — required guards

### `/pos`

| Current | Required |
|---------|----------|
| `require="pos"` | Keep; tighten `isPOS` definition (remove Website/Profile Manager) |
| Admin redirect | Keep |
| Optional | `requireOpenShift` — page-level, already in checkout |

### `/inventory/*`

| Route | Current | Required |
|-------|---------|----------|
| `/inventory` | inventory + admin | + warehouse read permission |
| `/inventory/stock-entry` | same | + `canSubmitStock` |
| `/inventory/transfer` | same | + `canSubmitStock` |
| `/inventory/reconciliation` | same | + `canReconcile` (manager only) |
| `/inventory/ledger` | same | read |
| `/inventory/items` | same | read |
| `/inventory/alerts` | same | read |
| `/inventory/reorder` | same | read |
| `/inventory/batches` | same | read |
| `/inventory/analytics` | same | `isStoreManager \|\| isAdmin` |
| `/inventory/reports` | same | read |
| `/inventory/warehouses` | same | read |

### `/admin` (split required)

| Route | Current | Required guard |
|-------|---------|----------------|
| `/admin` | admin | `isAdmin \|\| isStoreManager` (dashboard read) |
| `/admin/products` | admin | read: manager+; write: admin |
| `/admin/inventory` | admin | read: manager+, inventory |
| `/admin/invoices` | admin | `isStoreManager \|\| isAdmin` |
| `/admin/customers` | admin | `isStoreManager \|\| isAdmin` (read) |
| `/admin/users` | admin | **`canManageUsers` only** |
| `/admin/activity` | admin | `isStoreManager \|\| isAdmin` |
| `/admin/reports` | admin | `isStoreManager \|\| isAdmin` |
| `/admin/settings` | admin | `isAdmin` only |

### `/admin/purchasing/*` (split from admin)

| Route | Current | Required |
|-------|---------|----------|
| `/admin/purchasing` | admin | `requirePurchasing` |
| `.../suppliers` | admin | `requirePurchasing` |
| `.../suppliers/:id` | admin | `requirePurchasing`; write: submit permission |
| `.../receive` | admin | `requirePurchasing` + `canSubmitPurchasing` |
| `.../invoices` | admin | `requirePurchasing` + `canSubmitPurchasing` |
| `.../matching` | admin | `requirePurchasing` |
| `.../reports` | admin | `requirePurchasing` or read-only manager |

**Implementation note:** Wrap `PurchasingLayout` in `ProtectedRoute require="purchasing"` instead of inheriting only parent admin shell.

---

## Navigation guards (must match routes)

| Layout | Issue | Required |
|--------|-------|----------|
| `AdminLayout` NAV | Shows Users, Settings, Purchasing to all admins | Filter NAV by capability flags |
| `InventoryLayout` | Links to Admin/POS for isAdmin/isPOS | Keep; remove for pure clerks |
| `PurchasingLayout` | No auth check | Parent route guard |

---

## Routes accessible without proper guards today

| Route | Issue |
|-------|-------|
| `/admin/purchasing/*` | Any `System Manager` — not purchasing-specific |
| `/admin/users` | Same — user management |
| `/admin/settings` | Same — ERP connection exposure |
| `/inventory/reconciliation` | Any inventory role — no clerk vs manager split |
| `/pos` | Profile Manager / Website Manager if ERP assigns those roles |

---

## Suggested `App.jsx` structure (future)

```text
/admin
  ProtectedRoute requireAdminCapabilities={['dashboard']}
  /users → ProtectedRoute requireUserAdmin
  /settings → ProtectedRoute requireAdmin
  /purchasing → ProtectedRoute requirePurchasing
    PurchasingLayout + child routes
```

Or extract purchasing to `/purchasing` top-level with same layout for clearer ERP alignment.

---

## AuthContext additions (future)

```javascript
// New role sets
const PURCHASING_ROLES = new Set(['purchase user', 'purchase manager', ...]);
const STORE_MANAGER_ROLES = new Set(['elmahdi store manager', ...]);

// New exports
isPurchasing, isStoreManager, canManageUsers, warehousesAllowed
```

**Do not** use username inference in production (`reason: 'identifier-inferred'` → block login).

---

## Testing checklist (post-implementation)

| User profile | Can reach | Cannot reach |
|--------------|-----------|--------------|
| Cashier | `/pos` | `/admin`, `/inventory` |
| Inventory clerk | `/inventory` (scoped WH) | `/admin`, `/pos`, reconcile |
| Purchasing officer | `/admin/purchasing` | `/admin/users`, `/pos` |
| Store manager | dashboard, reports, read inventory | users, settings |
| Administrator | all per policy | POS (optional) |

---

## Related docs

- `docs/PERMISSION_MATRIX.md`
- `docs/ROLE_CAPABILITIES.md`
- `docs/SECURITY_GAPS.md`
- `docs/ERP_PERMISSION_ALIGNMENT.md`

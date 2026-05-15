# Role Capabilities — Current vs Target

**Audit date:** May 2026  
**Code references:** `src/context/AuthContext.jsx`, `src/components/layout/ProtectedRoute.jsx`, `src/App.jsx`

---

## Current SPA role model

The SPA does **not** implement five operational roles. It implements **three route gates** plus an unused **manager flag**:

```text
isAdmin  → /admin/*
isPOS    → /pos
isInventory (+ isAdmin bypass) → /inventory/*
isManager → RoleBadge label only
```

### Roles mapped today

| ERPNext role (examples) | SPA flags | Default home |
|-------------------------|-----------|--------------|
| System Manager, Administrator | `isAdmin` | `/admin` |
| POS User, Sales User, Cashier, POS Manager, Sales Manager | `isPOS` | `/pos` |
| Profile Manager, Website Manager | `isPOS` ⚠️ | `/pos` |
| Stock User, Stock Manager, Item Manager, Warehouse User/Manager | `isInventory` | `/inventory` |
| Purchase Manager, Purchase User | **none** (unless also Admin) | `/login` or inferred |

### Role resolution flow

1. `GET frappe.auth.get_logged_user`
2. `GET /api/resource/User/{name}` with `roles` child table
3. If roles empty or API fails → **username substring inference** (`cashier` → POS, `stock` → inventory, etc.)

**Risk:** Users without readable `User` doc get guessed capabilities.

---

## Missing operational roles (SPA)

| Operational role | Needed for | Current gap |
|------------------|------------|-------------|
| **Purchasing Officer** | Suppliers, PR, PI, matching | Trapped behind `require="admin"` |
| **Store Manager** | Dashboard, reports, overrides | No `isManager` routing; same as admin or nothing |
| **Read-only auditor** | Activity, invoices, inventory view | No read-only route tier |
| **Pricing manager** | Item Price, price lists | No dedicated guard; admin products read-only |
| **Receiving clerk** | PR only, no PI | No split purchasing permissions |

---

## Target production-safe role structure

Below is the **recommended** mapping for supermarket operations. Implement via **ERPNext Role Profiles + User Permissions**, then align SPA guards (see `REQUIRED_ROUTE_GUARDS.md`).

### 1. Administrator

**Purpose:** System configuration, user lifecycle, company settings, break-glass.

| Capability | Allow |
|------------|-------|
| SPA routes | `/admin/*` (all), optional `/inventory/*` for support |
| POS | Desk only or explicit override role — avoid daily admin on POS |
| Users | Create / disable / role assignment (not delete in production) |
| Purchasing | Full |
| Stock | Full all warehouses |
| Pricing | Item, Item Price, Price List |
| Approvals | Configure ERP workflows; not required in SPA v1 |

**ERPNext roles:** `System Manager` (minimal users), custom **Elmahdi Admin** role profile duplicating required DocTypes.

---

### 2. Cashier

**Purpose:** Fast checkout only; no back-office data exposure.

| Capability | Allow |
|------------|-------|
| SPA routes | `/pos` only |
| POS | Open/close own shift, sell, accept Cash/Card per POS Profile |
| Stock | Read bin for POS warehouse only (via ERP) |
| Block | `/admin`, `/inventory`, exports, invoice lists, user APIs |
| Pricing | Read Item Price for POS price list only; **no rate override in SPA** |
| Returns | ERP Return Invoice workflow only (not in SPA today) |

**ERPNext roles:** `POS User` or custom **Elmahdi Cashier** — remove `Profile Manager` / `Website Manager` from POS mapping.

**SPA changes needed:** Remove broad roles from `POS_ROLES`; add `requirePurchasing={false}` checks.

---

### 3. Inventory Clerk

**Purpose:** Receive/issue/transfer stock; no purchasing or pricing.

| Capability | Allow |
|------------|-------|
| SPA routes | `/inventory/*` except optional 🔒 `analytics` for managers |
| Stock Entry | Receipt, Issue, Transfer for **assigned warehouses** |
| Reconciliation | 🔒 Manager approval in ERP before submit (recommended) |
| Block | `/admin`, `/pos`, purchasing, user management, reconciliation without role |
| Warehouses | ERP User Permission: warehouse list |

**ERPNext roles:** `Stock User` + warehouse User Permissions.

**SPA changes needed:** Warehouse allowlist from boot/ERP; hide reconciliation route for clerks.

---

### 4. Purchasing Officer

**Purpose:** Suppliers, receiving, supplier invoices; no user admin or POS.

| Capability | Allow |
|------------|-------|
| SPA routes | `/admin/purchasing/*` + read-only supplier reports |
| Block | `/admin/users`, `/admin/settings`, stock reconciliation, POS |
| Receive | Submit PR up to policy; no rate above PO (if PO added later) |
| PI | Create/submit with matching to PR |
| Stock impact | Via PR only |

**ERPNext roles:** `Purchase User`, `Purchase Manager` (without `System Manager`).

**SPA changes needed:** New `require="purchasing"` guard; split purchasing from full admin tree.

---

### 5. Store Manager

**Purpose:** Supervise store P&L, approve exceptions, no IT admin.

| Capability | Allow |
|------------|-------|
| SPA routes | `/admin` dashboard, reports, sales invoices, customers (read), `/inventory` read + approve, `/admin/purchasing` read, `/pos` optional read-only |
| Block | `/admin/users`, user delete, ERP connection settings |
| Approvals | Stock Reconciliation, large PI, discount overrides (ERP workflow) |
| Export | Allowed on operational reports |

**ERPNext roles:** Custom **Elmahdi Store Manager** = read most + submit selected + approve workflow.

**SPA changes needed:** `isManager` route policy; feature flags per page (hide Users nav item).

---

## Capability flag proposal (future `AuthContext`)

| Flag | Derived from | Routes |
|------|--------------|--------|
| `isAdmin` | System Manager | Full admin |
| `isPOS` | Cashier profile | `/pos` |
| `isInventory` | Stock profile | `/inventory` |
| `isPurchasing` | Purchase profile | `/admin/purchasing` or `/purchasing` |
| `isStoreManager` | Manager profile | Composite read + approve routes |
| `canManageUsers` | Admin only | `/admin/users` |
| `warehousesAllowed` | ERP User Permissions | Filter pickers |

---

## `isManager` today

Computed in `deriveCapabilities` but **never** used in `ProtectedRoute` or page logic. Store managers either appear as Admin (full access) or have no access — both unsafe.

---

## Related docs

- `docs/PERMISSION_MATRIX.md`
- `docs/SECURITY_GAPS.md`
- `docs/REQUIRED_ROUTE_GUARDS.md`
- `docs/ERP_PERMISSION_ALIGNMENT.md`

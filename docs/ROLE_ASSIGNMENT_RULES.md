# Role Assignment Rules

**Version:** 1.0 · May 2026  
**Purpose:** Deterministic mapping from supermarket operational templates to ERPNext Role Profiles and underlying roles — with forbidden combinations and SPA capability outcomes.

---

## Assignment model

```text
Operational Template (SPA)
        │
        ▼
Role Profile (ERP) ──expands──► Role[] (ERP child on User)
        │
        ▼
DocType Permissions (via Role Permission Manager)
        │
        ▼
User Permissions (Warehouse, Price List, Company)
        │
        ▼
deriveCapabilities() → SPA flags + inventory caps
```

**Single source of truth for template names:** use enum keys `cashier`, `inventory_clerk`, `purchasing_officer`, `store_manager`, `administrator`.

---

## Template → Role Profile → Roles

### Cashier

| Layer | Value |
|-------|-------|
| SPA template | `cashier` |
| Role Profile | **Elmahdi Cashier** |
| Roles (via profile) | POS User, Cashier |
| SPA flags | `isPOS=true`, others false |
| Home | `/pos` |
| User Permissions | Warehouse (1), Price List (1), Company |

**Forbidden roles on same user:** Stock Manager, Purchase Manager, System Manager, Profile Manager, Website Manager.

**ERP DocType highlights:** POS Invoice submit; deny Stock Entry, User write, Item Price write.

---

### Inventory Clerk

| Layer | Value |
|-------|-------|
| SPA template | `inventory_clerk` |
| Role Profile | **Elmahdi Inventory Clerk** |
| Roles | Stock User, Warehouse User |
| SPA flags | `isInventory=true`, inventory caps = clerk |
| Home | `/inventory` |
| User Permissions | Warehouse (1+), Company |

**Forbidden:** Stock Manager (use manager template), Purchase User, POS User, System Manager.

**SPA caps (from `inventoryCapabilities.js`):**

- `canInventoryReceipt=true`
- `canInventoryIssueTransfer=false`
- `canInventoryReconcile=false`
- `canInventoryViewValuation=false`
- `canInventoryAnalytics=false`

**ERP must deny:** Stock Reconciliation submit (clerk profile).

---

### Inventory Manager (sub-variant)

Not a separate supermarket persona in HR — use when clerk is promoted:

| Layer | Value |
|-------|-------|
| Role Profile | **Elmahdi Inventory Manager** |
| Roles | Stock Manager, Warehouse Manager |
| SPA caps | manager inventory capabilities |

Assign via **role change**, not dual profile with clerk.

---

### Purchasing Officer

| Layer | Value |
|-------|-------|
| SPA template | `purchasing_officer` |
| Role Profile | **Elmahdi Purchasing Officer** |
| Roles | Purchase User (Purchase Manager only if approver duties) |
| SPA flags | `isPurchasing=true`, `canAccessPurchasing=true` |
| Home | `/admin/purchasing` |
| User Permissions | Warehouse (receive), Company |

**Forbidden:** System Manager for app access, Stock Entry submit, User write.

**Note:** `Purchase Manager` role grants `isManager` in SPA but does not alone grant `isPurchasing` unless profile name includes `purchase`.

---

### Store Manager

| Layer | Value |
|-------|-------|
| SPA template | `store_manager` |
| Role Profile | **Elmahdi Store Manager** |
| Roles | Stock Manager, Warehouse Manager, Purchase Manager, Sales Manager, Reports Manager |
| SPA flags (target) | `isStoreManager=true`, scoped admin read, inventory manager caps |
| Home (target) | `/admin` with filtered nav |
| SPA flags (today) | Often `isAdmin` if given System Manager — **incorrect** |
| User Permissions | All store warehouses, Company |

**Forbidden:** System Manager, User Manager (user CRUD), Accounts Manager (unless HQ).

**Approvals:** ERP workflows on SR, large PR/PI — see [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md).

---

### Administrator

| Layer | Value |
|-------|-------|
| SPA template | `administrator` |
| Role Profile | **Elmahdi Administrator** |
| Roles | Custom subset — not full System Manager for all IT |
| SPA flags | `isAdmin=true` |
| Home | `/admin` |
| User Permissions | Company-wide |

**Break-glass:** Separate ERP user with true System Manager for Frappe Desk; limit count to 1–2.

---

## SPA `deriveCapabilities` mapping table

| ERP role (normalized) | Flag affected |
|----------------------|---------------|
| system manager, administrator | `isAdmin` |
| pos user, cashier, sales user | `isPOS` |
| profile manager, website manager | `isPOS` ⚠️ **remove from POS_ROLES** |
| stock user, warehouse user | `isInventory` + clerk caps |
| stock manager, warehouse manager | `isInventory` + manager caps |
| purchase user, purchase manager | `isPurchasing` |
| *manager* substring / manager roles | `isManager` |

| Role profile name contains | Boost |
|-----------------------------|-------|
| `cashier`, `pos` | `isPOS` |
| `stock`, `inventory`, `warehouse` | `isInventory` |
| `purchase`, `purchasing` | `isPurchasing` |
| `manager` | `isManager` |

**Target:** Add `isStoreManager` when profile === `Elmahdi Store Manager` without `isAdmin`.

---

## Forbidden combinations

| Combination | Why forbidden |
|-------------|---------------|
| Cashier + Stock Manager | Checkout + unreconciled stock control |
| Cashier + Purchase User | Payables + cash fraud |
| Clerk + Purchase User | Receive vs buy separation blur |
| Any store role + System Manager | Full ERP bypass |
| Cashier + Profile Manager / Website Manager | Unintended POS access (current code bug) |
| Dual store assignment without HQ approval | Cross-store fraud |
| Store Manager + Administrator profile | User mgmt + operational approve same person OK only if policy allows — prefer split |

---

## Role change rules

| From → To | Allowed | Approval |
|-----------|---------|----------|
| Cashier → Clerk | Yes | Admin |
| Clerk → Manager (inventory) | Yes | Store Manager |
| Clerk → Cashier | Rare | Admin |
| Any → Store Manager | Yes | HQ Admin |
| Any → Administrator | Desk / HQ only | Owner |
| Store Manager → Clerk | Offboarding | Admin + disable first |
| Downgrade while sessions active | Disable → change → enable next day | Admin |

**Process:** Disable user → change Role Profile → verify permissions → enable.

**SPA today:** No role change UI — Desk only.

---

## Role Profile maintenance (ERP admin)

When editing Role Profiles in Desk:

1. Never add System Manager to operational profiles.  
2. After profile change, **existing users** inherit new roles on next save of User doc (or bulk reload).  
3. Version all profile edits — communicate to stores before deploy.  
4. Keep profile names stable (`Elmahdi *`) — SPA template map depends on exact strings.

---

## Validation rules (assignment time)

| Rule | Enforce |
|------|---------|
| `role_profile_name` required on create | SPA + ERP |
| Template maps to exactly one profile | Server method |
| Roles child must not be manually edited in SPA for store users | Desk break-glass only |
| If `roles` and `role_profile_name` conflict, profile wins on next save | ERP standard |
| Guest / All not assignable | Block |

---

## ERPNext Role Permission Manager checklist

Per profile, verify in Desk **Role Permissions**:

| Profile | Must have submit | Must NOT have |
|---------|------------------|---------------|
| Elmahdi Cashier | POS Invoice | Stock Entry, User, Item Price write |
| Elmahdi Inventory Clerk | Stock Entry (receipt) | Stock Reconciliation submit, User |
| Elmahdi Purchasing Officer | PR, PI | User, Stock Reconciliation |
| Elmahdi Store Manager | SR, approve workflows | User create (target) |
| Elmahdi Administrator | User (scoped) | Unrestricted GL (optional) |

---

## Current gaps vs rules

| Rule | Status |
|------|--------|
| Template on create | Not implemented |
| Role profile in UI | Not sent |
| POS_ROLES includes Profile/Website Manager | Violates cashier rule |
| Purchase User without isPurchasing before fix | Fixed in capabilities if role present |
| Store Manager without dedicated flag | Gap |
| Inference from username | Violates assignment model |

---

## Related documents

- [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md)
- [SUPERMARKET_ROLE_MODEL.md](./SUPERMARKET_ROLE_MODEL.md)
- [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md)
- [src/auth/capabilities.js](../src/auth/capabilities.js)

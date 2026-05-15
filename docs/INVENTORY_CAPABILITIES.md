# Inventory Capabilities — Mapping, Routes & ERP Alignment

**Audit date:** May 2026  
**Code:** `src/auth/inventoryCapabilities.js`, `src/hooks/useInventoryCapabilities.js`, `src/components/layout/InventoryCapabilityRoute.jsx`

---

## 1. Capability mapping

| Capability | Purpose | SPA grant (ERP roles) |
|------------|---------|------------------------|
| `canAccessInventory` | Enter `/inventory` workspace | Admin **or** any `INVENTORY_ROLES` |
| `canInventoryOperate` | General inventory workspace operations | Admin **or** inventory roles |
| `canInventoryReceipt` | Material **Receipt** (goods in) | Same as operate — Stock User, Warehouse User, managers |
| `canInventoryIssueTransfer` | Material **Issue**, **Transfer**, transfer route | Admin, **Stock Manager**, **Warehouse Manager** only |
| `canInventoryReconcile` | Stock Reconciliation submit | Admin, **Stock Manager**, **Warehouse Manager** only |
| `canInventoryViewValuation` | See rates, valuation columns, stock value KPIs | Admin, Stock Manager, Warehouse Manager, **Item Manager** |
| `canInventoryManage` | Management surfaces (analytics) | Admin, Stock/Warehouse Manager, Item Manager |
| `canInventoryAnalytics` | `/inventory/analytics` | Same as `canInventoryManage` |
| `warehouseScope` | Future User Permission filter | `allowedWarehouses: null` → **ERP filters lists today** |

### ERP role sets (normalized)

| Set | Roles |
|-----|-------|
| Clerk | `Stock User`, `Warehouse User` |
| Manager (stock) | `Stock Manager`, `Warehouse Manager` |
| Valuation view | Managers + `Item Manager` |
| All inventory | Clerk + Manager + `Item Manager` |

**Not frontend-only:** Submit still requires ERP permissions on Stock Entry, Stock Reconciliation, Bin, Item.

---

## 2. Affected routes

| Route | Guard layer 1 | Guard layer 2 | Clerk | Manager |
|-------|---------------|---------------|:-----:|:-------:|
| `/inventory` | `require=inventory` | — | ✅ | ✅ |
| `/inventory/warehouses` | inventory | — | ✅ read | ✅ read |
| `/inventory/stock-entry` | inventory | entry type filter | ✅ receipt only | ✅ all types |
| `/inventory/transfer` | inventory | `canInventoryIssueTransfer` | ❌ redirect | ✅ |
| `/inventory/reconciliation` | inventory | `canInventoryReconcile` | ❌ redirect | ✅ |
| `/inventory/ledger` | inventory | — | ✅ | ✅ |
| `/inventory/items` | inventory | valuation fields hidden | ✅ | ✅ |
| `/inventory/alerts` | inventory | valuation column hidden | ✅ | ✅ |
| `/inventory/reorder` | inventory | — | ✅ | ✅ |
| `/inventory/batches` | inventory | — | ✅ | ✅ |
| `/inventory/analytics` | inventory | `canInventoryAnalytics` | ❌ redirect | ✅ |
| `/inventory/reports` | inventory | — | ✅ | ✅ |

Admin (`isAdmin`) receives all capabilities.

---

## 3. Affected actions / buttons

| Surface | Action | Capability required |
|---------|--------|---------------------|
| **Stock Entry** | Entry type: Material Receipt | `canInventoryReceipt` |
| **Stock Entry** | Entry type: Material Issue | `canInventoryIssueTransfer` |
| **Stock Entry** | Entry type: Material Transfer | `canInventoryIssueTransfer` |
| **Stock Entry** | Create & Submit | Matching type + ERP Stock Entry submit |
| **Stock Transfer** | Submit transfer | `canInventoryIssueTransfer` + ERP |
| **Reconciliation** | Submit reconciliation | `canInventoryReconcile` + ERP |
| **Inventory nav** | Transfer link | `canInventoryIssueTransfer` |
| **Inventory nav** | Reconcile link | `canInventoryReconcile` |
| **Inventory nav** | Analytics link | `canInventoryAnalytics` |
| **Overview KPI** | Stock value card | `canInventoryViewValuation` |
| **Products table** | Price column | `canInventoryViewValuation` |
| **Alerts (low stock)** | Valuation column | `canInventoryViewValuation` |
| **Item details** | Standard rate line | `canInventoryViewValuation` |
| **Warehouses** | List only (no create in SPA) | `canAccessInventory` + ERP Warehouse read |

**Item price editing:** Not implemented in SPA (read-only `standard_rate` display). Editing remains **ERPNext Desk** — require deny Item write for clerks in ERP.

**Warehouse management:** SPA is read-only list; create/edit Warehouse is ERP-only.

---

## 4. Required ERP role assumptions

### Stock User / Warehouse User (clerk)

- Read: Item, Bin, Warehouse, Stock Ledger Entry
- Write/submit: Stock Entry **Material Receipt** only (recommend ERP restriction)
- Deny: Stock Reconciliation submit, Material Issue/Transfer (or deny via SPA + ERP)
- Deny: Item Price, Item write (pricing protection)

### Stock Manager / Warehouse Manager

- All clerk read access
- Submit: Stock Entry (all types), Stock Reconciliation
- Read: valuation fields on Bin
- User Permissions: assign warehouses per store

### Item Manager

- Read Item, optional valuation display in SPA
- Deny: Stock Reconciliation (SPA does not grant `canInventoryReconcile`)
- Item/Item Price write in ERP only if business requires

### System Manager / Administrator

- Full SPA admin + inventory capabilities
- Use separate profiles for daily ops in production

### Warehouse scoping (prepared, not loaded yet)

1. Configure **User Permissions** on Warehouse in ERPNext per user.
2. ERP list APIs return only allowed warehouses when permissions are tight.
3. Future: load allowlist into `warehouseScope.allowedWarehouses` and call `filterWarehousesByScope()` in pickers (`src/utils/warehouseScope.js`).

---

## Architecture notes

```text
deriveCapabilities()  [capabilities.js]
        │
        └── deriveInventoryCapabilities()  [inventoryCapabilities.js]
                    │
                    ├── AuthContext (provider flags)
                    ├── InventoryCapabilityRoute (route deny)
                    ├── InventoryLayout (nav filter)
                    └── useInventoryCapabilities() (pages)
```

**Fail-safe:** Direct URL to `/inventory/reconciliation` redirects to `/inventory` when `canInventoryReconcile` is false. API submit still returns 403 if ERP denies.

---

## Related docs

- `docs/PERMISSION_MATRIX.md`
- `docs/ERP_PERMISSION_ALIGNMENT.md`
- `docs/SECURITY_GAPS.md`
- `docs/ERP_RULES.md`

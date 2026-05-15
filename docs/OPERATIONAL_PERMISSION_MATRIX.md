# Operational Permission Matrix

**Version:** 1.0 · May 2026  
**Legend:** **T** = Target policy · **S** = SPA today (approximate) · — = not allowed · R = read · Sb = submit · Ap = approve (ERP workflow / manager)

---

## 1. Routes

| Route | Cashier T/S | Clerk T/S | Purchasing T/S | Store Mgr T/S | Admin T/S |
|-------|-------------|-----------|----------------|---------------|-----------|
| `/login` | T/S | T/S | T/S | T/S | T/S |
| `/pos` | T/S | —/— | —/— | R/—* | —/redirect |
| `/inventory` | —/— | T/S | —/— | R/T† | T/S |
| `/inventory/stock-entry` | — | T/S | — | R/S | T/S |
| `/inventory/transfer` | — | —/cap | — | Ap/S | T/S |
| `/inventory/reconciliation` | — | —/cap | — | Ap/S | T/S |
| `/inventory/ledger` | — | R/S | — | R/S | T/S |
| `/inventory/items` | — | R/S | — | R/S | T/S |
| `/inventory/alerts` | — | R/S | — | R/S | T/S |
| `/inventory/reorder` | — | R/S | — | R/S | T/S |
| `/inventory/batches` | — | R/S | — | R/S | T/S |
| `/inventory/analytics` | — | —/cap | — | T/S | T/S |
| `/inventory/reports` | — | R/S | — | R/S | T/S |
| `/inventory/warehouses` | — | R/S | — | R/S | T/S |
| `/admin/purchasing/*` | — | — | T/S | R/T | T/S |
| `/admin` (dashboard) | — | — | — | T/— | T/S |
| `/admin/products` | — | — | — | R/— | T/S |
| `/admin/inventory` | — | — | — | R/S | T/S |
| `/admin/invoices` (sales) | — | — | — | R/S | T/S |
| `/admin/customers` | — | — | — | R/S | T/S |
| `/admin/users` | — | — | — | —/S | T/S |
| `/admin/settings` | — | — | — | —/S | T/S |
| `/admin/activity` | — | — | — | R/S | T/S |
| `/admin/reports` | — | — | — | R/S | T/S |

\*Store manager POS read: Desk or future read-only POS — not in SPA today.  
†Store manager target admin read; SPA requires `isAdmin` today — **gap**.

**cap** = `InventoryCapabilityRoute` enforces manager caps.

---

## 2. Actions (mutations)

| Action | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|--------|---------|-------|------------|-----------|-------|
| POS checkout | Sb | — | — | — | Sb |
| Open/close shift | Sb | — | — | Verify | Sb |
| Material receipt | — | Sb | — | Ap‡ | Sb |
| Material issue | — | — | — | Ap | Sb |
| Material transfer | — | — | — | Ap | Sb |
| Stock reconciliation | — | — | — | Ap | Sb |
| Purchase receipt | — | — | Sb | Ap‡ | Sb |
| Purchase invoice | — | — | Sb§ | Ap‡ | Sb |
| Link PR → draft PI | — | — | Sb | R | Sb |
| Supplier create/edit | — | — | Sb | Ap | Sb |
| User create/delete | — | — | — | — | Sb |
| Export CSV | — | R | R | R | R |
| Item price edit | — | — | — | — | Desk |

‡Over threshold (e.g. EGP 10,000) — ERP workflow.  
§PI without stock update when PR exists.

---

## 3. Forbidden actions (all roles)

| Action | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|--------|---------|-------|------------|-----------|-------|
| Reconciliation | Yes | Yes | Yes | — | — |
| Stock transfer | Yes | Yes | Yes | — | — |
| PI without supplier | Yes | Yes | — | — | — |
| PR without supplier | Yes | Yes | — | — | — |
| Access `/admin/users` | Yes | Yes | Yes | Yes | — |
| See valuation/cost | Yes | Yes | Partial | — | — |
| Cancel submitted doc in SPA | Yes | Yes | Yes | Desk | Desk |
| Assign System Manager | Yes | Yes | Yes | Yes | Avoid |

---

## 4. Approval requirements

| Trigger | Approver | Channel |
|---------|----------|---------|
| Stock reconciliation (any) | Store Manager | ERP workflow before submit |
| Material issue > X units or value | Store Manager | ERP workflow |
| PR total > threshold | Store Manager | ERP workflow |
| PI total > threshold | Store Manager / Finance | ERP workflow |
| Opening stock reconciliation | Administrator | ERP + written count sheet |
| Customer return | Store Manager | Desk / future SPA |
| POS void after shift close | Store Manager | Desk |
| Price list change | HQ / Admin | ERP Desk |
| User role change | Administrator | ERP Desk |

---

## 5. Warehouse scope

| Role | Read bins | Submit to warehouse | Picker filter (target) |
|------|-----------|---------------------|-------------------------|
| Cashier | POS WH only | POS WH (via invoice) | N/A |
| Clerk | Assigned | Assigned | SPA + ERP |
| Purchasing | Receive WH | Receive WH | SPA + ERP |
| Store Manager | Store all | Store all | SPA + ERP |
| Administrator | Company | Company | ERP |

---

## 6. Pricing visibility

| Data | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|------|---------|-------|------------|-----------|-------|
| POS selling price | Yes | — | — | Yes | Yes |
| `standard_rate` / cost | No | No | Yes | Yes | Yes |
| Valuation on alerts | No | No | Yes | Yes | Yes |
| Inventory value KPI | No | No | Yes | Yes | Yes |
| PR/PI rate entry | No | No | Yes | Yes | Yes |
| Margin on dashboard | No | No | Yes | Yes (label est.) | Yes |

**SPA today:** Clerk valuation hidden via `canInventoryViewValuation`.

---

## 7. Reconciliation rights

| Capability | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|------------|---------|-------|------------|-----------|-------|
| View reconciliation page | No | No | No | Yes | Yes |
| Submit reconciliation | No | No | No | Yes (with workflow) | Yes |
| Opening stock purpose | No | No | No | Approve | Yes |

---

## 8. Reporting & analytics

| Report | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|--------|---------|-------|------------|-----------|-------|
| POS shift metrics | Own shift | — | — | Store | All |
| Inventory analytics page | — | — | — | Yes | Yes |
| Inventory reports | — | Yes | — | Yes | Yes |
| Purchase reports | — | — | Yes | Yes | Yes |
| Admin sales invoices | — | — | — | Yes | Yes |
| Admin dashboard KPIs | — | — | — | Yes | Yes |
| Activity log (SPA) | — | — | — | Yes | Yes |
| ERP P&L / GL | — | — | — | Desk | Desk |

---

## 9. ERPNext role → SPA mapping (target)

| Role profile | ERP roles (examples) | SPA home |
|--------------|---------------------|----------|
| Elmahdi Administrator | System Manager (limited users) | `/admin` |
| Elmahdi Cashier | POS User, Cashier | `/pos` |
| Elmahdi Inventory Clerk | Stock User, Warehouse User | `/inventory` |
| Elmahdi Inventory Manager | Stock Manager, Warehouse Manager | `/inventory` |
| Elmahdi Purchasing Officer | Purchase User, Purchase Manager | `/admin/purchasing` |
| Elmahdi Store Manager | Custom role set | `/admin` (scoped nav) |

---

## Related documents

- [SUPERMARKET_ROLE_MODEL.md](./SUPERMARKET_ROLE_MODEL.md)
- [CASHIER_OPERATIONS.md](./CASHIER_OPERATIONS.md)
- [INVENTORY_OPERATIONS.md](./INVENTORY_OPERATIONS.md)
- [PURCHASING_OPERATIONS.md](./PURCHASING_OPERATIONS.md)
- [STORE_MANAGER_OPERATIONS.md](./STORE_MANAGER_OPERATIONS.md)

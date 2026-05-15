# Inventory Operations

**Roles:** Elmahdi Inventory Clerk · Elmahdi Inventory Manager (stock/warehouse manager)  
**SPA workspace:** `/inventory`  
**Home path:** `/inventory`

---

## Role split

| | Inventory Clerk | Inventory Manager |
|--|-----------------|-------------------|
| ERP roles | Stock User, Warehouse User | Stock Manager, Warehouse Manager |
| Material receipt | Yes | Yes |
| Material issue | No | Yes (with approval policy) |
| Transfer | No | Yes |
| Reconciliation | No | Yes |
| Valuation visible | No | Yes |
| Analytics page | No | Yes |

**Administrator** has full inventory access for support.

---

## Allowed routes (clerk)

| Route | Access |
|-------|--------|
| `/inventory` | Dashboard snapshot |
| `/inventory/warehouses` | Read-only list |
| `/inventory/stock-entry` | Receipt type only (SPA caps) |
| `/inventory/ledger` | Read |
| `/inventory/items` | Read (no cost if clerk) |
| `/inventory/alerts` | Read |
| `/inventory/reorder` | Read |
| `/inventory/batches` | Read |
| `/inventory/reports` | Read / export |

**Forbidden routes (clerk):** `/inventory/transfer`, `/inventory/reconciliation`, `/inventory/analytics`.

**SPA today:** Enforced via `InventoryCapabilityRoute` + stock entry type filter.

---

## Allowed routes (manager)

All clerk routes plus:

| Route | Access |
|-------|--------|
| `/inventory/transfer` | Submit transfers |
| `/inventory/reconciliation` | Submit counts |
| `/inventory/analytics` | Trends, dead stock |

---

## Allowed actions

### Clerk

| Action | ERP document |
|--------|--------------|
| Receive goods (floor/backroom) | Stock Entry — Material Receipt |
| Look up stock by item | Bin / ledger read |
| Export reorder list | CSV |
| Refresh alerts | Bin query |

### Manager

| Action | ERP document |
|--------|--------------|
| All clerk actions | — |
| Issue damaged/expired | Stock Entry — Material Issue |
| Transfer between warehouses | Stock Entry — Material Transfer |
| Post count variances | Stock Reconciliation |
| View valuation & value KPIs | Bin / snapshot |

---

## Forbidden actions (both)

| Action | Reason |
|--------|--------|
| Purchase receipt / invoice | Purchasing role |
| POS checkout | Cashier role |
| User management | Admin |
| Create warehouse in SPA | No UI; Desk only |
| Edit item master / price | Item Manager / HQ |
| Cancel submitted doc in SPA | Desk |
| Opening stock without admin policy | High risk |

---

## Document submit rights

| DocType | Clerk | Manager |
|---------|-------|---------|
| Stock Entry (receipt) | Submit | Submit |
| Stock Entry (issue) | — | Submit* |
| Stock Entry (transfer) | — | Submit* |
| Stock Reconciliation | — | Submit* |
| Purchase Receipt | — | — |

\*Subject to [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md) ERP workflow.

**SPA submit helpers:** `createAndSubmitStockEntry`, `createAndSubmitStockReconciliation`.

---

## Warehouse scope behavior

| Target | Clerk | Manager |
|--------|-------|---------|
| Bin read | Assigned warehouses only | Store warehouses |
| Receipt target WH | Assigned | Store |
| Transfer | — | Within assigned stores |
| Alerts query | Filter by WH picker | All store WH |

**Target implementation:** ERP User Permissions + SPA `warehouseScope` filter on pickers.

**SPA today:** All warehouses in dropdown if ERP returns them — **ERP must restrict**.

---

## Pricing visibility

| Field | Clerk | Manager |
|-------|-------|---------|
| Qty on hand | Yes | Yes |
| `standard_rate` on item detail | No | Yes |
| Valuation on alerts | No | Yes |
| Inventory value KPI | No | Yes |
| Product price column on dashboard | No | Yes |

---

## Reconciliation rights

| | Clerk | Manager |
|--|-------|---------|
| Access page | No | Yes |
| Submit | No | Yes |
| Opening Stock purpose | No | Admin policy |

**Process:** Physical count sheet → manager enters SR → manager approves in workflow → submit.

**SPA gaps:** No delta preview; no submit retry; no activity log on SR.

---

## Stock movement traceability

| Tool | Use |
|------|-----|
| `/inventory/ledger` | Raw SLE list |
| Item details timeline | Per-item history (display categories) |
| ERP Desk Stock Ledger | Authoritative audit |

Clerks use ledger to answer "how much on hand" — not to change history.

---

## Reporting visibility

| Report | Clerk | Manager |
|--------|-------|---------|
| Inventory workspace reports | Yes | Yes |
| Analytics page | No | Yes |
| Admin inventory bin table | No | Yes (if admin access) |
| Shrink / adjustment ERP reports | No | Desk |

---

## Analytics visibility

Managers only: `/inventory/analytics` — top movers, dead stock, value trend.

Clerks: operational lists (alerts, reorder) without financial totals.

---

## Approval requirements

| Action | Clerk | Approver |
|--------|-------|----------|
| Large receipt (pallet) | Enters | Manager if > threshold |
| Any issue/transfer | Cannot | Manager |
| Reconciliation | Cannot | Manager |
| Shrink write-off | — | Manager issue or SR |

---

## Audit logging expectations

| Event | ERP | SPA |
|-------|-----|-----|
| Stock entry submit | Stock Entry + SLE | logActivity STOCK |
| Reconciliation | SR + SLE | **Not logged today** |
| Failed submit | Draft SE/SR | draftName on SE only |

---

## Fraud prevention

- Clerks cannot see cost (reduces collusion with supplier reporting).  
- Clerks cannot reconcile (prevents hiding shrink).  
- Issue/transfer requires manager role in ERP + SPA.  
- Separate clerk and manager ERP logins.  
- Random cycle counts by manager.

---

## Production blockers

| Blocker | Impact |
|---------|--------|
| No warehouse scope in SPA | Wrong WH on receipt |
| SR submit reliability | Orphan drafts |
| No ERP workflow wired | Policy on paper only |
| Clerk can submit issue via API if ERP allows | Bypass SPA |

---

## Related documents

- [INVENTORY_CAPABILITIES.md](./INVENTORY_CAPABILITIES.md)
- [STOCK_SAFETY_AUDIT.md](./STOCK_SAFETY_AUDIT.md)
- [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md)

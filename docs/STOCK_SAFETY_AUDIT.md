# Stock Safety Audit

**Audit date:** May 2026  
**Focus:** Stock correctness, movement traceability, reconciliation, adjustments, warehouse scope.

---

## Risk severity legend

| Level | Meaning |
|-------|---------|
| **Critical** | Likely stock or valuation corruption without ERP hardening |
| **High** | Significant operational or audit risk |
| **Medium** | Mitigated by ERP or partial UI guards |
| **Low** | Minor / display-only |

---

## Stock movement surfaces

### Material Receipt (stock in)

| Item | Assessment |
|------|------------|
| **File** | `StockEntryPage.jsx`, `inventoryApi.createAndSubmitStockEntry` |
| **ERP effect** | Increases `t_warehouse` qty |
| **Validation** | Qty > 0, target warehouse (`validateStockEntry`) |
| **Double submit** | Medium — no `submittingRef`; service retry may re-submit if first PUT succeeded |
| **Warehouse scope** | All warehouses in picker; ERP User Permissions should limit |
| **Batch/expiry** | Not captured on single-line form |
| **Severity** | **Medium** |

### Material Issue (stock out)

| Item | Assessment |
|------|------------|
| **File** | `StockEntryPage.jsx` (type selector) |
| **ERP effect** | Decreases source warehouse |
| **Validation** | `sourceQty` from `getBin` at read time |
| **Race** | **High** — sale at POS between read and submit can cause submit failure or negative stock |
| **SPA guard** | Manager capability required |
| **Severity** | **High** without ERP negative stock block |

### Material Transfer

| Item | Assessment |
|------|------------|
| **Files** | `StockTransferPage.jsx`, Stock Entry transfer type |
| **ERP effect** | Source −, target + |
| **Validation** | Source ≠ target; source qty check |
| **Duplicate UX** | Same operation in two pages — confusion, not data bug |
| **Severity** | **Medium** |

### Stock Reconciliation

| Item | Assessment |
|------|------------|
| **File** | `ReconciliationPage.jsx`, `createAndSubmitStockReconciliation` |
| **ERP effect** | Adjusts ledger to counted qty; affects valuation |
| **Validation gap** | `validateReconciliationLine` unused; no max sanity vs ERP |
| **Submit reliability** | **Critical** — single submit attempt, no `draftName` on failure |
| **Opening Stock purpose** | **High** — can mask historical errors if misused |
| **Manager guard** | SPA route capability only |
| **Severity** | **Critical** (operations + draft orphan risk) |

### POS sale (stock out)

| Item | Assessment |
|------|------------|
| **Files** | `usePOS.js`, `posCheckout.js`, `posStock.js` |
| **ERP effect** | POS Invoice submit → SLE negative qty |
| **Pre-validation** | Cart stock check at checkout |
| **Warehouse** | Fixed to POS Profile warehouse — **correct** |
| **Concurrent sales** | **Medium** — two registers same SKU |
| **Severity** | **Medium** (ERP serializes per item/warehouse at submit) |

### Purchase Receipt (purchasing stock in)

| Item | Assessment |
|------|------------|
| **File** | `ReceiveStockPage.jsx`, `purchasingApi.createAndSubmitPurchaseReceipt` |
| **ERP effect** | Stock + from PR lines |
| **Validation** | `validateReceiveForm`, duplicate line detection |
| **Double submit** | `submittingRef` present |
| **Severity** | **Medium** (PI double-stock if misconfigured — see purchasing doc) |

### Purchase Invoice (stock if update_stock)

| Item | Assessment |
|------|------------|
| **File** | `PurchaseInvoicesPage.jsx` |
| **SPA payload** | No explicit `update_stock`; ERP defaults apply |
| **Risk** | **Critical** if PI updates stock after PR already received |
| **Mitigation** | ERP: disable update stock on PI when using PR; use matching flow only |
| **Severity** | **Critical** (configuration-dependent) |

---

## Inventory adjustments (non-reconciliation)

All adjustments in this SPA are either:

- Stock Entry (receipt/issue/transfer), or
- Stock Reconciliation.

There is **no** Stock Reconciliation alternative via Material Issue for shrink with reason codes. Damaged goods rely on reconciliation purpose text or issue entry.

---

## Valuation-sensitive displays

| Surface | Data | Clerk visibility |
|---------|------|------------------|
| Alerts low-stock table | `valuation_rate` | Hidden without `canInventoryViewValuation` |
| Inventory dashboard | `totalValue`, line price | Hidden for clerks |
| Item details | `standard_rate` | Hidden for clerks |
| Bin API | `valuation_rate` field requested | ERP read permission |

**SPA does not write** valuation — reconciliation may pass `valuation_rate` if added to line objects (currently undefined in page submit).

---

## Warehouse management

| Surface | Behavior |
|---------|----------|
| `WarehousesPage` | Read-only list |
| `inventoryApi.createWarehouse` | API exists; **no UI** |
| Pickers (entry, transfer, reconcile, receive) | `listWarehouses` — full list returned if ERP allows |
| Future | `warehouseScope` in auth (`utils/warehouseScope.js`) — **not loaded from ERP yet** |

**Severity:** **High** for multi-store if ERP permissions are loose.

---

## Stock movement traceability

### Stock Ledger reads

- `listStockLedger` — voucher_type, voucher_no, qty_after_transaction, batch_no.
- Used in ledger page, analytics, movement timeline.

### Timeline categorization (`getItemMovementTimeline`)

| voucher_type pattern | Category |
|---------------------|----------|
| purchase | purchase |
| sales / pos / delivery | sale |
| reconciliation | adjustment |
| stock entry | transfer_in / transfer_out by sign |

**Gaps:**

- Does not surface **cancelled** entries in main ledger query.
- Purchase Return / Sales Return types not explicitly labeled.
- Not a legal audit trail — ERP Desk Stock Ledger is authoritative.

### Local activity log

- Stock mutations log to localStorage (`ActivityType.STOCK` / `ADJUSTMENT`) — not tamper-proof.

---

## Batch / serial integrity

| Feature | Status |
|---------|--------|
| Batch on stock entry lines | Not sent |
| Batch on PR lines | Not sent |
| Batch expiry alerts | Read-only `BatchesPage` |
| FEFO enforcement at POS | No |

**Severity:** **High** for perishables if ERP requires batch on outbound.

---

## Recommended ERP Stock Settings (server)

- [ ] Negative stock: blocked or role-limited
- [ ] Stock reservation for POS (if high concurrency)
- [ ] Batch mandatory for perishable items
- [ ] Stock Reconciliation: approval workflow before submit
- [ ] Separate roles: clerk (Receipt only) vs manager (Reconcile, Issue, Transfer)

---

## Related documents

- [WORKFLOW_INTEGRITY.md](./WORKFLOW_INTEGRITY.md)
- [SUBMIT_FLOW_RISKS.md](./SUBMIT_FLOW_RISKS.md)
- [ERP_TRANSACTION_GAPS.md](./ERP_TRANSACTION_GAPS.md)

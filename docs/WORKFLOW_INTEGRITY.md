# Workflow Integrity — Operational Audit

**Audit date:** May 2026  
**Scope:** Purchase Receipt, Purchase Invoice, Stock Entry, POS checkout, Reconciliation, inventory adjustments, returns (absence).  
**Principle:** ERPNext is the system of record; stock/accounting documents submit via **native `doc.submit()`** (`elmahdi.api.erp_submit`). Never REST `PUT { docstatus: 1 }`. See `docs/ERP_NATIVE_SUBMIT.md`.

---

## Executive summary

Core submit patterns (create → `PUT docstatus: 1` → optional re-fetch) are **consistent** on Stock Entry, Purchase Receipt, Purchase Invoice, and POS Invoice, with **retry loops** on most paths. Gaps cluster around:

- **Reconciliation** (no submit retry, no draft recovery)
- **Purchasing** (PR + standalone PI can diverge from GRNI best practice)
- **Returns** (not implemented)
- **Cancel/amend** (not implemented in SPA)
- **Audit trail** (browser localStorage only for mutations)
- **Race / double-submit** (partial `submittingRef` coverage)

---

## Document lifecycle map (SPA)

| Workflow | DocType | Create | Submit | Retry | Draft on fail | Cancel in SPA |
|----------|---------|--------|--------|-------|---------------|---------------|
| Stock receipt/issue/transfer | Stock Entry | POST | PUT `docstatus:1` | 2× | `draftName` | No |
| Stock count / opening | Stock Reconciliation | POST | PUT `docstatus:1` | **None** | **No** | No |
| Goods receive | Purchase Receipt | POST | PUT `docstatus:1` | 2× | `draftName` | No |
| Supplier bill | Purchase Invoice | POST | PUT `docstatus:1` | 2× | `draftName` | No |
| PR → PI link | Purchase Invoice (draft) | PUT items | — | — | — | No |
| POS sale | POS Invoice | POST | PUT `docstatus:1` | 3× | `invoiceName` recoverable | No |
| POS shift open/close | POS Opening/Closing Entry | POST | PUT submit | Partial | — | No |
| Sales return | — | **Not implemented** | — | — | — | — |

---

## 1. Stock correctness

### Authoritative source

- **Bin / Stock Ledger Entry** on ERPNext server (`inventoryApi.listBins`, `listStockLedger`).
- SPA snapshot (`inventoryService.getInventorySnapshot`) aggregates bins client-side — can be stale vs live checkout.

### Receipt (Material Receipt)

- **Path:** `StockEntryPage` → `createAndSubmitStockEntry` with `Material Receipt`.
- **Validation:** `validateStockEntry` — qty > 0, target warehouse required.
- **Risk:** Bin availability not re-checked at submit; ERP enforces negative stock policy.

### Issue / transfer

- **Paths:** Stock Entry (all types), `StockTransferPage` (dedicated transfer).
- **Validation:** Source qty check vs `getBin` when loaded (`sourceQty`); **time-of-read race** if concurrent sales.
- **Capability:** Issue/transfer restricted to inventory managers in SPA (ERP must mirror).

### Reconciliation

- **Path:** `ReconciliationPage` → `createAndSubmitStockReconciliation`.
- **Semantics:** UI sends **counted qty** per line; ERP computes adjustment vs system (`docs/ERP_RULES.md`).
- **Gaps:** `validateReconciliationLine` **not called** on page; no delta preview (counted − ERP); **Opening Stock** purpose allowed without extra controls.

### POS stock deduction

- **Path:** `checkoutPOSInvoice` → POS Invoice submit → ERP posts stock from line `warehouse` = POS Profile warehouse.
- **Pre-check:** `validateCartStock` / `syncCartStock` before create — reduces but does not eliminate race with parallel registers.

### Traceability

- `getItemMovementTimeline` reads Stock Ledger Entry with `voucher_type` / `voucher_no` — display categorization only.
- Cancelled ledger rows filtered in batch stock helper (`is_cancelled != 1`); main ledger list does not filter cancelled by default.

---

## 2. Purchasing correctness

### Intended ERPNext flow

```text
Supplier → Purchase Receipt (receive, stock+) → Purchase Invoice (payable, link via PI Item.purchase_receipt)
```

### Receive stock (`ReceiveStockPage`)

- `createAndSubmitPurchaseReceipt` — supplier, company, warehouse, lines (item, qty, rate).
- **Submit retry:** yes (`submitDoc`).
- **Double-submit guard:** `submittingRef` on page.
- **Stock:** PR submit increases stock in ERP (standard behavior).

### Purchase invoice (`PurchaseInvoicesPage`)

- `createAndSubmitPurchaseInvoice` — standalone PI; lines may include `warehouse` but **no `purchase_receipt` link** on create.
- **Accounting:** Creates payable immediately on submit.
- **Stock risk:** If ERP **Update Stock** enabled on PI, standalone PI after PR can **double-count stock** (receive twice). SPA does not set `update_stock` explicitly — **site default applies**.

### Invoice matching (`InvoiceMatchingPage`)

- `linkReceiptToInvoice` — appends PI lines from PR with `purchase_receipt` + `pr_detail` — **correct ERP pattern**.
- Only works on **draft** PI (`docstatus === 0`); submitted PI requires Desk amend/cancel.
- Manual invoice name entry — typo risk; no autocomplete of draft PIs.

### Billing status

- Dashboard uses `per_billed` on PR list — not `purchase_invoice` on PR header (correct per `ERP_RULES.md`).

---

## 3. POS / sales invoice lifecycle

### Checkout sequence

1. Shift must be open (`usePOS.checkout`).
2. Cart stock validation.
3. `createAndSubmitPOSInvoiceOnServer(payload)` — `elmahdi.api.pos_checkout.create_and_submit_pos_invoice` (ERPNext `insert()` + `submit()`, not REST docstatus PUT).
4. Server verifies Stock Ledger Entry rows when stock items were sold.
5. `logActivity` local sale entry.

### Failure recovery

- Submit failure sets `pendingInvoice` + `recoverable` error.
- **Retry submit** — `recoverPendingInvoice` → `retrySubmitPOSInvoice`.
- **Dismiss** — clears cart, keeps draft/submitted ambiguity in ERP; **does not cancel** draft POS Invoice in ERP.

### Pricing

- Rates from catalog at add-to-cart (`standard_rate` / Item Price via `posApi`).
- No manager override UI; tampered API payload possible if ERP does not validate price list.

### Returns

- **Not implemented.** `InvoicesPage` displays status `Return` for sales invoices but no SPA return/credit note flow.

---

## 4. Reconciliation integrity

| Control | Status |
|---------|--------|
| Manager-only route guard | Yes (inventory capabilities) |
| Show ERP qty before count | Yes (`getBin` per line) |
| Validate non-negative count | Partial (HTML `min="0"` only) |
| `validateReconciliationLine` used | **No** |
| Submit retry + draft recovery | **No** |
| Purpose "Opening Stock" restricted | **No** |
| Post-submit audit (ERP Version) | Not in SPA |

---

## 5. Confirmations & validations matrix

| Action | Client validation | User confirm | Submit guard |
|--------|-------------------|--------------|--------------|
| PR receive | `validateReceiveForm` | No | `submittingRef` |
| PI create | `validatePurchaseInvoiceForm` | No | `submittingRef` |
| Stock entry | `validateStockEntry` | No | **No ref** |
| Stock transfer | `validateStockEntry` | No | **No ref** |
| Reconciliation | Minimal | No | **No ref** |
| POS checkout | Stock + shift | No | `checkoutLoading` |
| User delete | — | `confirm` | — |
| Link PR→PI | Supplier match | No | — |

---

## 6. Auditability

| Layer | Mechanism | Grade |
|-------|-----------|-------|
| ERP | Version, Stock Ledger, GL entries | Authoritative (if permissions) |
| SPA | `logActivity` → localStorage | Convenience only |
| SPA | Optional ERP Activity Log read | Partial (`ActivityLogPage`) |
| Purchasing/Stock errors | `draftName` / `invoiceName` in error | Good when implemented |

---

## 7. ERPNext submit/cancel semantics (SPA usage)

| docstatus | Meaning | SPA |
|-----------|---------|-----|
| 0 | Draft | Created on POST failures |
| 1 | Submitted | Target of all write flows |
| 2 | Cancelled | **Never set by SPA** |

**Cancel / amend:** Operators must use ERPNext Desk. SPA does not expose cancel, amend, or credit note flows.

---

## Related documents

- [STOCK_SAFETY_AUDIT.md](./STOCK_SAFETY_AUDIT.md)
- [SUBMIT_FLOW_RISKS.md](./SUBMIT_FLOW_RISKS.md)
- [ERP_TRANSACTION_GAPS.md](./ERP_TRANSACTION_GAPS.md)
- [ERP_RULES.md](./ERP_RULES.md)
- [INVENTORY_CAPABILITIES.md](./INVENTORY_CAPABILITIES.md)

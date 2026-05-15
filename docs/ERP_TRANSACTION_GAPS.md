# ERP Transaction Gaps

**Audit date:** May 2026  
**Focus:** Accounting consistency, missing workflows, ERP permission alignment, audit gaps, returns, cancel/amend.

---

## Accounting & purchasing consistency

### GRNI / three-way match

| Step | SPA support | ERP expectation |
|------|-------------|-----------------|
| Purchase Order | **No** | Optional in ERP |
| Purchase Receipt | Yes (`ReceiveStockPage`) | Stock + GRNI |
| Purchase Invoice | Yes (standalone + link) | Payable |
| PR → PI link | Yes (`InvoiceMatchingPage`) | `Purchase Invoice Item.purchase_receipt` |

### Double stock / double payable risks

| Scenario | Stock | Payable |
|----------|-------|---------|
| PR submitted, PI linked via matching | Once from PR | Once on PI submit |
| PR submitted, standalone PI same items | **Twice if PI update_stock** | Once on PI |
| PI without PR | Once if update_stock | Once |
| PI rate ≠ PR rate | Valuation drift | Supplier balance per PI |

**SPA does not set:**

- `update_stock` on Purchase Invoice
- `against_expense_account` / expense accounts
- Tax templates

**All accounting defaults are ERP site configuration.**

### Company resolution

- `resolveCompany` — first company from `getCompanies({ limit: 1 })` when not passed.
- **Risk:** Wrong company on multi-company sites.

**Severity:** **High** (multi-company)

---

## Returns workflows

| Return type | SPA | ERP DocType |
|-------------|-----|-------------|
| Customer return / POS return | **Not implemented** | Sales Invoice (is_return) / Delivery Note |
| Supplier return | **Not implemented** | Purchase Return / Debit Note |
| Credit note UI | **Not implemented** | Payment Entry reversal in ERP |

`InvoicesPage` displays sales invoice `status` including `Return` — **read-only** from ERP.

**Cashier safety:** Cannot process returns in SPA — must use Desk (good for control if policy requires manager; bad for throughput if needed).

---

## Invoice lifecycle gaps

### Sales / POS

| Stage | Supported |
|-------|-----------|
| Create + submit | Yes |
| Print receipt | Thermal component |
| List history | POS page invoice list / admin sales invoices |
| Cancel | No |
| Return | No |
| Credit note | No |
| Amend | No |

### Purchase

| Stage | Supported |
|-------|-----------|
| PR create + submit | Yes |
| PI create + submit | Yes |
| Link PR to draft PI | Yes |
| PI submit after link | Manual in ERP or separate submit tab |
| Cancel PR/PI | No |
| Debit note | No |

---

## ERPNext submit / cancel semantics

### What SPA does

- Only promotes documents to **submitted** (`docstatus: 1`).
- Never sets `docstatus: 2` (cancelled).
- Never calls `frappe.client.cancel` or amend endpoints.

### Operator playbook (required)

| Situation | ERPNext action |
|-----------|----------------|
| Wrong stock entry submitted | Cancel Stock Entry (if allowed) or reverse entry |
| Wrong reconciliation | Cancel Stock Reconciliation |
| Draft orphan in SPA | Open doc in Desk → submit or delete |
| POS pending invoice | Find POS Invoice → submit or cancel |
| Posted PI wrong | Cancel/amend PI per policy |

---

## Missing auditability

| Event | SPA record | ERP record |
|-------|------------|------------|
| POS sale | localStorage | POS Invoice, GL, SLE |
| Stock entry | localStorage | Stock Entry, SLE |
| Reconciliation | **None** | Stock Reconciliation, SLE |
| PR / PI | localStorage | PR/PI, GL |
| User delete | None | User doc change |
| Failed submit | Error UI | Draft doc may exist |

**Compliance:** Rely on ERP **Version** + **Activity Log** + **Stock Ledger** — configure read access for managers.

`fetchERPActivityLogs` — optional merge on activity page; not tied to mutations.

---

## Missing rollback in SPA

No APIs wrapped for:

- `cancel` doc
- `amend` doc
- `delete` draft (except User delete)
- Payment Entry reversal
- Stock Entry cancellation

**By design** for pilot simplicity — increases Desk dependency.

---

## ERP permission assumptions (by workflow)

### Purchase Receipt

| Permission | Required |
|------------|----------|
| Purchase Receipt | Create, Submit |
| Item | Read |
| Warehouse | Read |
| Supplier | Read |

### Purchase Invoice

| Permission | Required |
|------------|----------|
| Purchase Invoice | Create, Submit |
| Purchase Invoice Item | Read (matching child query) |
| Item, Supplier | Read |

### Stock Entry

| Permission | Required |
|------------|----------|
| Stock Entry | Create, Submit |
| Bin | Read (for availability display) |

### Stock Reconciliation

| Permission | Required |
|------------|----------|
| Stock Reconciliation | Create, Submit |
| Bin | Read |

### POS Invoice

| Permission | Required |
|------------|----------|
| POS Invoice | Create, Submit |
| POS Profile | Read |
| Item Price | Read |
| Bin | Read (POS warehouse) |
| POS Opening Entry | Create, Submit |

---

## Configuration gaps (ERP site — not in repo)

| Setting | Impact |
|---------|--------|
| **Update Stock on Purchase Invoice** | Duplicate stock with PR |
| **Allow negative stock** | Issue/transfer/POS oversell |
| **Perpetual inventory** | GL stock accounts |
| **Default company** | All auto-resolved docs |
| **POS Profile** per store | Wrong warehouse/prices |
| **Approval workflow** on SR/PI | Not used by SPA |

---

## Purchasing ↔ inventory integration

```text
ReceiveStockPage (PR) ──► stock +
         │
         ▼ (optional)
InvoiceMatchingPage ──► draft PI lines + purchase_receipt
         │
         ▼
Desk or PurchaseInvoicesPage ──► PI submit ──► payable (+ stock if misconfigured)
```

**Best practice (ERP):**

1. Always receive with PR first.
2. Create PI from PR (matching) or with **Update Stock = No**.
3. Do not use standalone PI tab for received goods unless PI does not update stock.

---

## Priority remediation (code — future, not this audit)

| Priority | Item |
|----------|------|
| P0 | Reconciliation: submit retry + `draftName` + use `validateReconciliationLine` |
| P0 | Reconciliation: logActivity + delta preview before confirm |
| P1 | `submittingRef` on StockEntry, StockTransfer, Reconciliation |
| P1 | PI create: default `update_stock: 0` or force link-from-PR workflow |
| P1 | Re-fetch bin qty immediately before issue/transfer submit |
| P2 | POS dismiss → link to Desk or cancel draft API |
| P2 | Returns workflow (Sales Invoice return) — product decision |
| P2 | Load warehouse User Permissions into `warehouseScope` |
| P3 | Multi-line stock entry per document |

---

## Related documents

- [WORKFLOW_INTEGRITY.md](./WORKFLOW_INTEGRITY.md)
- [STOCK_SAFETY_AUDIT.md](./STOCK_SAFETY_AUDIT.md)
- [SUBMIT_FLOW_RISKS.md](./SUBMIT_FLOW_RISKS.md)
- [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md)
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)

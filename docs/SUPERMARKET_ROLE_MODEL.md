# Supermarket Operational Role Model

**Version:** 1.0 (May 2026)  
**System:** Elmahdi ERP SPA + ERPNext (Frappe)  
**Purpose:** Define how a real supermarket operates through this application — not a generic ERP desk replacement.

---

## Design principles

1. **ERPNext is authoritative** for submit, cancel, stock ledger, GL, and pricing validation.
2. **SPA expresses policy** via routes, capabilities, and UX — never as the only security layer.
3. **Separation of duties** — cashier cannot adjust stock, reconcile, or see costs; clerks cannot buy or sell on behalf of the business without scope.
4. **Fail closed** — ambiguous roles deny high-risk actions.
5. **Audit on ERP** — local SPA activity log is convenience only; compliance uses ERP Version, Activity Log, Stock Ledger.

---

## Role catalog (five operational personas)

| Role | ERP profile name (recommended) | Primary workspace | Count per store (typical) |
|------|-------------------------------|-------------------|---------------------------|
| **Administrator** | Elmahdi Administrator | `/admin` + break-glass inventory/purchasing | 1–2 IT/back office |
| **Cashier** | Elmahdi Cashier | `/pos` | 4–20 registers |
| **Inventory Clerk** | Elmahdi Inventory Clerk | `/inventory` | 2–6 |
| **Purchasing Officer** | Elmahdi Purchasing Officer | `/admin/purchasing` | 1–2 |
| **Store Manager** | Elmahdi Store Manager | `/admin` (limited) + oversight | 1 per store |

**Not a daily role in SPA:** Accountant (ERP Desk GL), HQ merchandising (Item/Price bulk), auditor (read-only export).

---

## Authority hierarchy

```text
                    ┌─────────────────┐
                    │  Administrator   │  IT, user lifecycle, company config
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌─────────────┐  ┌──────────────┐
     │Store Manager│  │ Purchasing  │  │  (oversight) │
     └──────┬──────┘  └─────────────┘  └──────────────┘
            │
     ┌──────┴──────┐
     ▼             ▼
┌─────────┐  ┌──────────────┐
│ Cashier │  │Inventory Clerk│
└─────────┘  └──────────────┘
```

**Store Manager** approves exceptions; does not replace ERP workflow engine for all docs.

---

## Cross-role matrix (summary)

See [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md) for the full grid.

| Dimension | Cashier | Inv. Clerk | Purchasing | Store Mgr | Admin |
|-----------|---------|------------|--------------|-----------|-------|
| POS sell | Yes | No | No | Read/oversee | Optional |
| Stock receipt | No | Yes | No | Approve large | Yes |
| Stock issue/transfer | No | No* | No | Approve | Yes |
| Reconciliation | No | No | No | Approve | Yes |
| PR receive | No | No | Yes | Approve large | Yes |
| PI / payables | No | No | Yes | Approve large | Yes |
| Returns | Desk+policy | No | Supplier Desk | Approve | Yes |
| Pricing view (cost) | No | No | Yes | Yes | Yes |
| User management | No | No | No | No | Yes |
| Analytics | No | No | Reports | Yes | Yes |

\*Clerk may **request** shrink via manager; no issue/transfer in SPA.

---

## Warehouse scope (all roles)

| Role | Target behavior |
|------|-----------------|
| Cashier | **Single warehouse** — POS Profile warehouse only (stock read for that site) |
| Inventory Clerk | **Assigned warehouses** — ERP User Permissions; pickers filtered |
| Purchasing Officer | Receive warehouse(s) for store + backroom |
| Store Manager | All store warehouses |
| Administrator | All company warehouses (or company-wide if HQ) |

**SPA today:** `warehouseScope.allowedWarehouses = null` — lists unfiltered; **ERP User Permissions must enforce**.

---

## Document submit rights (target)

| DocType | Cashier | Clerk | Purchasing | Store Mgr | Admin |
|---------|---------|-------|------------|-----------|-------|
| POS Invoice | Submit | — | — | — | Yes |
| POS Opening/Closing | Submit | — | — | Verify | Yes |
| Stock Entry (receipt) | — | Submit | — | — | Yes |
| Stock Entry (issue/transfer) | — | — | — | Approve workflow | Yes |
| Stock Reconciliation | — | — | — | Approve workflow | Yes |
| Purchase Receipt | — | — | Submit | Approve threshold | Yes |
| Purchase Invoice | — | — | Submit* | Approve threshold | Yes |
| Sales Return | — | — | — | Approve | Yes |
| User | — | — | — | — | Create/disable |

\*PI submit with **Update Stock = No** when PR exists.

---

## Return / cancel policy (target)

| Action | Cashier | Others |
|--------|---------|--------|
| POS sale void (same day, same shift) | Manager PIN / Desk | — |
| Customer return (stock back) | **Not in SPA** — Desk or future Return flow with manager | Clerk receives; Manager approves |
| Cancel submitted PR/PI | No | Manager + Desk |
| Cancel Stock Reconciliation | No | Manager + Desk |
| Cancel POS Invoice draft | Retry/dismiss only today | Desk cancel |

**SPA today:** No return or cancel APIs — see [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md).

---

## Audit logging expectations

| Event | ERP (required) | SPA (optional) |
|-------|----------------|----------------|
| POS sale | POS Invoice, GL, SLE | localStorage sale |
| Shift open/close | POS Opening/Closing | — |
| Stock movement | Stock Entry / SR, SLE | localStorage stock |
| Purchase | PR, PI, GL | localStorage purchase |
| Reconciliation | SR, SLE | **should log** (gap today) |
| Failed submit | Draft doc exists | Show draft name |
| User change | User Version | — |
| Price change | Item Price Version | — |

**Retention:** ERP indefinite; SPA localStorage **not** compliance-grade.

---

## Role-specific guides

| Document | Audience |
|----------|----------|
| [CASHIER_OPERATIONS.md](./CASHIER_OPERATIONS.md) | Front register |
| [INVENTORY_OPERATIONS.md](./INVENTORY_OPERATIONS.md) | Stock team |
| [PURCHASING_OPERATIONS.md](./PURCHASING_OPERATIONS.md) | Buyers |
| [STORE_MANAGER_OPERATIONS.md](./STORE_MANAGER_OPERATIONS.md) | Store lead |
| [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md) | Approvals & exceptions |

---

## Production blockers (model vs reality)

| # | Blocker | Impact |
|---|---------|--------|
| P0 | Returns not in SPA | Cashiers use Desk; inconsistent policy |
| P0 | No ERP cancel from SPA | Orphan drafts; manager must use Desk |
| P0 | PI can duplicate stock (site config) | Fraud / inventory corruption |
| P0 | Reconciliation no submit retry / audit | Orphan SR drafts |
| P1 | Purchasing role mapped; admin still overused | Buyers get System Manager |
| P1 | Warehouse scope not loaded in SPA | Cross-store picker risk |
| P1 | User create without role profile | Access sprawl |
| P2 | No approval workflow integration | Policy only on paper |
| P2 | Activity log localStorage only | Weak fraud investigation in SPA |
| P2 | Estimated dashboard profit | Misleading manager KPIs |

---

## Missing backend enforcement (SPA)

| Control | Target | SPA today |
|---------|--------|-----------|
| Role-based routes | Per matrix | Partial (inventory caps, purchasing route) |
| Fail-closed auth | No inference | **Gap** — inference fallback still in code |
| POS role allowlist | Cashier roles only | **Gap** — Profile/Website Manager in POS_ROLES |
| User admin page | Admin only | All `isAdmin` |
| Price override at POS | ERP validates | No UI; API tampering possible |
| `update_stock` on PI | Explicit false | Not set in payload |
| Submit idempotency | Ref guards all forms | Partial |
| ERP Activity Log on mutate | Server | Client localStorage only |

---

## Missing ERPNext role mappings

| ERP role | Should map to SPA | Current |
|----------|-------------------|---------|
| Elmahdi Cashier | POS | POS User, Cashier |
| Elmahdi Inventory Clerk | Inventory clerk caps | Stock User, Warehouse User |
| Elmahdi Inventory Manager | Manager inventory caps | Stock Manager, Warehouse Manager |
| Elmahdi Purchasing Officer | `/admin/purchasing` | Purchase User/Manager |
| Elmahdi Store Manager | Manager admin read + approvals | **No dedicated flag** |
| System Manager | Administrator only | Used for everyone |

**Action:** Create **Role Profiles** in ERP; never assign raw System Manager to store staff.

---

## Dangerous operational gaps

1. **Standalone PI after PR** — double stock and payables.  
2. **Reconciliation by any inventory user** — mitigated in SPA for managers only; ERP must deny clerks.  
3. **Dismiss POS pending invoice** — draft invoice in ERP, cart cleared.  
4. **No shift variance workflow** — closing entry without cash count discipline (process).  
5. **Shared register login** — audit attribution to wrong user (process + ERP user on shift).  
6. **Delete user in SPA** — irreversible.

---

## Implementation roadmap (documentation only)

| Phase | Deliverable |
|-------|-------------|
| 1 | ERP Role Profiles + User Permissions (warehouse, price list) |
| 2 | SPA route matrix matches this model (guards, nav filter) |
| 3 | ERP workflows: SR, PI, large PR |
| 4 | Returns MVP (Sales Invoice return) with manager gate |
| 5 | `warehouseScope` from ERP boot |
| 6 | Server-side audit webhook / Activity Log write |

---

## Related documents

- [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md)
- [PERMISSION_MATRIX.md](./PERMISSION_MATRIX.md) — technical SPA guards
- [INVENTORY_CAPABILITIES.md](./INVENTORY_CAPABILITIES.md)
- [WORKFLOW_INTEGRITY.md](./WORKFLOW_INTEGRITY.md)
- [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md)

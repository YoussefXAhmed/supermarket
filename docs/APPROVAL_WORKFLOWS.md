# Approval Workflows

**Version:** 1.0 · May 2026  
**Scope:** Supermarket operational policy for exceptions, high-risk actions, returns, and cancellations.  
**Implementation:** Primarily **ERPNext Workflow** + manager Desk actions; SPA enforces route access only unless noted.

---

## Approval principles

1. **Maker ≠ checker** for stock valuation and payables.  
2. **Threshold-based** — daily receipts/issues below X EGP may auto-submit; above requires approval.  
3. **Documented evidence** — count sheets for reconciliation; supplier delivery note for PR.  
4. **Time-bound** — same-day POS voids vs next-day returns follow different paths.  
5. **ERP audit trail** is the legal record; manager approval in SPA (future) must write to ERP Comment/Workflow.

---

## High-risk actions requiring approval

| Action | Default clerk/cashier | Approver | ERP mechanism |
|--------|----------------------|----------|----------------|
| Stock Reconciliation (any line) | Cannot submit | Store Manager | Workflow on Stock Reconciliation |
| Opening Stock purpose | Blocked | Administrator | Role + workflow |
| Material Issue > 50 units or EGP 5,000 | Cannot submit | Store Manager | Workflow on Stock Entry |
| Material Transfer between stores | Cannot submit | Store Manager | Workflow |
| Purchase Receipt > EGP 25,000 | Submit blocked | Store Manager | Workflow on PR |
| Purchase Invoice > EGP 25,000 | Submit blocked | Store Manager + Finance | Workflow on PI |
| PI without linked PR (update_stock off) | Purchasing manager | Store Manager | Policy + random audit |
| Customer return | Not in SPA | Store Manager | Sales Invoice return (Desk) |
| POS invoice cancel after submit | Not in SPA | Store Manager | Cancel/amend SI in Desk |
| Discount > 10% (future) | Blocked | Store Manager | ERP pricing rule |
| User role assignment | N/A | Administrator | User doc |

*Thresholds are configurable per company — values above are defaults for documentation.*

---

## Stock adjustment approvals

### Types

| Type | Tool | Clerk | Manager |
|------|------|-------|---------|
| Damaged / expired write-off | Material Issue or SR | Request | Approve issue or SR |
| Cycle count variance | Stock Reconciliation | No access | Count + approve SR |
| Found stock (overage) | SR or Material Receipt | Receipt only | Approve SR if large |
| Store transfer | Material Transfer | No | Approve |
| Opening balance | SR (Opening Stock) | No | Admin only |

### Target workflow

```text
Clerk (optional) → Manager creates SR draft → Count sheet attached (ERP Comment)
    → Manager review delta → Submit SR → SLE posted
```

**SPA today:** Manager submits SR immediately from `/inventory/reconciliation` — **no draft review step, no workflow hook**.

### Fraud controls

- Compare SR delta value to shrink budget (ERP report).  
- Flag items with margin impact.  
- Ban same user creating and submitting SR (ERP workflow role separation).

---

## Purchasing approvals

### Receive (Purchase Receipt)

| Step | Actor | System |
|------|-------|--------|
| Delivery arrives | Clerk verifies qty (optional) | — |
| Buyer enters PR | Purchasing Officer | SPA Receive |
| Match delivery note | Buyer | ERP attachment (Desk) |
| Over threshold | Store Manager | ERP approve PR |
| Submit | ERP | Stock + |

### Invoice (Purchase Invoice)

| Step | Actor | System |
|------|-------|--------|
| Bill received | Purchasing Officer | SPA PI or Desk |
| Match to PR | Purchasing Officer | Matching page → draft PI |
| Three-way match | Manager | PR qty = PI qty = delivery |
| Submit PI | ERP | Payable (no stock if configured) |

**Critical:** **Update Stock on PI = No** when stock already received on PR.

---

## Cashier shift workflow (approval touchpoints)

| Event | Approval |
|-------|----------|
| Shift open | None (opening float counted) |
| Mid-shift price override | Manager (future) |
| Checkout | None if stock OK |
| Shift close | Manager reviews variance report (process) |
| Cash short > EGP 100 | Manager sign-off on closing entry |

See [CASHIER_OPERATIONS.md](./CASHIER_OPERATIONS.md).

---

## Return workflows

### Customer return (target)

| Step | Actor | Channel |
|------|-------|---------|
| Customer presents receipt | Cashier | — |
| Verify sale within policy (7 days, condition) | Cashier | — |
| Manager authorization | Store Manager | PIN / Desk |
| Create return invoice | Manager or trained cashier | ERP Desk (future SPA) |
| Stock back | Auto via return SI | ERP SLE + |
| Refund | Payment Entry reversal | ERP |

**SPA today:** **Not implemented.** Cashier must escalate to Desk.

### Supplier return (target)

| Actor | Channel |
|-------|---------|
| Purchasing Officer | Purchase Return in Desk |
| Store Manager | Approve if value > threshold |

---

## Invoice cancellation policy

### POS Invoice (sales)

| State | Who can act | Action |
|-------|-------------|--------|
| Draft (docstatus 0) | Cashier / system | Submit or cancel in Desk |
| Submitted same shift, no payment issue | Store Manager | Cancel/amend per ERP policy |
| Submitted prior day | Store Manager + Admin | Credit note / return invoice |
| Paid card | Finance | Refund via payment gateway process |

**SPA pending invoice:** Retry submit or Desk cancel draft — **Dismiss does not cancel ERP doc**.

### Purchase Receipt / Purchase Invoice

| State | Actor | Action |
|-------|-------------|--------|
| Draft | Purchasing Officer | Edit/delete in Desk |
| Submitted | Store Manager | Cancel only with reason (ERP); stock reversal |
| Paid | Finance | Debit note |

**SPA:** No cancel API — Desk only.

### Stock documents

| DocType | Cancel policy |
|---------|---------------|
| Stock Entry | Manager+ within same day; else reversing entry |
| Stock Reconciliation | Avoid cancel; prefer reversing SR |

---

## Audit logging expectations (approvals)

| Event | Log to ERP |
|-------|------------|
| Workflow state change | Workflow history |
| Manager approve | Version + Comment |
| Return authorized | Comment on SI with reason code |
| Cancel document | Version with cancel reason |
| Failed SPA submit | Draft doc name in user chat + ERP draft |

---

## SPA vs ERP responsibility

| Approval type | SPA (future) | ERP (required now) |
|---------------|--------------|-------------------|
| Route access | Yes | — |
| Submit permission | Partial | Yes |
| Workflow before submit | No | Yes |
| Threshold rules | No | Yes (Workflow / Script) |
| Return/cancel | No | Yes |

---

## Related documents

- [SUPERMARKET_ROLE_MODEL.md](./SUPERMARKET_ROLE_MODEL.md)
- [WORKFLOW_INTEGRITY.md](./WORKFLOW_INTEGRITY.md)
- [SUBMIT_FLOW_RISKS.md](./SUBMIT_FLOW_RISKS.md)

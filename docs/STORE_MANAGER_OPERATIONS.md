# Store Manager Operations

**Role:** Elmahdi Store Manager  
**ERP profile:** Store Manager composite — Stock Manager, Purchase Manager (approve), Sales Manager (returns), limited Accounts read  
**SPA access:** **Target:** dedicated store-manager bucket; **Today:** often mapped to `admin` or dual inventory + purchasing + POS

---

## Mission

Run one supermarket location: approve exceptions, control shrink, authorize returns, review cash and purchasing, and **not** perform day-to-day cashier checkout as primary duty.

---

## Allowed routes (target model)

| Area | Routes |
|------|--------|
| Store overview | `/admin` dashboard (scoped) or future `/store` |
| POS (supervisory) | `/pos` read-only or void mode (Desk today) |
| Inventory | Full `/inventory` including transfer, reconciliation, analytics |
| Purchasing | `/admin/purchasing` approve/monitor |
| Reports | Store-scoped reports |
| Users | **No** (escalate to HQ Admin) |

**SPA today:** Store Manager often has `isAdmin` → entire `/admin` including users/settings — **over-privileged for production**.

---

## Allowed actions

| Category | Actions |
|----------|---------|
| Approvals | SR, large SE, PR/PI over threshold, returns, voids |
| Inventory | All manager inventory actions |
| Purchasing | Approve PR/PI; override matching exceptions |
| POS | Review shift close; authorize return (Desk) |
| Reporting | Store P&L snapshot, shrink, sales by category |
| Staff | Assign shifts (process); not ERP user create |

---

## Forbidden actions

| Action | Reason |
|--------|--------|
| Create System Manager users | HQ IT |
| Change company / fiscal year | Admin |
| Global price list edit | HQ merchandising |
| Delete audit logs | Compliance |
| Own checkout as primary cashier | Segregation (policy) |

---

## Document submit rights

| DocType | Submit | Cancel |
|---------|--------|--------|
| Stock Reconciliation | Yes | Desk with reason |
| Stock Entry (all types) | Yes | Desk |
| Purchase Receipt / Invoice | Approve/submit per policy | Desk |
| POS Invoice return | Desk | Desk |
| Payment Entry | No (Finance) | No |

---

## Warehouse scope behavior

- **All warehouses** for assigned store(s) via ERP User Permissions.  
- Can transfer between store backroom and floor.  
- Cannot post to warehouses outside store without HQ approval.

**SPA:** Manager sees full warehouse pickers; filtering must come from ERP.

---

## Pricing visibility

| Visible |
|---------|
| Retail prices |
| Cost / valuation on inventory |
| Purchase rates on PI |
| Margin estimates on reports |

---

## Reconciliation rights

**Primary owner** of cycle counts and shrink posting.

| Responsibility | Detail |
|----------------|--------|
| Schedule counts | Weekly high-shrink SKUs |
| Approve SR | After count sheet |
| Investigate variance | Ledger + CCTV process |
| Cap shrink % | Escalate to HQ if over budget |

---

## Reporting visibility

| Report | Access |
|--------|--------|
| Store sales summary | Yes |
| Inventory value / dead stock | Yes |
| Cashier Z vs closing | Yes |
| Company-wide multi-store | HQ only |
| Payroll | No |

---

## Analytics visibility

Full store analytics: inventory analytics page, admin reports where scoped, purchasing spend.

---

## Approval requirements (manager as approver)

See [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md) — manager is default approver for:

- Stock reconciliation  
- Large material issue / transfer  
- High-value PR/PI  
- Customer returns and post-submit voids  
- Cash shortage sign-off  

**Maker-checker:** Manager should not approve own SR if they entered counts alone — second person or HQ audit.

---

## Cashier shift oversight

| Task | Frequency |
|------|-----------|
| Review POS Closing vs cash count | Daily |
| Investigate voids/returns | Daily |
| Spot-check high-value baskets | Weekly |
| Rotate cashier registers | Policy |

No SPA "manager dashboard" for POS today — use ERP POS reports + process.

---

## Return workflows (manager)

| Step | Action |
|------|--------|
| Verify receipt | Policy window |
| Authorize | Desk or future PIN |
| Create return SI | ERP |
| Refund | Payment reversal |

---

## Audit logging expectations

Manager actions on sensitive docs must leave ERP trail:

- Workflow approval comment  
- Reason code on cancel/return  
- Version history on SR/PI

SPA `logActivity` should record manager approvals when SPA approval UI exists.

---

## Dangerous operational gaps (store manager)

| Gap | Impact |
|-----|--------|
| `isAdmin` = full users/settings | Fraud / misconfiguration |
| No store-manager SPA role | Wrong nav surface |
| Returns only on Desk | Slow, inconsistent |
| No approval UI in SPA | ERP-only policy |
| Manager can reconcile without workflow | Single-person fraud |

---

## Production blockers

1. **Split Store Manager from Administrator** in `capabilities.js` and `ProtectedRoute`.  
2. **ERP User Permissions** per store warehouse set.  
3. **Workflow** on SR, PR, PI before production go-live.  
4. **Returns** path documented and trained (Desk until SPA).  
5. **Remove** Store Manager from default `isAdmin` mapping.

---

## Missing ERPNext role mappings

| Target SPA role | Suggested ERP roles |
|-----------------|---------------------|
| `store_manager` (new) | Stock Manager, Purchase Manager, Sales Manager, Reports Manager |
| Exclude | System Manager, User Manager, Accounts Manager |

Create **Elmahdi Store Manager** role in ERP with module profile matching above.

---

## Related documents

- [SUPERMARKET_ROLE_MODEL.md](./SUPERMARKET_ROLE_MODEL.md)
- [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md)
- [SECURITY_GAPS.md](./SECURITY_GAPS.md)
- [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md)

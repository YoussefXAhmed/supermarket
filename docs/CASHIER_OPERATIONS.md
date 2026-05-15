# Cashier Operations

**Role:** Elmahdi Cashier  
**ERP profile:** POS User, Cashier (only — no Profile Manager / Website Manager)  
**SPA workspace:** `/pos` only  
**Home path:** `/pos`

---

## Mission

Fast, accurate checkout with **no access** to costs, stock adjustments, purchasing, or admin data.

---

## Allowed routes

| Route | Purpose |
|-------|---------|
| `/login` | Sign in |
| `/pos` | Register workspace |

**Forbidden:** `/admin`, `/inventory`, `/admin/purchasing`.

**SPA today:** `ProtectedRoute require="pos"`; admins redirected to `/admin`. Inventory users see Stock link on POS if dual-role — **avoid dual roles on cashiers**.

---

## Allowed actions

| Action | Detail |
|--------|--------|
| Open shift | POS Opening Entry — float count |
| Close shift | POS Closing Entry |
| Search / scan items | Catalog for POS Profile price list |
| Add to cart | Qty within available stock (client check) |
| Checkout | Create + submit POS Invoice |
| Split payment | Cash + card if equals total |
| View shift sales | Metrics on POS (own shift) |
| Retry failed submit | `recoverPendingInvoice` |
| Print receipt | Thermal receipt |
| Logout | End session |

---

## Forbidden actions

| Action | Why |
|--------|-----|
| Change item price | Fraud / margin |
| Discount % (no UI today) | Policy |
| Material receipt / issue | Stock fraud |
| Reconciliation | Valuation fraud |
| View sales invoice list (admin) | PII / revenue leak |
| View customers master (admin) | PII |
| Export data | Exfiltration |
| Access purchasing | Payables fraud |
| Create users | IT privilege |
| Cancel submitted invoice in SPA | Not implemented — manager Desk |
| Dismiss pending without Desk cleanup | Leaves draft invoice |

---

## Shift workflow (standard day)

```text
1. Login → land on /pos
2. Load POS Profile (warehouse + price list + company)
3. Start Shift — enter opening cash float
4. Sell loop:
     scan/search → add cart → checkout → receipt
5. End of shift:
     Close Shift → closing entry
6. Manager reviews:
     cash count vs system sales (process / Desk)
7. Logout
```

### Controls per step

| Step | Control |
|------|---------|
| Profile load | One profile per register (localStorage) |
| Start shift | Required before checkout (`usePOS`) |
| Add cart | `canAddToCart`, `validateCartStock` |
| Checkout | `set_warehouse` from profile; rates from catalog |
| Close | Closing entry submitted in ERP |

---

## Document submit rights

| DocType | Submit | Cancel |
|---------|--------|--------|
| POS Opening Entry | Yes | Desk |
| POS Invoice | Yes | Desk |
| POS Closing Entry | Yes | Desk |
| Stock Entry | No | No |
| Sales Return | No (target: manager Desk) | No |

---

## Warehouse scope

- **Read stock:** POS Profile warehouse only (`posApi` bin read).  
- **Sell from:** Same warehouse on every line.  
- **Cannot** select other warehouses.

---

## Pricing visibility

| Visible | Hidden |
|---------|--------|
| Shelf/POS selling price | `standard_rate`, valuation |
| Line total | Cost, margin |
| Payment total | Company dashboard |

**ERP must reject** submitted rates not on active price list.

---

## Return workflows

| Scenario | Cashier | Escalation |
|----------|---------|--------------|
| Customer return with receipt | Cannot process in SPA | Call Store Manager |
| Wrong item rung | Void before payment complete | Clear cart |
| After submit | — | Manager Desk return/credit |
| Exchange | — | Manager |

**Target (future):** Return mode with manager PIN — not in product yet.

---

## Reconciliation / inventory

**No rights.** If asked to "fix stock," escalate to inventory clerk or manager.

---

## Reporting visibility

| Report | Access |
|--------|--------|
| Shift metrics on POS | Own session |
| Admin dashboard | No |
| Inventory reports | No |
| Purchase reports | No |

---

## Analytics visibility

None.

---

## Approval requirements

| Situation | Approver |
|-----------|----------|
| Checkout blocked (out of stock) | Inventory clerk or manager adjusts stock |
| Payment mismatch | Cashier fixes split |
| Submit failed | Retry; if persists, manager |
| Return | Manager |
| Void after submit | Manager |
| Cash drawer shortage | Manager sign-off |

---

## Audit logging expectations

| Event | ERP | SPA |
|-------|-----|-----|
| Each sale | POS Invoice submitted | `logActivity` SALE |
| Shift open/close | POS Opening/Closing | — |
| Failed checkout | Draft POS Invoice possible | pending invoice state |

**Cashier accountability:** ERP `owner` on invoice = logged-in user; **no shared accounts**.

---

## Fraud prevention checklist

- [ ] Unique ERP user per cashier  
- [ ] No System Manager role  
- [ ] POS Profile locked to store warehouse  
- [ ] Negative stock blocked or manager-approved  
- [ ] Price list = retail list only  
- [ ] Camera on high-shrink items (process)  
- [ ] Manager reviews Z-report vs closing entry daily  

---

## SPA gaps (cashier-specific)

| Gap | Risk |
|-----|------|
| No returns in SPA | Desk inconsistency |
| Dismiss pending invoice | Orphan draft |
| Dual role inventory+POS | Stock menu on POS |
| Broad POS_ROLES in code | Wrong ERP roles get POS |
| No manager PIN on void | — |

---

## Related documents

- [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md)
- [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md)
- [WORKFLOW_INTEGRITY.md](./WORKFLOW_INTEGRITY.md)

# Purchasing Operations

**Roles:** Elmahdi Purchasing Officer · Elmahdi Purchasing Manager (optional)  
**ERP profiles:** Purchase User, Purchase Manager  
**SPA workspace:** `/admin/purchasing`  
**Home path:** `/admin/purchasing` (or first purchasing route)

---

## Mission

Receive supplier goods, match invoices to receipts, maintain supplier master data, and **never double-post stock** on purchase invoice when receipt already posted.

---

## Allowed routes

| Route | Purpose |
|-------|---------|
| `/admin/purchasing` | Purchasing home / dashboard |
| `/admin/purchasing/suppliers` | Supplier list |
| `/admin/purchasing/suppliers/:id` | Supplier detail |
| `/admin/purchasing/invoices` | Purchase invoice list |
| `/admin/purchasing/receive` | Purchase receipt (goods in) |
| `/admin/purchasing/matching` | PR ↔ PI matching |

**Forbidden (purchasing role):** Full `/admin` dashboard, users, settings, POS, inventory write (unless dual-role).

**SPA today:** `ProtectedRoute require="purchasing"` under `AdminLayout purchasingWorkspace`.

---

## Allowed actions

| Action | Channel |
|--------|---------|
| Create supplier | SPA / ERP |
| Edit supplier | SPA / ERP |
| Create purchase receipt | Receive page |
| Submit purchase receipt | ERP submit |
| Create purchase invoice from PR | Matching page |
| Submit purchase invoice | ERP submit |
| View supplier balance / history | Detail page |
| Export supplier/invoice lists | Toolbar |

---

## Forbidden actions

| Action | Who blocks |
|--------|------------|
| POS checkout | Route guard |
| Stock reconciliation | Inventory role |
| User/role management | Admin only |
| Change retail selling price | Item Manager |
| Cancel submitted PI/PR in SPA | Not implemented |
| Pay supplier (Payment Entry) | Accounts role (Desk) |
| Approve own PO above limit | Workflow (target) |

---

## Document submit rights

| DocType | Purchasing Officer | Purchasing Manager | Store Manager |
|---------|-------------------|---------------------|---------------|
| Supplier | Create/edit | Create/edit | Read |
| Purchase Order | Create/submit* | Approve* | Approve* |
| Purchase Receipt | Create/submit | Create/submit | Approve if > threshold |
| Purchase Invoice | Create/submit | Create/submit | Approve if > threshold |
| Payment Entry | No | No | No |

\*If PO workflow enabled in ERP.

**SPA services:** `purchasingApi.js` — receipt and invoice create/submit.

---

## Warehouse scope behavior

| Document | Warehouse field |
|----------|-----------------|
| Purchase Receipt | Target warehouse per line |
| Purchase Invoice | Should mirror PR warehouse if update_stock |

**Policy:** Receipt posts stock; PI should have **`update_stock: 0`** when linked to submitted PR.

**SPA gap:** Confirm PI payload sets `update_stock: 0` — documented in SUBMIT_FLOW_RISKS / ERP_TRANSACTION_GAPS.

**Scope:** Purchasing users see warehouses allowed by ERP User Permissions for their company/store.

---

## Pricing visibility

| Visible | Hidden |
|---------|--------|
| Supplier buying rate on PR/PI | Retail margin analytics (unless admin) |
| Invoice totals | POS shift cash |
| Last purchase rate on item | Employee payroll |

Purchasing needs **cost** visibility; not **store valuation dashboards** unless dual-role manager.

---

## Return / cancel permissions

| Scenario | SPA | ERP Desk |
|----------|-----|----------|
| Cancel draft PR/PI | Limited | Yes |
| Cancel submitted PR | No | Manager + reason |
| Cancel submitted PI | No | Manager / Finance |
| Purchase Return | No | Purchasing + Manager |

See [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md).

---

## Reconciliation rights

Purchasing does **not** perform stock reconciliation. If qty mismatch:

1. Fix on next PR or adjustment via **inventory manager** (SR or issue).  
2. Document on supplier account (debit note) via Desk.

---

## Reporting visibility

| Report | Access |
|--------|--------|
| Purchase invoice list | Yes |
| Supplier outstanding | Detail page |
| Admin sales dashboard | No |
| Inventory valuation | No (unless dual-role) |
| GRNI / accrual reports | Desk / future |

---

## Analytics visibility

Operational only: supplier spend trends if exposed on purchasing pages. No store-wide BI unless Store Manager / Admin role.

---

## Approval requirements

| Trigger | Approver |
|---------|----------|
| PR value > EGP 25,000 | Store Manager |
| PI without PR | Purchasing Manager + Store Manager |
| New supplier (first PO) | Store Manager |
| Price variance vs last PO > X% | Purchasing Manager |

ERP Workflow is authoritative; SPA does not gate submit by amount today.

---

## Receive workflow (standard)

```text
1. Delivery note arrives at back door
2. Clerk may count (optional) — no ERP submit
3. Purchasing Officer opens Receive
4. Select supplier → items → qty → warehouse
5. Save + Submit Purchase Receipt → stock increases
6. Supplier invoice arrives
7. Matching page: select PR → generate PI draft
8. Verify rates, taxes, qty
9. Submit PI (update_stock = 0 if stock from PR)
10. Accounts pays via Payment Entry (Desk)
```

---

## Invoice matching workflow

| Step | System |
|------|--------|
| List open PRs | Matching page |
| Select PR | Load lines |
| Create PI | `purchasingApi` |
| Line match | Qty/rate from PR |
| Submit | ERP |

**Three-way match (target):** PO (if used) + PR + PI — enforce in ERP before payment.

---

## Fraud prevention

- Separate purchasing login from receiving clerk where possible.  
- Manager spot-checks high-value PR against delivery note photo.  
- No PI stock update when PR already posted.  
- Block duplicate PR for same delivery (ERP duplicate check / process).  
- Supplier bank details change only via admin Desk.

---

## Audit logging expectations

| Event | ERP | SPA |
|-------|-----|-----|
| PR submit | Version + SLE | Activity log (if wired) |
| PI submit | Version + payable | Activity log |
| Failed submit | Draft doc | Error card |

**Gap:** Purchasing submit may lack `submittingRef` / draft recovery parity with inventory.

---

## Missing backend enforcement

| Gap | Risk |
|-----|------|
| PI `update_stock` not forced off | Double stock |
| No amount-based workflow in SPA | Policy bypass via API |
| Purchasing role may still access `/admin` if `isAdmin` | Over-privilege |
| Cancel not in SPA | Desk-only inconsistency |

---

## Missing ERPNext role mappings

| SPA bucket | ERP roles needed |
|------------|------------------|
| `purchasing` | Purchase User, Purchase Manager |
| Not mapped | Accounts User for payments (Desk only) |

Remove accidental **System Manager** or **Stock Manager** from purchasing-only users.

---

## Related documents

- [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md)
- [ERP_TRANSACTION_GAPS.md](./ERP_TRANSACTION_GAPS.md)
- [OPERATIONAL_PERMISSION_MATRIX.md](./OPERATIONAL_PERMISSION_MATRIX.md)

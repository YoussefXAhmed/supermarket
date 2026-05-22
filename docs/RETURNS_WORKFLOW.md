# Returns & Refund Workflow

**Phase 1 — Customer returns against submitted POS Invoices**  
_Merged from: `RETURNS_ERP_FLOW.md` + `RETURNS_CAPABILITY_MATRIX.md` + `RETURNS_PHASE1_SUMMARY.md`_

---

## Delivered (Phase 1)

| Layer | Files |
|-------|--------|
| ERP API | `src/services/returnsApi.js` |
| Orchestration | `src/services/returnsService.js` |
| Validation | `src/utils/returnsValidation.js` |
| Capabilities | `src/auth/capabilityProfiles.js`, `src/auth/capabilities.js` |
| UI | `src/modules/returns/ReturnsPage.jsx`, route `/admin/returns` |

---

## Capability matrix

| Capability | Cashier | Store Manager | Administrator | Purchasing | Inventory |
|------------|---------|---------------|---------------|------------|-----------|
| `canViewReturns` | ✓ | ✓ | ✓ | — | — |
| `canCreateReturns` | ✓ (draft) | ✓ | ✓ | — | — |
| `canApproveReturns` | — | ✓ (submit) | ✓ | — | — |

**Route:** `/admin/returns` requires `canViewReturns`.

**Enforcement:**
- UI: `CapabilityRoute`, disabled form controls, hidden approve table
- Service: `approveAndSubmitReturn` only invoked when `canApproveReturns`; ERP enforces submit

---

## Workflow steps

1. **Load** submitted POS Invoice (`docstatus = 1`, `is_return = 0`)
2. **Validate** return lines against sold qty and prior returns
3. **Create draft** via ERP `make_sales_return` (fallback: manual `is_return = 1` payload)
4. **Audit** stored in ERP `remarks` (`Elmahdi-Return-Audit` block)
5. **Refund payments** set from ERP `grand_total` after save — not browser-calculated
6. **Approve & submit** (manager/admin only) → `docstatus = 1` → ERP stock reversal

---

## ERP document shape

**DocType:** `POS Invoice` with:
- `is_return = 1`
- `return_against = <original POS Invoice>`
- Line `qty` negative (ERP sales return convention)
- `docstatus = 1` on submit → stock ledger reversal via ERPNext

### Preferred API

```
POST /api/method/erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return
{ "source_name": "POS-INV-..." }
```

Returns a draft return document mapped from the source. SPA then patches `items` for partial qty and `remarks` for audit.

### Fallback

If `make_sales_return` is unavailable, SPA posts a new POS Invoice with `is_return: 1` and negative line qty.

### Submit

```
PUT /api/resource/POS Invoice/{name}
{ "docstatus": 1 }
```

---

## Audit trail

Encoded in `remarks`:
```
Elmahdi-Return-Audit; reason=...; refund_method=...; operator=...; status=pending_approval|submitted; approved_by=...
```

Plus standard ERP fields: `owner`, `creation`, `return_against`, `set_warehouse`, `payments`, `grand_total`.

---

## Security controls

- No return without `return_against` source invoice
- Return qty ≤ remaining sold qty (aggregates existing returns)
- Warehouse must match source `set_warehouse`
- Cashier cannot submit (UI + service throws if extended without cap)
- No client-side refund total authority

---

## Out of scope (Phase 2+)

See `archive/RETURNS_NEXT_PHASE.md` for planned enhancements:
- ERP custom fields (`elmahdi_return_reason`, etc.)
- POS inline return shortcut
- Server-side capability check in `elmahdi` app
- Print return receipt / credit note
- Phase 3: supplier purchase returns

---

## Related documents

- [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md)
- [CASHIER_OPERATIONS.md](./CASHIER_OPERATIONS.md)
- [ERP_TRANSACTION_GAPS.md](./ERP_TRANSACTION_GAPS.md)
- [testing/RETURNS_PRODUCTION_BLOCKERS.md](../testing/RETURNS_PRODUCTION_BLOCKERS.md)
- [testing/RETURNS_REMAINING_GAPS.md](../testing/RETURNS_REMAINING_GAPS.md)

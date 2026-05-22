# Returns & Refund — Phase 1 Summary

## Delivered

| Layer | Files |
|-------|--------|
| ERP API | `src/services/returnsApi.js` |
| Orchestration | `src/services/returnsService.js` |
| Validation | `src/utils/returnsValidation.js` |
| Capabilities | `src/auth/capabilityProfiles.js`, `src/auth/capabilities.js` |
| UI | `src/modules/returns/ReturnsPage.jsx`, route `/admin/returns` |
| Plan | `docs/returns_workflow_phase1_implementation_plan.md` |

## Workflow

1. **Load** submitted POS Invoice (`docstatus = 1`, `is_return = 0`).
2. **Validate** return lines against sold qty and prior returns.
3. **Create draft** via ERP `make_sales_return` (fallback: manual `is_return = 1` payload).
4. **Audit** stored in ERP `remarks` (`Elmahdi-Return-Audit` block).
5. **Refund payments** set from ERP `grand_total` after save — not browser-calculated.
6. **Approve & submit** (manager/admin only) → `docstatus = 1` → ERP stock reversal.

## Capabilities

| Role | View | Create draft | Approve/submit |
|------|------|--------------|----------------|
| Cashier | ✓ | ✓ | — |
| Store Manager | ✓ | ✓ | ✓ |
| Administrator | ✓ | ✓ | ✓ |
| Purchasing / Inventory | — | — | — |

## Security controls

- No return without `return_against` source invoice
- Return qty ≤ remaining sold qty (aggregates existing returns)
- Warehouse must match source `set_warehouse`
- Cashier cannot submit (UI + service throws if extended without cap)
- No client-side refund total authority

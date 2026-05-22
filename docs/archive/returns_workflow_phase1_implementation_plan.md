# Returns & Refund Workflow — Phase 1 Implementation Plan

## Scope

Customer returns against **submitted POS Invoices** using ERPNext-native **Sales Return** mechanics (`is_return = 1`, `return_against`, submit for stock reversal). SPA does not compute stock or refund totals as authority.

## Phase A — Service layer

- `returnsApi.js` — ERP HTTP (fetch source, list returns, `make_sales_return`, create/update/submit)
- `returnsService.js` — orchestration, normalization, audit remarks, activity log
- Fail-closed errors from ERP propagated via `errorHandling`

## Phase B — Validation

- `returnsValidation.js` — source eligibility, qty caps, duplicate returns, warehouse match, refund method/reason required
- Validation runs before draft create and before submit

## Phase C — Capabilities

| Capability | Cashier | Store Manager | Admin |
|------------|---------|---------------|-------|
| `canViewReturns` | ✓ | ✓ | ✓ |
| `canCreateReturns` | ✓ (draft) | ✓ | ✓ |
| `canApproveReturns` | — | ✓ (submit) | ✓ |

## Phase D — UI

- `/admin/returns` — lookup invoice, line qty, reason, refund method, draft / approve submit
- Reuse `FormPageLayout`, `LayoutSection`, `PageHeader`, existing table styles

## Audit fields (mandatory)

Stored in ERP `remarks` block + standard doc fields: `owner`, `return_against`, `set_warehouse`, `posting_date`, payments from ERP `grand_total` after save.

## Out of scope (Phase 2+)

- Supplier returns
- POS inline return UX
- ERP custom fields / server scripts
- Email notifications

# Returns Capability Matrix (Phase 1)

| Capability | Cashier | Store Manager | Admin | Purchasing | Inventory |
|------------|---------|---------------|-------|------------|-----------|
| `canViewReturns` | ✓ | ✓ | ✓ | — | — |
| `canCreateReturns` | ✓ | ✓ | ✓ | — | — |
| `canApproveReturns` | — | ✓ | ✓ | — | — |

**Route:** `/admin/returns` requires `canViewReturns`.

**Enforcement:**

- UI: `CapabilityRoute`, disabled form controls, hidden approve table
- Service: `approveAndSubmitReturn` should only be invoked when `canApproveReturns` (caller responsibility; ERP still enforces submit)

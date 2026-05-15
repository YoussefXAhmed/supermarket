# Capability Matrix (SPA)

**Authority:** ERPNext Role Profile + roles → `deriveCapabilities()` → explicit boolean flags.

| Capability | Cashier | Inventory Clerk | Purchasing | Store Manager | Administrator |
|------------|---------|-----------------|------------|---------------|---------------|
| **POS** | | | | | |
| `canViewPOS` | ✓ | — | — | ✓ (monitor) | ✓ |
| `canOperatePOS` | ✓ | — | — | — | ✓ |
| `canManageShift` | ✓ | — | — | — | ✓ |
| `canViewInvoices` | ✓ | — | — | ✓ | ✓ |
| **Inventory** | | | | | |
| `canAccessInventory` | — | ✓ | — | ✓ | ✓ |
| `canInventoryReceipt` | — | ✓ | — | ✓ | ✓ |
| `canInventoryTransfer` | — | — | — | ✓ | ✓ |
| `canInventoryReconcile` | — | — | — | ✓ | ✓ |
| `canInventoryAnalytics` | — | — | — | ✓ | ✓ |
| `canInventoryValuation` | — | — | — | ✓ | ✓ |
| **Purchasing** | | | | | |
| `canAccessPurchasing` | — | — | ✓ | ✓ | ✓ |
| `canApprovePurchasing` | — | — | — | ✓ | ✓ |
| `canViewSuppliers` | — | — | ✓ | ✓ | ✓ |
| **Management** | | | | | |
| `canAccessAdminWorkspace` | — | — | — | ✓ | ✓ |
| `canViewReports` | — | — | — | ✓ | ✓ |
| `canMonitorCashiers` | — | — | — | ✓ | ✓ |
| `canApproveReturns` | — | — | — | ✓ | ✓ |
| `canApproveReconciliation` | — | — | — | ✓ | ✓ |
| `canViewAnalytics` | — | — | — | ✓ | ✓ |
| **Administration** | | | | | |
| `canManageUsers` | — | — | — | — | ✓ |
| `canManageSettings` | — | — | — | — | ✓ |
| `canManageSystem` | — | — | — | — | ✓ |

**Profile precedence:** When `role_profile_name` is an Elmahdi template (`Elmahdi Cashier`, etc.), profile caps override raw ERP role names (fixes Sales Manager → POS operate leak).

**Legacy aliases (deprecated):** `isAdmin` = `canManageSystem`, `isPOS` = `canOperatePOS`, `isManager` = `isStoreManager`.

# Route → Capability Map

| Route | Guard | Required capability |
|-------|--------|---------------------|
| `/login` | public | — |
| `/pos` | `ProtectedRoute` `pos` | `canViewPOS` |
| `/inventory/*` | `ProtectedRoute` `inventory` | `canAccessInventory` |
| `/inventory/transfer` | `InventoryCapabilityRoute` | `canInventoryTransfer` |
| `/inventory/reconciliation` | `InventoryCapabilityRoute` | `canInventoryReconcile` |
| `/inventory/analytics` | `InventoryCapabilityRoute` | `canInventoryAnalytics` |
| `/admin/purchasing/*` | `ProtectedRoute` `purchasing` | `canAccessPurchasing` |
| `/admin` | `ProtectedRoute` `admin` | `canAccessAdminWorkspace` |
| `/admin/products` | `CapabilityRoute` | `canManageSystem` |
| `/admin/users` | `CapabilityRoute` | `canManageUsers` |
| `/admin/settings` | `CapabilityRoute` | `canManageSettings` |
| `/admin/reports` | nav + parent guard | `canViewReports` |
| `/admin/invoices` | nav + parent guard | `canViewReports` |
| `/admin/customers` | nav + parent guard | `canViewReports` |
| `/admin/activity` | nav + parent guard | `canViewReports` |

**POS UI (not routes):**

| Action | Capability |
|--------|------------|
| Sell / checkout / cart | `canOperatePOS` |
| Start / end shift | `canManageShift` |
| Invoice list (monitor) | `canViewPOS` + `canViewInvoices` |

**Home redirect (`homePathFromCapabilities`):**

1. `canManageSystem` → `/admin`
2. `canOperatePOS` → `/pos`
3. `canAccessInventory` → `/inventory`
4. `canAccessPurchasing` → `/admin/purchasing`
5. `canAccessAdminWorkspace` → `/admin`

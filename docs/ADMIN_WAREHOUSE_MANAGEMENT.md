# Admin Warehouse Management

**Version:** 1.0 · May 2026  
**Route:** `/admin/warehouses`  
**SPA modules:** `AdminWarehousesPage`, `warehouseAdminApi.js`, `warehouseAdminService.js`

---

## Features

| Feature | Description |
|---------|-------------|
| **List** | All ERP warehouses (groups + leaf), with optional stock qty summary from Bin |
| **Search** | Name, ERP ID, company, type, parent |
| **Filters** | Company, warehouse type, status (active / disabled / groups) |
| **Create** | Warehouse name, company, parent, type, is group, disabled |
| **Edit** | Display name, type, parent, disabled |
| **Disable / Enable** | Toggle `disabled` on Warehouse (archive) |
| **Delete** | Only when ERP-safe checks pass |
| **Export** | CSV via shared ExportToolbar |
| **Toasts** | Success / error via NotificationProvider |

Inventory clerks and cashiers **do not** see this page in the admin sidebar.

---

## ERP behavior

- All reads/writes use standard Frappe REST:
  - `GET/POST /api/resource/Warehouse`
  - `PUT /api/resource/Warehouse/{name}`
  - `DELETE /api/resource/Warehouse/{name}`
- **No `ignore_permissions`** — ERPNext role permissions apply.
- **Company** is required on create (from Company list).
- **Parent warehouse** optional; group warehouses can be parents.
- **Disabled** (`disabled = 1`) blocks new stock transactions in ERPNext while preserving history.

Stock summary on the list is **informational** (sum of `Bin.actual_qty` per warehouse). It is not a substitute for ERP stock reports.

---

## Deletion safety rules

Deletion is **not** offered when any of the following is true:

| Check | Reason shown |
|-------|----------------|
| Child warehouses exist | Reassign or remove children first |
| `Bin.actual_qty` sum &gt; 0 | Stock on hand must be zero |
| Stock Ledger Entry exists | Historical ledger — use **Disable** instead |

Only **empty, unused** leaf warehouses with no ledger history may be deleted.

On blocked delete, the UI recommends **Disable** as the ERP-safe archive path.

---

## Permissions matrix

| Persona | Sidebar link | Route access |
|---------|--------------|--------------|
| **Administrator** (System Manager) | Yes | Yes (`canManageSystem`) |
| **Store Manager** (profile only) | No | No |
| **Store Manager** + System Manager role | Yes | Yes |
| **Inventory Clerk** | No | No |
| **Cashier** | No | No |
| **Purchasing Officer** | No | No |

Route guard: `CapabilityRoute cap="canManageSystem"`.

ERP-side: user must also hold ERPNext permissions to create/read/write/delete **Warehouse** (typically System Manager or custom role with Warehouse rights).

---

## Related docs

- [WAREHOUSE_PERMISSION_FLOW.md](./WAREHOUSE_PERMISSION_FLOW.md) — operational user warehouse scoping
- [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md) — warehouse assignment at provisioning
- [ROUTE_CAPABILITY_MAP.md](./ROUTE_CAPABILITY_MAP.md) — SPA route guards

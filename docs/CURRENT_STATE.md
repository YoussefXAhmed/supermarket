# Current State — Implementation Status

**Audit date:** May 2026  
**Build:** `npm run build` succeeds (Vite 5, ~165 chunks, lazy routes).

---

## Completed (working in codebase)

### Infrastructure
- [x] Vite + React 18 SPA, lazy routes (`src/App.jsx`)
- [x] ERP URL centralization (`src/config/erp.js`, `src/utils/erpLinks.js`)
- [x] Axios client + error normalization (`src/services/api.js`, `src/utils/errorHandling.js`)
- [x] Cookie auth + role capabilities (`src/context/AuthContext.jsx`, `ProtectedRoute.jsx`)
- [x] Notification toasts (`src/context/NotificationContext.jsx`)
- [x] Activity log (local + optional ERP merge) — `activityLogService.js`, `/admin/activity`
- [x] Export utilities — `src/utils/export.js`, `exportCsv.js`, `ExportToolbar.jsx`
- [x] Layout system CSS + components (`layout-system.css`, `page-layouts/PageLayouts.jsx`)

### Admin (`/admin`)
- [x] Dashboard KPIs + trend chart + partial data warnings — `DashboardPage.jsx`
- [x] Products grid (read-only list) — `ProductsPage.jsx` *(legacy layout)*
- [x] Sales invoices table — `InvoicesPage.jsx` *(layout shell)*
- [x] Customers, users, settings, reports (ERP link cards)
- [x] Activity log page — `ActivityLogPage.jsx`
- [x] Simple bin table — `admin/InventoryPage.jsx` *(legacy layout)*

### Inventory (`/inventory`)
- [x] Retail dashboard + KPI cards + product table — `inventory/InventoryPage.jsx` *(DashboardLayout)*
- [x] Stock entry, transfer, reconciliation forms — `pages/StockEntryPage.jsx`, etc. *(FormPageLayout)*
- [x] Stock ledger, reorder, warehouses, batches, alerts — mixed layout status
- [x] Analytics + inventory reports — `AnalyticsPage.jsx`, `ReportsPage.jsx`
- [x] Item details (basic) — `ItemDetailsPage.jsx` *(legacy cards, no Item Price)*

### Purchasing (`/admin/purchasing`)
- [x] Dashboard + workflow bar — `PurchasingDashboardPage.jsx`
- [x] Suppliers list + supplier detail form — `SuppliersPage.jsx`, `SupplierDetailPage.jsx`
- [x] Receive stock (PR submit) — `ReceiveStockPage.jsx`
- [x] Purchase invoices list/create tabs — `PurchaseInvoicesPage.jsx`
- [x] Invoice matching — `InvoiceMatchingPage.jsx` + `purchasingService.js`
- [x] Purchase reports + export — `PurchaseReportsPage.jsx`
- [x] Safe PR list fields — `purchasingQueryUtils.js` (`PURCHASE_RECEIPT_LIST_FIELDS`)

### POS (`/pos`)
- [x] Shift, catalog, cart, checkout, barcode hook — `POSPage.jsx`, `usePOS.js`, `posApi.js`
- [x] Thermal receipt component — `POSThermalReceipt.jsx`
- [x] Full-width layout (by design)

---

## In progress / partial

| Area | Status | Evidence |
|------|--------|----------|
| **Layout system rollout** | ~50% of module pages | 14 files import `page-layouts`; 14 still use bare `<div>` + `card panel` |
| **Enterprise density** | Applied on migrated pages only | `dense`, `compact` tables inconsistent |
| **Export/print** | Present on some pages | `ExportToolbar` on activity, purchase reports; inventory reports use `exportCsv` only |
| **Item Details upgrade** | **Not in repo** | No `itemDetailService.js`, `item-details.css`, or pricing sidebar |
| **Purchasing data resilience** | Partial | `PartialDataBanner` on dashboard/reports/matching; not everywhere |

---

## Known bugs / risks (from code review)

1. **Purchase Receipt list** — Must not request `purchase_invoice` on PR list API (fixed via `PURCHASE_RECEIPT_LIST_FIELDS`); regression breaks purchasing dashboard.
2. **Invoice matching** — Depends on `Purchase Invoice Item.purchase_receipt` child reads; empty if ERP permissions deny child table.
3. **Dashboard profit KPI** — Estimated margin %, not GL (`api.js` dashboard stats) — misleading if labeled as accounting profit.
4. **Activity log** — Browser `localStorage` can be cleared/tampered; not audit-grade.
5. **Admin on POS route** — Admins redirected away from `/pos` (`ProtectedRoute`); cashiers cannot access admin without separate login.
6. **Large list caps** — `listBins({ limit: 800 })` on alerts may miss rows or stress ERP.

---

## Technical debt

- Duplicate formatters: local `fmt` in many pages vs `src/utils/format.js`
- Duplicate inventory entry points: `admin/InventoryPage.jsx` vs `inventory/InventoryPage.jsx`
- No automated tests (`package.json` has no `test` script)
- No TypeScript
- No API response caching / deduplication
- `inventoryService.getItemMovementTimeline` — transfer categorization simplified; sale color in timeline was blue in old `MovementTimeline` (green purchase / red sale requested in spec but not fully applied in `admin.css`)
- Git status at project start showed optional print hooks (`usePrint.js`, `print/`) — **not present in current tree**; print via `export.js` / ERP desk links only

---

## UX / layout inconsistencies

**Migrated to `page-layouts`:**  
`DashboardPage`, `ActivityLogPage`, `InvoicesPage`, `InventoryPage` (workspace), `StockEntryPage`, `StockTransferPage`, `ReconciliationPage`, `StockLedgerPage`, `ReorderPage`, `PurchasingDashboardPage`, `SuppliersPage`, `ReceiveStockPage`, `PurchaseReportsPage`, `AnalyticsPage`.

**Still legacy layout (`<div>` root + `card panel`):**  
`ProductsPage`, `admin/InventoryPage`, `CustomersPage`, `UsersPage`, `SettingsPage`, `ReportsPage` (admin), `ItemDetailsPage`, `AlertsPage`, `BatchesPage`, `WarehousesPage`, `ReportsPage` (inventory), `SupplierDetailPage`, `PurchaseInvoicesPage`, `InvoiceMatchingPage`.

**Intentional exceptions:** `LoginPage`, `POSPage`.

---

## Missing ERP / business workflows (not implemented in SPA)

- Goods receipt without purchase order (only ad-hoc PR form)
- Purchase order lifecycle
- Delivery note / pick list
- Credit notes, returns at POS (partially depends on ERP config)
- Multi-company / multi-store switching in UI
- Price list selector in admin (POS uses profile price list)
- GRNI / full accounts payable aging in SPA
- Manufacturing, assets, payroll, HR
- User permission management (only basic user create/delete in `UsersPage`)
- Arabic / RTL UI
- Offline POS

---

## Current stabilization priorities

1. Complete layout migration (see `UI_RULES.md`).
2. Item Details production page (pricing, sidebar, timeline density).
3. Standardize loading/error/empty on all list pages.
4. ERP permission matrix documented per role.
5. Pilot deployment checklist (`PRODUCTION_READINESS.md`).

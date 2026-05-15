# Known Issues — Automated & Manual Audit

**Generated from repository scan (May 2026).** Re-run grep after major refactors.

---

## Layout inconsistencies

### Pages **without** `page-layouts` (legacy `div` + `card panel`)

| File | Route |
|------|-------|
| `src/modules/admin/ProductsPage.jsx` | `/admin/products` |
| `src/modules/admin/InventoryPage.jsx` | `/admin/inventory` |
| `src/modules/admin/CustomersPage.jsx` | `/admin/customers` |
| `src/modules/admin/UsersPage.jsx` | `/admin/users` |
| `src/modules/admin/SettingsPage.jsx` | `/admin/settings` |
| `src/modules/admin/ReportsPage.jsx` | `/admin/reports` |
| `src/modules/inventory/pages/ItemDetailsPage.jsx` | `/inventory/items` |
| `src/modules/inventory/pages/AlertsPage.jsx` | `/inventory/alerts` |
| `src/modules/inventory/pages/BatchesPage.jsx` | `/inventory/batches` |
| `src/modules/inventory/pages/WarehousesPage.jsx` | `/inventory/warehouses` |
| `src/modules/inventory/pages/ReportsPage.jsx` | `/inventory/reports` |
| `src/modules/purchasing/SupplierDetailPage.jsx` | `/admin/purchasing/suppliers/:id` |
| `src/modules/purchasing/PurchaseInvoicesPage.jsx` | `/admin/purchasing/invoices` |
| `src/modules/purchasing/InvoiceMatchingPage.jsx` | `/admin/purchasing/matching` |

### Pages **with** layout shells (reference)

`DashboardPage`, `ActivityLogPage`, `InvoicesPage`, `inventory/InventoryPage`, `StockEntryPage`, `StockTransferPage`, `ReconciliationPage`, `StockLedgerPage`, `ReorderPage`, `PurchasingDashboardPage`, `SuppliersPage`, `ReceiveStockPage`, `PurchaseReportsPage`, `AnalyticsPage`.

### Other layout notes

- `SupplierDetailPage` uses `stats-grid` but not `DashboardLayout`.
- `ActivityLogPage` uses `TablePageLayout` without `tableConstrain` for sparse logs.
- Duplicate inventory UX: admin bin table vs inventory workspace dashboard.

---

## Duplicated logic

| Pattern | Locations |
|---------|-----------|
| Currency `fmt` inline | `InvoicesPage`, `PurchaseInvoicesPage`, `InvoiceMatchingPage`, `SupplierDetailPage`, `POSPage`, `POSThermalReceipt`, … |
| EGP string concat | `ProductsPage`, `ItemDetailsPage`, `AlertsPage`, `ReportsPage`, `admin/InventoryPage` |
| Item price resolution | `api.withResolvedItemPrices`, `posApi.attachPrices` (not shared util) |
| ERP list + table page pattern | Copy-pasted across 20+ pages |
| Dashboard stats / warnings | Similar partial-load pattern in admin + purchasing dashboards |

**Mitigation:** use `fmtCurrency` / `fmtNumber` from `src/utils/format.js`; extract `loadTablePage` hook when touching files.

---

## Risky API calls

| Risk | File | Detail |
|------|------|--------|
| High bin limit | `AlertsPage.jsx` | `listBins({ limit: 800 })` |
| Large snapshot | `inventoryService.js` | `binLimit: 2000` default in snapshot |
| PI child read | `purchasingApi.js` | Matching empty if role cannot read Purchase Invoice Item |
| User delete | `UsersPage.jsx` | `deleteUser` — irreversible, confirm only via `window.confirm` |
| No timeout retry UI | Global | 30s axios timeout; no retry button pattern |

**Regression guard:** never add `purchase_invoice` to `PURCHASE_RECEIPT_LIST_FIELDS` in `purchasingQueryUtils.js`.

---

## Missing loading states

| Page | Issue |
|------|-------|
| `InvoiceMatchingPage` | Table shows without skeleton between filter changes |
| `ReorderPage` | No load until user clicks "Load suggestions" (intentional but easy to confuse) |
| `BatchesPage` | Same manual load pattern |
| `ProductsPage` | Initial load OK; search replaces entire grid without subtle indicator |

Most pages use `PageLoading` or `Spinner` adequately.

---

## Hardcoded values

| Value | Where |
|-------|-------|
| `EGP` / `en-EG` | `format.js` (OK central); many pages bypass it |
| `http://127.0.0.1:8000` | `config/erp.js` default only (OK if env set in prod) |
| Role name sets | `AuthContext.jsx` — must match site role names |
| Dashboard margin % | Estimated KPI in `api.js` dashboard (not GL) |
| `limit_page_length` | Various 100–800 per page |

---

## Missing guards

| Area | Gap |
|------|-----|
| Route access | Purchasing only under `/admin` — stock users cannot access without admin role |
| Double submit | Ref guards on some forms (`ReceiveStockPage`); not all forms |
| `item` query prefill | Stock forms support `?item=`; reconciliation does not auto-fetch bin qty on prefill |
| Negative payment | POS split payment validated in `usePOS.js`; edge cases site-specific |
| Offline | No offline queue |

---

## Missing validations

| Flow | Gap |
|------|-----|
| Reconciliation | Client checks qty present; no max qty sanity vs ERP |
| Purchase invoice lines | Server validates; client minimal |
| Supplier form | `purchasingValidation.js` — not all pages use it |
| Item details | No Item Price validation; shows `standard_rate` only |

---

## Missing translations

- **No i18n framework** (no `react-i18n`, no Arabic strings file).
- All UI strings English.
- Dates mix `en-EG`, `en-US` (`DashboardPage`), `en-GB` (receipt time).

---

## Print / export inconsistencies

| Capability | Pages |
|------------|-------|
| `ExportToolbar` (CSV/Excel/PDF/print) | Activity, purchase reports |
| `exportCsv` / `printElement` only | Inventory reports |
| None | Most table pages (customers, warehouses, alerts) |
| ERP desk link | Settings quick links, reports grid |

**Not in repo:** `usePrint.js`, `PrintWrapper.jsx` (were in git status snapshot but absent from current tree).

---

## Item Details (specific gap)

`ItemDetailsPage.jsx` does **not** include:

- `itemDetailService.js` / Item Price API
- Sidebar layout / `item-details.css`
- Quick actions, analytics block, balance validation UI

Movement timeline uses basic `MovementTimeline.jsx` without date grouping in current file (component supports grouping if passed enriched rows — verify `MovementTimeline.jsx` implementation).

---

## Movement timeline colors

`admin.css` maps in/out qty colors; category badges in `MovementTimeline.jsx` use sale=blue (legacy). Target spec: purchase=green, sale=red, transfer=blue, adjustment=amber — **partially aligned**.

---

## How to re-scan

```bash
# Pages without layout shells
grep -L "page-layouts" src/modules/**/*Page.jsx

# Legacy card wrappers
grep -l 'className="card panel"' src/modules/**/*.jsx

# Inline EGP
grep -rn "EGP " src/modules --include="*.jsx"

# purchase_invoice on PR list fields
grep -rn "purchase_invoice" src/services/purchasingQueryUtils.js src/services/purchasingApi.js
```

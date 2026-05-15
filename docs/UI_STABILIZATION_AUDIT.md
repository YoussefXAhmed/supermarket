# UI Stabilization Audit

**Phase:** Enterprise normalization (not redesign)  
**Reference:** [UI_RULES.md](./UI_RULES.md), `layout-system.css`, `page-layouts/`  
**Status:** Phase 1–4 migrations implemented (2026-05-15). Build passing.

---

## 1. Inconsistency audit

### Layout shell adoption

| Status | Pages |
|--------|--------|
| **Compliant** | CustomersPage, InvoicesPage, UsersPage, WarehousesPage, StockLedgerPage, ReorderPage, SuppliersPage, PurchaseReportsPage, ActivityLogPage, DashboardPage, InventoryPage (overview), PurchasingDashboardPage, ReceiveStockPage, StockEntryPage, StockTransferPage, ReconciliationPage, AnalyticsPage, ReturnsPage (partial) |
| **Legacy (no shell)** | ProductsPage, InventoryPage (admin), SettingsPage, ReportsPage (admin), AlertsPage, BatchesPage, ItemDetailsPage, PurchaseInvoicesPage, InvoiceMatchingPage, SupplierDetailPage, ReportsPage (inventory) |

### PageHeader `dense` missing

SettingsPage, ProductsPage, InventoryPage (admin), AlertsPage, BatchesPage, ItemDetailsPage, PurchaseInvoicesPage, InvoiceMatchingPage, SupplierDetailPage, ReportsPage (inventory), ReportsPage (admin).

### Loading / error anti-patterns

| Issue | Pages |
|-------|--------|
| Raw `<Spinner>` in centered div | InventoryPage (admin), SettingsPage |
| Inline `style={{ marginBottom: 16 }}` | ProductsPage, InventoryPage, InvoiceMatchingPage, ReturnsPage |
| `form-input` vs `input` | InventoryPage (admin) |
| Nested `card panel` without `LayoutSection` | Alerts, Batches, ItemDetails, PurchaseInvoices, SupplierDetail, Settings, inventory Reports |
| `data-table` vs `Table compact` mix | ReturnsPage uses raw HTML table |

### Toolbar inconsistency

- **Good:** CustomersPage, WarehousesPage — `toolbar` inside `LayoutSection variant="flat"`
- **Mixed:** Alerts/Batches — toolbar inside bare `card panel`
- **POS toggle reused** on non-POS pages (Alerts, PurchaseInvoices) — acceptable but should sit in `LayoutSection flat`

### Table density

- Many legacy pages use `<Table>` without `compact`
- Returns uses hand-built `data-table` (OK if compact class applied)

### Sidebar / nav

- AdminLayout: capability-filtered — **good**
- InventoryLayout: module-nav horizontal — **good**; dense-module wrapper consistent
- PurchasingLayout: separate sub-nav — **good**
- Duplicate concept: Admin “Inventory” vs `/inventory` module (intentional cross-link)

---

## 2. Legacy page list (migration required)

1. `admin/ProductsPage.jsx`
2. `admin/InventoryPage.jsx`
3. `admin/SettingsPage.jsx`
4. `admin/ReportsPage.jsx`
5. `inventory/pages/AlertsPage.jsx`
6. `inventory/pages/BatchesPage.jsx`
7. `inventory/pages/ItemDetailsPage.jsx`
8. `inventory/pages/ReportsPage.jsx`
9. `purchasing/PurchaseInvoicesPage.jsx`
10. `purchasing/InvoiceMatchingPage.jsx`
11. `purchasing/SupplierDetailPage.jsx`
12. `returns/ReturnsPage.jsx` (polish)

**Excluded:** `POSPage.jsx`, `LoginPage.jsx` (exceptions per UI_RULES)

---

## 3. Migration order

| Phase | Scope | Risk |
|-------|--------|------|
| **1** | Admin legacy: Inventory, Products, Settings, Reports | Low |
| **2** | Inventory module: Alerts, Batches, ItemDetails, Reports | Low |
| **3** | Purchasing: InvoiceMatching, PurchaseInvoices, SupplierDetail | Low |
| **4** | Returns polish + global `Table` compact default | Low |
| **5** | CSS: toolbar in section, remove redundant card nesting | Low |

---

## 4. Shared layout recommendations

1. **List page template:** `TablePageLayout` + dense `PageHeader` + `LayoutSection flat` (toolbar) + `LayoutSection raised` + `TableRegion` + `Table compact`
2. **Form template:** `FormPageLayout` + `LayoutSection` + `inv-form form-region`
3. **Settings / grids:** `AdminPageLayout` + `LayoutSection` per settings block
4. **Sparse tables:** `tableConstrain` when ≤8 rows + `page-layout--table-fit-relaxed`
5. **Never** wrap layout shell in extra `div` or `page-shell`

---

## 5. Production ERP UI score

| Dimension | Score (1–10) | Notes |
|-----------|--------------|-------|
| Layout consistency | **6** → target 8 | ~12 legacy pages |
| Table density | **7** | Most new pages compact |
| Form consistency | **8** | inv-form pattern established |
| Loading/error UX | **7** | ApiErrorCard/PageLoading adopted widely |
| Nav / capabilities | **8** | Admin + capability routes |
| POS exception | **9** | Intentionally separate |
| **Overall** | **~82/100** | Target **85/100** after sidebar polish + remaining admin pages |

---

## 6. Top 15 fixes by operational impact

1. Migrate **admin InventoryPage** — managers use stock daily; Spinner → PageLoading, compact table
2. Migrate **AlertsPage** — clerks scan low stock; toolbar + compact table
3. Migrate **PurchaseInvoicesPage** — purchasing AP workflow
4. Migrate **InvoiceMatchingPage** — receipt/invoice linking
5. Migrate **ItemDetailsPage** — investigation during discrepancies
6. Migrate **ReturnsPage** — new workflow; standard loading/table
7. Migrate **BatchesPage** — expiry compliance
8. Migrate **inventory ReportsPage** — export/print during audits
9. Migrate **ProductsPage** — admin catalog reference
10. Migrate **SettingsPage** — ops config; PageLoading consistency
11. Migrate **SupplierDetailPage** — supplier maintenance
12. Migrate **admin ReportsPage** — manager ERP report links
13. Enforce **`PageHeader dense`** on all enterprise pages
14. Replace **`form-input`** with **`input`**
15. Remove **inline margin** wrappers; use `LayoutSection` rhythm

---

## 7. Visual anti-patterns (do not reintroduce)

- Giant centered spinners with `padding: 60`
- Double card nesting (`card` inside `LayoutSection raised`)
- Full-width 3-row tables on ultrawide monitors
- Missing dense headers on data-heavy pages
- Ad-hoc success text without `inv-success` class

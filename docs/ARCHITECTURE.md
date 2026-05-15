# Architecture

## System boundary

```
┌─────────────────────────────────────────────────────────┐
│  supermarket-erp (this repo)                             │
│  React SPA — static build in /dist                       │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS
                            │ /api/*  (same-origin or CORS+cookies)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  ERPNext site (Frappe)                                     │
│  DocTypes, permissions, workflows, GL, stock ledger      │
└─────────────────────────────────────────────────────────┘
```

There is **no application server** in this repository.

---

## SPA routing

Defined in `src/App.jsx`:

| Path | Guard | Layout | Module |
|------|-------|--------|--------|
| `/login` | public | — | auth |
| `/pos` | `require="pos"` | none (fullscreen) | pos |
| `/inventory/*` | `require="inventory"` | `InventoryLayout` | inventory |
| `/admin/*` | `require="admin"` | `AdminLayout` | admin |
| `/admin/purchasing/*` | admin | `PurchasingLayout` | purchasing |
| `*` | → `/login` | — | — |

**Lazy loading:** every page is `lazy(() => import(...))` wrapped in `<Suspense fallback={<PageLoading />}>`.

**Nested outlets:** Admin and Inventory use `<Outlet />`; purchasing is a child route under admin.

---

## Service layer

| Service | Responsibility |
|---------|----------------|
| `api.js` | Auth, User, Item, Customer, Sales Invoice, Company, dashboard aggregates |
| `inventoryApi.js` | Warehouse, Bin, Stock Ledger, Stock Entry, Stock Reconciliation, Item read, Batches |
| `inventoryService.js` | Snapshots, reorder, batch alerts, analytics, movement timeline enrichment |
| `purchasingApi.js` | Supplier, Purchase Receipt, Purchase Invoice, linking, submit retries |
| `purchasingService.js` | Dashboard rows, supplier balance, matching rows, safe parallel fetches |
| `purchasingQueryUtils.js` | Field allowlists, `safeResourceList`, billing helpers |
| `posApi.js` | POS Profile, items+prices+stock, barcode, shift, invoice list |
| `posCheckout.js` | Checkout orchestration |
| `activityLogService.js` | localStorage log + optional ERP Activity Log read |

**Rule:** Pages should call **services**, not raw `axios` (exceptions are rare).

---

## ERPNext REST integration

### List resources

```http
GET /api/resource/Item?fields=["item_code",...]&filters=[...]&limit_page_length=50
```

- `fields` and `filters` are **JSON-stringified** arrays.
- Prefer explicit field lists (ERP rejects unknown fields with 403 / "Field not permitted").

### Single resource

```http
GET /api/resource/Item/{name}
POST /api/resource/Stock Entry
PUT /api/resource/Stock Entry/{name}  { "docstatus": 1 }
```

### Methods

```http
POST /api/method/login
GET /api/method/frappe.auth.get_logged_user
```

### Error path

`api.js` interceptor → `normalizeERPError` → UI `ApiErrorCard` / `getUserFriendlyMessage`.

---

## Data flow (typical page)

```
Page mount
  → service function(s)
  → axios → ERPNext
  → normalize rows in service (maps, aggregates)
  → setState
  → presentational components (Table, StatCard, LayoutSection)
```

**Write flow (stock / purchasing):**

```
Form submit
  → validation util (inventoryValidation / purchasingValidation)
  → create doc POST
  → submit PUT docstatus=1 (with retry)
  → logActivity (local)
  → toast + reload list
```

---

## Auth / session

1. `LoginPage` → `api.login(usr, pwd)`.
2. `AuthContext.loadUser` → `getCurrentUser` + `getUserRoles`.
3. `deriveCapabilities` maps ERP roles → `isAdmin`, `isPOS`, `isInventory`, `isManager`.
4. `ProtectedRoute` enforces route access; admins may access inventory routes.
5. Logout → `api.logout` + clear local state.

**Session storage:** ERPNext session cookie (proxied in dev).

**Home paths:** admin → `/admin`, POS roles → `/pos`, stock roles → `/inventory`.

---

## Inventory workflow (SPA)

| User action | DocType | Service |
|-------------|---------|---------|
| View stock dashboard | Bin + Item | `getInventorySnapshot` |
| Stock receipt/issue | Stock Entry | `createAndSubmitStockEntry` |
| Transfer | Stock Entry (Material Transfer) | same |
| Reconcile | Stock Reconciliation | `createAndSubmitStockReconciliation` |
| Ledger / item history | Stock Ledger Entry | `listStockLedger`, `getItemMovementTimeline` |
| Alerts / reorder | Bin + Item reorder | `listBins`, `getReorderSuggestions` |

**Client validation:** `src/utils/inventoryValidation.js` (qty, warehouses, available bin qty).

---

## POS workflow

1. Load POS Profile + warehouse + price list (`posApi.js`).
2. Open shift (POS Opening Entry) when required.
3. Search/scan items → attach prices + stock.
4. Checkout → Sales Invoice create/submit (`posCheckout.js`).
5. Receipt render (`POSThermalReceipt.jsx`).

**Stock:** deducted via ERPNext on invoice submit (not manual Bin update in SPA).

---

## Purchasing workflow

```
Supplier master
  → Purchase Receipt (receive) → stock +
  → Purchase Invoice → payable
  → Link via Purchase Invoice Item.purchase_receipt (matching page)
```

**Dashboard:** loads PRs with `per_billed` only on list; resolves invoice links via child table query (`listPurchaseInvoiceItemReceiptLinks`).

---

## Shared utilities

| Util | Purpose |
|------|---------|
| `errorHandling.js` | ERP error parse, friendly messages |
| `format.js` | EGP currency, dates |
| `erpLinks.js` | Desk/print/image URLs |
| `export.js` / `exportCsv.js` | CSV, Excel XML, print HTML |
| `batchRequests.js` | Parallel ERP calls with concurrency |
| `inventoryValidation.js` | Stock entry guards |
| `purchasingValidation.js` | Supplier/PR/PI form guards |

---

## Error handling architecture

| Layer | Behavior |
|-------|----------|
| Axios interceptor | Log + reject normalized error |
| Service | Optional `safeResourceList` → warnings[], empty data |
| Page | `ApiErrorCard` + retry; `PartialDataBanner` for non-fatal |
| Route | `ErrorBoundary` on POS and layout outlets |
| Global | No React error overlay customization |

---

## Styling architecture

Import order in `src/main.jsx`:

`globals` → `components` → `layout` → `layout-system` → `enterprise` → `login` → `pos` → `admin`

Feature CSS is mostly module-agnostic class names (`card`, `table`, `layout-section`).

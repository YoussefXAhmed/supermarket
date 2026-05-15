# Project Context — Supermarket ERP (Elmahdi)

## What this repository is

A **frontend-only** React SPA that operates as the operational UI for a supermarket running on **ERPNext (Frappe)**. There is **no custom Frappe app or Node backend in this repo**—all business data and document lifecycle live in ERPNext; this project calls the standard REST API.

**Brand / product name in UI:** Elmahdi  
**Package name:** `supermarket-erp`  
**Default locale/currency:** `en-EG` / **EGP** (hardcoded in `src/utils/format.js` and scattered inline formatters)

---

## Architecture (high level)

```
Browser (React SPA)
    │  axios + cookies (withCredentials)
    ▼
Vite dev proxy /api  →  ERPNext (Frappe)
    │                      /api/resource/*
    │                      /api/method/*
    ▼
DocTypes: Item, Bin, Stock Entry, Sales Invoice, Purchase Receipt, …
```

| Layer | Location | Role |
|-------|----------|------|
| Routes & shells | `src/App.jsx`, `src/components/layout/*` | Auth gates, lazy routes, Admin/Inventory/Purchasing layouts |
| Feature pages | `src/modules/{admin,inventory,purchasing,pos,auth}/` | Screen-level UI |
| API clients | `src/services/*.js` | ERPNext HTTP, submit flows, aggregations |
| Shared UI | `src/components/ui/` | Tables, headers, exports, charts |
| Design tokens | `src/styles/globals.css`, `enterprise.css`, `layout-system.css` | Dark theme, density, max-widths |
| Config | `src/config/erp.js`, `.env` | ERP URLs, dev proxy behavior |

---

## Tech stack

| Concern | Choice |
|---------|--------|
| UI | React 18 |
| Build | Vite 5 |
| Routing | React Router 6 |
| HTTP | Axios 1.6 |
| Styling | Plain CSS (no Tailwind/MUI) |
| State | React hooks + Context (`AuthContext`, `NotificationContext`) |
| ERP | ERPNext / Frappe REST v1 (`/api/resource`, `/api/method`) |

**Not in repo:** TypeScript, test runner, i18n, TanStack Query, component library.

---

## ERPNext integration style

1. **Cookie session** — `login` via `/api/method/login`; subsequent calls use `withCredentials: true`.
2. **Resource API** — List/read/create/update via `/api/resource/{DocType}` with `fields`, `filters`, `limit_page_length` as JSON strings.
3. **Submit** — `PUT` doc with `docstatus: 1` after create (Stock Entry, Purchase Receipt, etc.) with retry in several services.
4. **Defensive lists** — Purchasing uses `purchasingQueryUtils.js` (`safeResourceList`, explicit field allowlists) when ERP rejects fields.
5. **Desk links** — `src/utils/erpLinks.js` for `/app/...`, printview, item images (never hardcode `localhost:8000` in features).
6. **Dev proxy** — `vite.config.js` proxies `/api` → `VITE_ERPNEXT_URL` so cookies work on `localhost:5173`.

---

## Frontend structure

```
src/modules/
  auth/          Login
  pos/           Full-screen cashier (no layout shell)
  admin/         Dashboard, products, sales invoices, customers, users, settings, activity
  inventory/     Retail stock workspace + pages/ (ledger, items, alerts, …)
  purchasing/    Nested under /admin/purchasing/*
```

**Layouts:**

- `AdminLayout` — sidebar nav, `admin-content--workspace` outlet (pages own width via layout shells).
- `InventoryLayout` — module nav + dense workspace.
- `PurchasingLayout` — compact module nav under admin.
- **POS** — `pos-page` full viewport; intentionally excluded from `page-layout` max-width system.

**Layout system** (`src/components/layout/page-layouts/PageLayouts.jsx` + `src/styles/layout-system.css`):

- `DashboardLayout` (1600px), `FormPageLayout` (1100px), `TablePageLayout` (1800px), `AnalyticsLayout`, `AdminPageLayout` (1400px).
- `LayoutSection`, `TableRegion` with `fit` for sparse tables.

---

## Business modules (current)

| Module | Route prefix | Primary services |
|--------|--------------|------------------|
| Auth | `/login` | `api.js` |
| POS | `/pos` | `posApi.js`, `posCheckout.js`, `usePOS.js` |
| Admin | `/admin` | `api.js`, `activityLogService.js` |
| Inventory | `/inventory` | `inventoryApi.js`, `inventoryService.js` |
| Purchasing | `/admin/purchasing` | `purchasingApi.js`, `purchasingService.js` |

**Sales:** POS → Sales Invoice; admin lists sales invoices.  
**Stock:** Stock Entry, Transfer, Reconciliation, Bin snapshot, ledger, alerts, reorder, batches.  
**Purchasing:** Suppliers, receive (Purchase Receipt), purchase invoices, invoice matching, reports.

---

## Design system direction

- **Dark enterprise admin** — amber accent (`--accent`), status colors green/red/amber/blue.
- **Density** — `density--compact` default; `PageHeader dense`, `Table compact`, KPI grids.
- **Ultrawide discipline** — layout shells cap width; sparse tables use `tableConstrain` + `TableRegion fit`.
- **POS** — separate `pos.css`; touch-friendly, full width.
- **Typography** — DM Sans + DM Mono (`globals.css`).

---

## Production goals

Documented in `docs/PRODUCTION_READINESS.md`:

- Controlled pilot on configured ERPNext site (HTTPS, roles, POS Profile, warehouses, price lists).
- Not a full ERPNext Desk replacement for accounting, payroll, or manufacturing.
- Target: reliable **retail operations** (sell, stock, purchase, basic reporting) with export/print and role-based access.

---

## Key files to read first

| File | Why |
|------|-----|
| `src/App.jsx` | All routes |
| `src/config/erp.js` | API base URL rules |
| `src/services/api.js` | Auth, items, sales invoices, dashboard |
| `src/services/inventoryApi.js` | Stock documents |
| `src/services/purchasingApi.js` | PR/PI/suppliers |
| `src/context/AuthContext.jsx` | Role → capability mapping |
| `src/services/purchasingQueryUtils.js` | Safe ERP list patterns |
| `src/components/layout/page-layouts/PageLayouts.jsx` | Layout API |

---

## FINAL_PROJECT_SCORE

Scores are **honest as of repo audit (May 2026)** — frontend-only, no E2E tests in tree.

| Dimension | Score (1–10) | Notes |
|-----------|----------------|-------|
| **Architecture** | 7 | Clear module/service split; no backend; some duplication (two inventory UIs). |
| **UX** | 6 | Layout system partial (~50% pages); Item Details legacy; inconsistent exports. |
| **ERP integration** | 7 | Solid REST + submit patterns; purchasing field guards; no query cache layer. |
| **Operational completeness** | 6 | Core POS/stock/purchase paths exist; gaps in permissions, GL profit, barcode print. |
| **Production readiness** | 5 | Build works; needs ERP config, HTTPS, tests, layout finish, audit hardening. |
| **Scalability** | 5 | List limits 200–800 rows; no pagination on many ERP lists; localStorage activity log. |
| **Maintainability** | 6 | Readable JS; duplicated `fmt`/`EGP`; mixed layout migration; no TS/tests. |

**Overall:** ~6.0 / 10 — viable **pilot**, not yet **enterprise-complete**.

---

## TOP 10 HIGHEST PRIORITY FIXES

See also `docs/NEXT_STEPS.md` for phased roadmap.

1. **Finish layout migration** — 14+ pages still use bare `<div>` wrappers + `card panel` — see `KNOWN_ISSUES.md` (use layout shells, not legacy cards).
2. **Rebuild Item Details** — `ItemDetailsPage.jsx` is legacy; no Item Price API, sidebar, or `itemDetailService` in repo.
3. **Unify currency formatting** — replace inline `EGP` / duplicate `Intl.NumberFormat` with `fmtCurrency` everywhere.
4. **Paginate large ERP lists** — inventory dashboard, alerts (`limit: 800` bins), ledger; avoid silent truncation.
5. **Harden purchasing permissions** — document and test `Purchase Invoice Item` read for matching; keep `purchase_invoice` off PR **list** fields only.
6. **Consolidate duplicate inventory surfaces** — `/admin/inventory` vs `/inventory` serve different purposes; clarify nav or merge.
7. **Add E2E smoke tests** — login, POS sale, stock entry, purchase receipt (Playwright).
8. **Server-trust audit trail** — localStorage activity log is not compliance-grade; rely on ERP Activity Log + permissions.
9. **POS/admin role matrix** — verify non-admin inventory cannot hit `/admin/purchasing`; document ERP DocType permissions.
10. **Production env checklist** — CORS, cookies, `VITE_ERPNEXT_URL`, nginx SPA fallback (see `PRODUCTION_READINESS.md`).

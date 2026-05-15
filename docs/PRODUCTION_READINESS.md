# Production Readiness Report — Supermarket ERP

**Generated:** May 2026  
**Stack:** React 18 + Vite 5 + ERPNext (Frappe REST API)

---

## 1. Executive summary

The supermarket ERP frontend is structured as a **role-based SPA** with three operational surfaces (Admin, POS, Inventory) plus nested Purchasing. Recent work adds enterprise foundations: unified tokens, notifications, exports, activity logging, dashboard KPIs, lazy routes, and defensive ERP queries.

**Overall status:** Suitable for **controlled production pilot** after completing ERPNext server configuration items below. Not yet a full replacement for ERPNext Desk for accounting, payroll, or advanced manufacturing.

---

## 2. What was delivered (this polish pass)

| Area | Status | Notes |
|------|--------|-------|
| Design system | ✅ | `--amber` tokens, `enterprise.css`, `stat-card--amber`, responsive grids |
| Role-based UI | ✅ | `RoleBadge`, manager detection, cross-links Admin ↔ POS ↔ Inventory |
| Notifications | ✅ | `NotificationProvider` — success, warning, error, critical toasts |
| Export | ✅ | CSV, Excel (.xls XML), PDF (print-to-PDF), Print via `ExportToolbar` |
| Activity logs | ✅ | Local log + optional ERP Activity Log merge; `/admin/activity` |
| Dashboard KPIs | ✅ | Revenue trend, est. gross profit, avg ticket, 14-day chart |
| Mobile / tablet | ⚠️ | Responsive admin sidebar, POS tablet rules in `enterprise.css` |
| Performance | ✅ | Route lazy-loading, `PaginatedTable`, `batchRequests` utility |
| Cleanup | ✅ | DEV-gated auth/login logs, removed `console.error` in admin inventory |

---

## 3. Architecture

```
/login
/pos          → Cashier (POS User, Sales User, …)
/inventory/*  → Stock / warehouse roles (+ admin)
/admin/*      → System Manager / Administrator
  /admin/purchasing/*  → Purchasing submodule
```

**API:** Axios → ERPNext `/api/resource` and `/api/method`, proxied in dev via Vite.

---

## 4. Missing ERPNext configurations (required before go-live)

Configure these in **ERPNext Desk** (not in this repo):

### Company & accounts
- [ ] Default **Company** with currency (EGP)
- [ ] Chart of accounts, fiscal year, default cost center
- [ ] **Mode of Payment** (Cash, Card) linked to accounts

### Retail / POS
- [ ] **POS Profile** — warehouse, price list, company, payment methods
- [ ] **POS Opening Entry** workflow enabled for cashiers
- [ ] Item **barcodes** and **Item Price** (selling) for all POS SKUs
- [ ] Stock settings: allow negative stock policy defined

### Inventory
- [ ] **Warehouses** (store, backroom)
- [ ] **Reorder level** on items (for alerts)
- [ ] Batch/expiry if used (perishables)

### Purchasing
- [ ] **Supplier** master, Supplier Groups
- [ ] Purchase Receipt → Purchase Invoice linking via standard item lines (not custom header fields)
- [ ] User permissions on `Purchase Invoice Item` child queries if matching page is empty

### Users & permissions
- [ ] Role profiles: `POS User`, `Stock User`, `System Manager`
- [ ] API user rights: read/write on required DocTypes
- [ ] **Activity Log** read permission if server audit should appear in app

### Security (server)
- [ ] HTTPS only in production
- [ ] CORS / cookie domain aligned with SPA host
- [ ] Rate limiting on login endpoint
- [ ] Disable default `Administrator` password; enforce 2FA for admins (ERPNext setting)

---

## 5. Deployment checklist

### Build
```bash
cp .env.example .env
# Set VITE_ERPNEXT_URL=https://your-erp.example.com
npm ci
npm run build
```

### Host static assets
- [ ] Serve `dist/` behind nginx/Caddy with `try_files` → `index.html`
- [ ] gzip/brotli enabled
- [ ] Cache static assets (`/assets/*`) with long max-age; no-cache `index.html`

### Environment
- [ ] `VITE_ERPNEXT_URL` points to production ERPNext origin
- [ ] ERPNext **Allow CORS** / trusted origins includes SPA URL
- [ ] Session cookies: `SameSite` compatible with cross-subdomain setup if applicable

### Smoke tests (post-deploy)
- [ ] Login as admin → dashboard loads KPIs
- [ ] Login as cashier → POS shift open → sale → receipt
- [ ] Stock entry submit → bin qty changes in ERPNext
- [ ] Purchase receipt receive → stock increases
- [ ] Export CSV from purchase reports
- [ ] Activity log shows recent sale/stock entries

---

## 6. Security checklist

| Item | Frontend | Server (ERPNext) |
|------|----------|------------------|
| Auth | Session via ERPNext cookies | Strong passwords, lockout |
| Authorization | `ProtectedRoute` by role | DocType permissions per role |
| XSS | React escaping; avoid `dangerouslySetInnerHTML` | — |
| CSRF | Frappe CSRF on API | Keep ERPNext updated |
| Secrets | No secrets in `dist/`; only `VITE_*` public URL | API keys server-side only |
| Audit | Local activity log + ERP Activity Log | Enable versioning on critical DocTypes |
| HTTPS | Enforce at reverse proxy | Valid TLS cert |

**Known limitations:**
- Activity log in browser `localStorage` is **not** tamper-proof — use ERPNext audit for compliance.
- Gross profit on dashboard is **estimated** (configurable margin %), not GL-based net profit.

---

## 7. Performance notes

- All major routes are **lazy-loaded** (code splitting).
- Large tables should use **`PaginatedTable`** (default 25 rows/page).
- Use **`batchRequests()`** when firing many parallel ERP list calls.
- ERP list endpoints capped at 500 rows in dashboards — paginate server-side for very large catalogs.

---

## 8. Recommended next steps (post-pilot)

1. **TanStack Query** for cache, dedup, and stale-while-revalidate on ERP reads.
2. **Server-side PDF** (wkhtmltopdf / ERPNext print formats) for branded invoices.
3. **Real profit KPIs** from GL / P&L report API.
4. **Webhooks or socket** for low-stock critical alerts.
5. **E2E tests** (Playwright) for login, POS sale, stock entry.
6. **i18n** (Arabic UI) if required for store staff.

---

## 9. Build verification

Run before each release:

```bash
npm run build
```

Expected: Vite build succeeds with no errors; `dist/index.html` and hashed assets under `dist/assets/`.

---

## 10. Support contacts

- **ERPNext issues:** Frappe/ERPNext documentation and forum
- **App issues:** Repository maintainers / internal IT

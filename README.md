# Elmahdi ERP Frontend

A React + Vite frontend for a supermarket ERP system, integrated with ERPNext (Frappe REST API).

---

## Stack

| Layer       | Tech                          |
|-------------|-------------------------------|
| Framework   | React 18 + Vite 5             |
| Routing     | React Router DOM v6           |
| HTTP Client | Axios (cookie-based auth)     |
| Styling     | Plain CSS with design tokens  |
| API         | ERPNext / Frappe REST API     |

---

## Folder Structure

```
src/
├── config/
│   └── erp.js           Central ERPNext URL configuration
├── modules/
│   ├── auth/            LoginPage
│   ├── pos/             POSPage (cashier fullscreen)
│   ├── admin/           Dashboard, products, invoices, …
│   └── inventory/       Stock workspace (dashboard, ledger, reports)
├── services/
│   ├── api.js           Core ERPNext API (axios)
│   ├── inventoryApi.js  Stock / warehouse operations
│   └── inventoryService.js  Retail aggregations
├── utils/
│   ├── erpLinks.js      Desk / printview / image URL helpers
│   └── errorHandling.js ERP error normalization
├── components/
│   ├── ui/              Shared primitives (PageLoading, ApiErrorCard, …)
│   ├── common/          ErrorBoundary
│   └── layout/          AdminLayout, InventoryLayout, ProtectedRoute
├── context/             AuthContext
└── hooks/               useAuth, usePOS
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- ERPNext running (default `http://127.0.0.1:8000`)

### Environment

Copy the example env file and adjust if your ERPNext host differs:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_ERPNEXT_URL` | ERPNext site origin (desk, images, print links). Default: `http://127.0.0.1:8000` |
| `VITE_ERP_API_BASE` | Optional REST API base. Dev uses same-origin `/api` proxy when unset. |
| `VITE_ERP_PRINT_BASE` | Optional printview origin. Defaults to `VITE_ERPNEXT_URL`. |

### Install & Run (development)

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

**Dev proxy:** Vite proxies `/api` to `VITE_ERPNEXT_URL` (see `vite.config.js`). The axios client uses an empty API base in dev so session cookies work through the proxy.

### ERPNext Setup

1. **CORS** — Add your frontend origin (e.g. `http://localhost:5173`) to **Allow CORS** in System Settings when not using a reverse proxy.
2. **Session cookies** — The app uses cookie-based login (`withCredentials: true`).
3. **POS Profile** — Link a POS Profile to warehouse and price list.
4. **Roles** — Examples: `System Manager`, `POS User`, `Stock User`.

---

## Production

### Build

```bash
npm run build
```

Output is in `/dist`. Serve as static files (nginx, S3 + CDN, etc.).

### Deployment patterns

**Recommended: reverse proxy (same origin)**

Serve the SPA and proxy `/api` to ERPNext on one host. Set:

```env
VITE_ERPNEXT_URL=https://erp.yourdomain.com
```

Build with the public ERP URL so desk links, images, and printview resolve correctly. Configure nginx (or similar):

- `/` → `dist/`
- `/api` → ERPNext backend

**Cross-origin SPA**

If the UI and ERP are on different hosts, set `VITE_ERP_API_BASE` to the ERP origin and configure CORS + cookies on ERPNext. Prefer same-site deployment when possible.

### Configuration reference

All ERP URLs are centralized in `src/config/erp.js` and `src/utils/erpLinks.js`:

- `getERPDeskUrl(path)` — Frappe desk links
- `getERPPrintviewUrl({ doctype, name, … })` — Print URLs
- `getERPImageUrl(path)` — Item images
- `openERPDesk` / `openERPPrintview` — Open in new tab

Do not hardcode `localhost:8000` in components.

---

## Role-Based Access

| Role / capability | POS `/pos` | Admin `/admin/*` | Inventory `/inventory/*` |
|-------------------|:----------:|:----------------:|:------------------------:|
| System Manager    | Redirected to admin* | ✅ | ✅ |
| POS User          | ✅ | ❌ | ❌ |
| Stock / warehouse roles | ❌ | ❌ | ✅ |

\* Admins are redirected away from POS by default; use a POS-role user for cashier testing.

---

## API & Errors

- HTTP client: `src/services/api.js` (30s timeout, normalized errors)
- `extractERPError(error)` — Parse Frappe `_server_messages` and HTTP status
- UI: `ApiErrorCard`, `PageLoading`, `ErrorBoundary` on protected layouts

---

## Design System

Dark theme with amber accent. Tokens in `src/styles/globals.css`:

- `--accent` `#f5a623`
- `--green`, `--red`, `--blue` — status colors
- Fonts: **DM Sans** + **DM Mono**

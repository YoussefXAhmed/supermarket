# Elmahdi ERP Frontend

A clean, scalable React + Vite frontend for a supermarket ERP system, fully integrated with ERPNext (Frappe REST API).

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
├── modules/
│   ├── auth/        LoginPage
│   ├── pos/         POSPage (cashier fullscreen mode)
│   └── admin/       Dashboard, Products, Inventory,
│                    Invoices, Customers, Reports, Settings
├── services/
│   └── api.js       All ERPNext API calls (Axios)
├── components/
│   ├── ui/          Button, Badge, Spinner, Table, StatCard, …
│   └── layout/      AdminLayout (sidebar), ProtectedRoute
├── context/
│   └── AuthContext  user, roles, isAdmin, isPOS
├── hooks/
│   ├── useAuth.js   Re-export of AuthContext hook
│   └── usePOS.js    Cart, search, checkout logic
└── styles/          globals, components, layout, login, pos, admin
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- ERPNext running at `http://localhost:8000`

### Install & Run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

### ERPNext Setup

1. **CORS** — In ERPNext, go to `System Settings` → add `http://localhost:5173` to **Allow Cors**.
2. **Session cookies** — Make sure `Allow Guest to View` is off; the app uses cookie-based login.
3. **POS Profile** — Create a POS Profile linked to a warehouse and price list.
4. **Roles**:
   - `System Manager` → full Admin + POS access
   - `POS User` → POS only

---

## Role-Based Access

| Role           | POS `/pos` | Admin `/admin/*` |
|----------------|:----------:|:----------------:|
| System Manager | ✅         | ✅               |
| POS User       | ✅         | ❌ → redirected  |
| Guest / Other  | ❌         | ❌ → /login      |

---

## API Reference

All calls are in `src/services/api.js`:

| Function              | Endpoint                                  |
|-----------------------|-------------------------------------------|
| `login(usr, pwd)`     | POST `/api/method/login`                  |
| `logout()`            | GET  `/api/method/logout`                 |
| `getCurrentUser()`    | GET  `/api/method/frappe.auth.get_logged_user` |
| `getUserRoles(user)`  | GET  `/api/resource/User/:name`           |
| `getItems()`          | GET  `/api/resource/Item`                 |
| `searchItems(q)`      | GET  `/api/resource/Item?filters=…`       |
| `getStockLedger()`    | GET  `/api/resource/Bin`                  |
| `getSalesInvoices()`  | GET  `/api/resource/Sales Invoice`        |
| `createSalesInvoice()`| POST `/api/resource/Sales Invoice`        |
| `submitSalesInvoice()`| PUT  `/api/resource/Sales Invoice/:name`  |
| `getCustomers()`      | GET  `/api/resource/Customer`             |
| `getDashboardStats()` | Parallel fetches for dashboard KPIs       |

---

## Build for Production

```bash
npm run build
# Output in /dist — serve with nginx or any static host
```

---

## Design System

Dark theme with amber accent. CSS custom properties in `src/styles/globals.css`:

- `--bg`, `--bg-2`, `--bg-3`, `--bg-4` — surface layers
- `--accent` `#f5a623` — amber CTA color
- `--green`, `--red`, `--blue` — semantic status colors
- Font: **DM Sans** (UI) + **DM Mono** (prices/codes)

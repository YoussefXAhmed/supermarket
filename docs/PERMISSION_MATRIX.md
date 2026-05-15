# Permission Matrix — Supermarket ERP SPA

**Audit date:** May 2026  
**Scope:** Frontend route guards (`ProtectedRoute`, `AuthContext`) + operational pages.  
**Authority:** ERPNext DocType permissions are **authoritative** for data mutations; the SPA only enforces coarse route buckets.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Allowed by SPA route guard (if ERP permits API) |
| ❌ | Blocked by SPA route guard |
| ⚠️ | No SPA guard; relies on ERP only |
| 🔒 | Must be restricted in production (not implemented in SPA today) |

---

## SPA capability buckets (derived in `AuthContext.jsx`)

| Bucket | ERP roles recognized (case-normalized) | Used for |
|--------|----------------------------------------|----------|
| **Admin** | `System Manager`, `Administrator` | `/admin/*` |
| **POS** | `POS User`, `POS Manager`, `Sales User`, `Sales Manager`, `Cashier`, `Profile Manager`, `Website Manager` | `/pos` |
| **Inventory** | `Stock User`, `Stock Manager`, `Item Manager`, `Warehouse User`, `Warehouse Manager` | `/inventory/*` |
| **Manager** (display only) | Above manager roles + any role/profile containing `manager` | `RoleBadge` only — **not used for routing** |

**Home path priority:** Admin → POS → Inventory → `/login`

---

## Route × role matrix (SPA guards)

| Route / area | Administrator | Cashier (POS only) | Inventory clerk | Purchasing officer (ERP) | Store manager (target) |
|--------------|:-------------:|:------------------:|:---------------:|:------------------------:|:----------------------:|
| `/login` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/pos` | ❌ redirected to `/admin` | ✅ | ❌ | ❌ | ✅ (proposed) |
| `/inventory/*` | ✅ | ❌ | ✅ | ❌ | ✅ (proposed) |
| `/admin` (dashboard) | ✅ | ❌ | ❌ | ❌ | ✅ |
| `/admin/products` | ✅ | ❌ | ❌ | ❌ | 🔒 read-only proposed |
| `/admin/inventory` (bin table) | ✅ | ❌ | ❌ | ❌ | ✅ read |
| `/admin/purchasing/*` | ✅ | ❌ | ❌ | ❌* | ✅ |
| `/admin/invoices` (sales) | ✅ | ❌ | ❌ | ❌ | ✅ read |
| `/admin/customers` | ✅ | ❌ | ❌ | ❌ | 🔒 read |
| `/admin/users` | ✅ | ❌ | ❌ | ❌ | 🔒 admin only |
| `/admin/activity` | ✅ | ❌ | ❌ | ❌ | ✅ read |
| `/admin/reports` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `/admin/settings` | ✅ | ❌ | ❌ | ❌ | 🔒 limited |

\* **Purchasing Officer** with only `Purchase User` / `Purchase Manager` ERP roles has **no SPA path** today — must use `/admin` which requires `System Manager` or `Administrator`.

---

## Operational action matrix (mutations)

| Action | DocType / API | SPA surface | Admin | Cashier | Inventory | Purchasing | ERP must enforce |
|--------|---------------|-------------|:-----:|:-------:|:---------:|:----------:|:----------------:|
| POS sale | Sales Invoice / POS Invoice | `/pos` | ❌ route | ✅ | ❌ | ❌ | Submit SI, stock, pricing |
| Open/close shift | POS Opening/Closing Entry | `/pos` | ❌ | ✅ | ❌ | ❌ | POS Profile, user |
| Stock receipt | Stock Entry | `/inventory/stock-entry` | ✅ | ❌ | ✅ | ❌ | Warehouse, submit |
| Stock issue | Stock Entry | same | ✅ | ❌ | ✅ | ❌ | Negative stock policy |
| Stock transfer | Stock Entry | `/inventory/transfer` | ✅ | ❌ | ✅ | ❌ | Source bin qty |
| Stock reconciliation | Stock Reconciliation | `/inventory/reconciliation` | ✅ | ❌ | ✅ | ❌ | **High risk** — ledger |
| Purchase receipt | Purchase Receipt | `/admin/purchasing/receive` | ✅ | ❌ | ❌ | ❌* | Stock + supplier |
| Purchase invoice | Purchase Invoice | `/admin/purchasing/invoices` | ✅ | ❌ | ❌ | ❌* | Payables |
| Supplier create/edit | Supplier | `/admin/purchasing/suppliers` | ✅ | ❌ | ❌ | ❌* | Master data |
| User create | User | `/admin/users` | ✅ | ❌ | ❌ | ❌ | **Critical** |
| User delete | User | `/admin/users` | ✅ | ❌ | ❌ | ❌ | **Critical** |
| User enable/disable | User | `/admin/users` | ✅ | ❌ | ❌ | ❌ | **Critical** |
| View sales invoices | Sales Invoice list | `/admin/invoices` | ✅ | ❌ | ❌ | ❌ | PII, amounts |
| View customers | Customer list | `/admin/customers` | ✅ | ❌ | ❌ | ❌ | PII |
| Export CSV | various | toolbar | ✅ | ❌ | ✅** | ❌* | Data exfiltration |

\** Inventory pages with export when migrated to golden pattern.  
\*** No SPA access without Admin bucket.

---

## Warehouse scoping matrix

| Surface | Warehouse filter in SPA | ERP enforcement expected |
|---------|---------------------------|---------------------------|
| POS checkout | Fixed to **POS Profile warehouse** | ✅ |
| Stock entry / transfer / reconcile | User picks **any warehouse from list** | User must have ERP access per warehouse |
| Alerts / reorder | Optional filter; can load all bins (limit 800) | Bin read permissions |
| Admin inventory bin table | No user scoping | Bin read |
| Purchasing receive | Line / header warehouse pickers | PR permissions |

**Gap:** No SPA concept of `allowed_warehouses` or User Permission warehouse rules.

---

## Approval workflow matrix

| Workflow | SPA behavior | Approval layer |
|----------|--------------|----------------|
| Stock Entry submit | Immediate `docstatus: 1` | None |
| Stock Reconciliation | Immediate submit | None |
| Purchase Receipt | Immediate submit | None |
| Purchase Invoice | Immediate submit | None |
| POS Invoice | Immediate submit | Shift open check only |
| User delete | `window.confirm` | None |
| Price change at POS | Rate from catalog at add-to-cart | None in UI |
| Returns / credit notes | Not implemented | N/A |

---

## Cross-links

- Capabilities detail: `docs/ROLE_CAPABILITIES.md`
- Gaps: `docs/SECURITY_GAPS.md`
- Required guards: `docs/REQUIRED_ROUTE_GUARDS.md`
- ERPNext setup: `docs/ERP_PERMISSION_ALIGNMENT.md`

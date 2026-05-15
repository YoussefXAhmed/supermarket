# ERP Rules — ERPNext Integration Standards

These rules prevent production breakage when ERPNext permissions or schema differ between sites.

---

## Allowed API patterns

### Resource list (preferred)

```javascript
api.get('/api/resource/Purchase Receipt', {
  params: {
    fields: JSON.stringify(['name', 'supplier', 'posting_date', 'grand_total', 'per_billed']),
    filters: JSON.stringify([['docstatus', '=', 1]]),
    order_by: 'posting_date desc',
    limit_page_length: 100,
  },
});
```

- Always pass **explicit `fields`** for list endpoints on customized/v15 sites.
- `filters` as JSON array of tuples: `[field, operator, value]`.
- Use `limit_page_length`; default caps in this app: 50–800 depending on screen.

### Single document

```javascript
api.get(`/api/resource/Item/${encodeURIComponent(itemCode)}`, { params: { fields: JSON.stringify([...]) } });
api.post('/api/resource/Stock Entry', body);
api.put(`/api/resource/Stock Entry/${name}`, { docstatus: 1 });
```

### Methods

- Login: `POST /api/method/login`
- Current user: `GET /api/method/frappe.auth.get_logged_user`

### Safe list wrapper

Use `safeResourceList(fetchFn, label, warnings)` from `purchasingQueryUtils.js` when a secondary query may fail without blocking the page.

---

## Forbidden / risky query patterns

| Do not | Why | Alternative |
|--------|-----|-------------|
| `purchase_invoice` on **Purchase Receipt list** `fields` | ERP error: Field not permitted in query | Use `per_billed`; resolve invoices via `Purchase Invoice Item.purchase_receipt` |
| Wildcard `fields: ['*']` on lists | Breaks on permission-restricted columns | Explicit field array |
| Assuming child table fields on parent list | Not in parent schema | Query child DocType |
| Unbounded `limit_page_length: 99999` | Timeouts, memory | Paginate or batch |
| Hardcoded company/warehouse names | Multi-site failure | `getCompanies`, warehouse pickers |

**Allowed:** `purchase_invoice` as a **derived property** in JS after joining child rows (`purchasingService.js` maps `purchase_invoices` array for UI only — not an API field on PR list).

---

## Naming conventions

| Concept | ERPNext | Frontend |
|---------|---------|----------|
| SKU | `Item.item_code` | `item_code` |
| Doc name | `name` | `name` (voucher id) |
| Supplier id | `Supplier.name` | `supplier` on PR/PI |
| Warehouse | `Warehouse.name` | `warehouse` on Bin/SLE |

Use `encodeURIComponent` for path segments with special characters.

---

## Document submit flow

Standard pattern in `inventoryApi.js` / `purchasingApi.js`:

1. `POST` create draft (`docstatus: 0`).
2. `PUT` `{ docstatus: 1 }` to submit.
3. Retry 2× on submit with short sleep; re-fetch doc to confirm `docstatus === 1`.
4. On failure: surface `draftName` if present so user can fix in ERPNext Desk.

**Never** skip submit for stock-affecting docs unless explicitly creating drafts for editing.

---

## Stock safety rules

### Client (`inventoryValidation.js`)

- Qty > 0
- Material Transfer: source ≠ target; optional `sourceQty` check vs bin
- Material Issue / Transfer: source warehouse required
- Material Receipt: target warehouse required

### ERP (must be configured on site)

- Negative stock policy defined in Stock Settings
- Bin exists after first movement; SPA does not create bins

### Stock Reconciliation

- Submit `Stock Reconciliation` with counted `qty` per line (`createAndSubmitStockReconciliation`).
- **Delta semantics:** adjustment qty = counted − system (ERP handles via reconciliation purpose).
- UI should show ERP `current_qty` from `getBin` before count (`ReconciliationPage.jsx`).

### Stock Ledger truth

- **Authoritative balance:** ERPNext Stock Ledger Entry `qty_after_transaction` per warehouse.
- SPA timeline is read-only; categorization in `inventoryService.getItemMovementTimeline` is for display only.

---

## POS rules

- Prices: **Item Price** with `selling: 1` for active price list (`posApi.attachPrices`).
- Stock: read from Bin for POS warehouse before add-to-cart (optional block if out of stock).
- Checkout creates **Sales Invoice** (and payment entries per ERP setup).
- Barcode: resolve via `Item Barcode` child table then fetch Item.
- Shift: POS Opening Entry when profile requires it.
- Admins are **redirected** from `/pos` route — test cashiers with POS roles.

---

## Warehouse rules

- Lists filter `is_group: 0` for selectable warehouses (`listWarehouses`).
- Stock movements must use warehouse names that exist on Bin records.
- Multi-warehouse items: Bin rows are per (item_code, warehouse).

---

## Purchasing rules

### Purchase Receipt (receive)

- Creates + submits PR; increases stock in `set_warehouse` / line warehouse.
- Required: supplier, company, item lines (item_code, qty, rate, warehouse).

### Purchase Invoice

- Payable document; link to receipt via **Purchase Invoice Item** `purchase_receipt` field (matching page).
- Do not rely on a direct PR header link field in list API.

### Billing status

- Use `per_billed` on PR (0–100) for Billed / Partly billed / To bill (`billingStatusLabel` in `purchasingQueryUtils.js`).

### Suppliers

- `supplier_group` required on create (auto-pick first group on new supplier form).

---

## Reconciliation rules (inventory)

- Purposes: `Stock Reconciliation`, `Opening Stock` (see `ReconciliationPage.jsx`).
- At least one line with item + counted qty.
- Company from selected warehouse record.

---

## Activity / audit

- `logActivity` writes to **localStorage** only unless ERP Activity Log read succeeds.
- For compliance, use ERPNext's native audit (Version, Activity Log) with proper read permissions.

---

## Configuration dependency (server-side)

Not enforced in code — must exist in ERPNext:

- Company, fiscal year, warehouses, POS Profile, Item Price, reorder levels (for alerts), role permissions on all touched DocTypes.

See `docs/PRODUCTION_READINESS.md` for checklist.

# Warehouse Permission Flow

**Version:** 1.0 · May 2026  
**Purpose:** How warehouse (and related) scoping is assigned at user provisioning and enforced at runtime in ERPNext and the SPA.

---

## Why warehouse scope matters

Supermarket fraud often involves:

- Selling from wrong warehouse (stock leak)  
- Receiving into backroom while selling floor shows shortage  
- Transferring stock to a warehouse the user should not see  
- Reconciling counts at a store the user does not work at  

**ERPNext User Permission** on **Warehouse** is the primary enforcement mechanism. SPA filtering is a **secondary UX layer**.

---

## Permission types used

| allow (DocType) | Used for | Templates |
|-----------------|----------|-----------|
| Warehouse | Stock, bins, POS warehouse, PR receive WH | All operational |
| Price List | POS selling prices only | Cashier |
| Company | Multi-entity isolation | All |
| Branch | Future multi-store | Optional |

**Not used for cashiers:** unrestricted Item Price write — blocked by role, not User Permission.

---

## Scope by operational template

| Template | Warehouse rule | Count | Price List |
|----------|----------------|-------|------------|
| Cashier | Single floor/register WH | 1 | Required (retail list) |
| Inventory Clerk | Assigned backroom + floor | 1–3 typical | — |
| Purchasing Officer | Receive / backroom WH | 1–2 | — |
| Store Manager | All WH for store | All in store | Read via roles |
| Administrator | Company default | All or policy | — |

### Naming convention (recommended)

```text
{StoreCode} - WH-Floor
{StoreCode} - WH-Backroom
{StoreCode} - WH-Damaged   (optional, manager only)
```

Admin UI should show `warehouse_name`, store code, and type — not raw ERP name only.

---

## Provisioning flow (warehouse)

```text
Admin selects template
    → SPA loads assignable warehouses for admin's company/store
    → Admin picks warehouse(s) from filtered list
    → SPA validates: non-empty, count limits per template
    → POST User Permission row(s) per warehouse
    → Optional: set is_default on primary WH
    → Enable user
```

### User Permission record shape

```json
{
  "user": "clerk1@store.example",
  "allow": "Warehouse",
  "for_value": "STORE01 - WH-Backroom",
  "apply_to_all_doctypes": 1,
  "is_default": 0
}
```

**Cashier:** exactly one Warehouse + one Price List permission before enable.

**Clerk:** one or more; at least one must match receive/issue locations they use.

**Store Manager:** bulk create for all WH where `company` = store company and tag = store (implementation: server method queries Warehouse list).

---

## Admin assignable warehouse set

Admins must not assign warehouses outside their authority.

| Admin type | Can assign |
|------------|------------|
| Store Administrator | WH for their store only |
| HQ Administrator | Any WH in company |
| Store Manager (target) | **Cannot** provision users — read-only |

**Server rule:** `assignable_warehouses = intersection(admin_permissions, template_allowed)`.

**SPA today:** No assignable set — admin could POST any `for_value` if ERP allows.

---

## Runtime enforcement

### ERPNext (authoritative)

| API / DocType | Behavior with User Permission |
|---------------|------------------------------|
| `GET /api/resource/Warehouse` | Filtered list |
| Bin queries | Only permitted WH |
| Stock Entry | `to_warehouse` / `from_warehouse` validated |
| POS Invoice | `set_warehouse` must be permitted |
| Purchase Receipt | Target WH must be permitted |

### SPA (secondary)

| Location | Behavior today | Target |
|----------|----------------|--------|
| `warehouseScope.js` | `allowedWarehouses: null` — no filter | Load from User Permission |
| `filterWarehousesByScope` | Ready | Used in pickers |
| `StockEntryPage` | All WH from API | Filtered |
| `AlertsPage` WH picker | All WH | Filtered |
| POS checkout | POS Profile WH | Profile must ⊆ user permission |

**Boot sequence (target):**

```text
Login success
  → GET User Permission (allow=Warehouse, user=current)
  → set warehouseScope { allowedWarehouses: [...], loaded: true, source: 'user-permission' }
  → inventory + purchasing pickers use filterWarehousesByScope
```

**API:**

```http
GET /api/resource/User Permission
  ?filters=[["user","=","{username}"],["allow","=","Warehouse"]]
  &fields=["name","for_value","is_default"]
```

Optional: include in custom `get_session_boot` method to reduce round-trips.

---

## Price list permission (cashier)

```json
{
  "user": "cashier1@store.example",
  "allow": "Price List",
  "for_value": "Standard Selling",
  "apply_to_all_doctypes": 1
}
```

**Aligns with:** POS Profile `selling_price_list`.

**Mismatch risk:** User Permission allows list A, POS Profile uses list B → ERP may reject rates or show wrong prices.

**Provisioning rule:** When admin selects POS Profile (future), auto-set Price List permission to profile's list.

---

## Company permission

For multi-company ERP sites:

```json
{
  "user": "...",
  "allow": "Company",
  "for_value": "Elmahdi Supermarket",
  "apply_to_all_doctypes": 1
}
```

Prevents clerk at Company A seeing Company B warehouses even if names leak.

---

## Changing warehouse scope (lifecycle)

| Event | Action |
|-------|--------|
| Clerk moves to backroom only | Remove floor WH permission; add backroom |
| New store opening | HQ adds WH; bulk update manager permissions |
| Cashier changes register | Update POS Profile in Desk; WH permission if register uses different WH |
| Offboarding | Disable user — permissions remain for audit |

**Do not delete User Permission rows on disable** — historical attribution.

**Changes:** Add/remove via SPA with confirmation; audit Comment on User.

---

## Validation rules

| Rule | Error if violated |
|------|-------------------|
| Cashier: exactly 1 WH | "Cashier requires one warehouse" |
| Clerk: ≥1 WH | "Select at least one warehouse" |
| WH exists and not disabled | ERP 404 / validation |
| WH company = user company | Cross-company block |
| Duplicate permission row | Skip or merge |
| Manager: all store WH | Auto-populate; admin cannot deselect below full set without downgrade template |

---

## Dangerous gaps (current)

| Gap | Risk |
|-----|------|
| No User Permission on create | User sees all company warehouses ERP returns |
| SPA `allowedWarehouses: null` | Pickers show full list |
| POS Profile WH not tied to permission | Checkout to wrong WH |
| Admin assigns WH outside store | Cross-store fraud if ERP allows |
| No read-back in Users table | Misconfiguration invisible |

---

## Testing checklist

1. Create clerk with WH-A only → `listWarehouses` returns WH-A only.  
2. POST Stock Entry to WH-B → 403 from ERP.  
3. Cashier POS sale → stock deducts WH-A.  
4. Manager has WH-A + WH-B → transfer allowed.  
5. Purchasing receive to WH-backroom only → issue to floor blocked without transfer.

---

## Related documents

- [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md)
- [ROLE_ASSIGNMENT_RULES.md](./ROLE_ASSIGNMENT_RULES.md)
- [INVENTORY_OPERATIONS.md](./INVENTORY_OPERATIONS.md)
- [src/utils/warehouseScope.js](../src/utils/warehouseScope.js)

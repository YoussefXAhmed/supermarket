# UI Rules — Design & Layout Standards

Applies to **admin**, **inventory**, and **purchasing** surfaces. **POS is an exception** (see bottom).

Reference implementation: `src/styles/layout-system.css`, `src/components/layout/page-layouts/PageLayouts.jsx`, `src/styles/enterprise.css`.

---

## Page widths (layout shells)

Every non-POS page should wrap content in exactly **one** layout shell:

| Shell | Max width | Use for |
|-------|-----------|---------|
| `DashboardLayout` | 1600px | KPIs, charts, workflow bars, multi-section dashboards |
| `TablePageLayout` | 1800px | Lists, logs, ledgers, matching tables |
| `FormPageLayout` | 1100px | Stock entry, receive, reconciliation, supplier form |
| `AnalyticsLayout` | 1600px | Multi-panel reports, trend + tables |
| `AdminPageLayout` | 1400px | Mixed grids (products, settings, item detail when built) |

Import from `src/components/layout/page-layouts`.

```jsx
<TablePageLayout tableConstrain={rows.length <= 8}>
  <PageHeader dense ... />
  <LayoutSection variant="flat" flushHead>{/* filters */}</LayoutSection>
  <LayoutSection variant="raised" flushHead fit={sparse}>
    <TableRegion fit={sparse}>
      <Table compact ... />
    </TableRegion>
  </LayoutSection>
</TablePageLayout>
```

**Do not** wrap the shell in an extra `page-shell` div — `AdminLayout` already uses `admin-content--workspace`.

---

## Table sizing

- Use `Table` with `compact` on enterprise pages.
- Sparse data (≤8 rows): `tableConstrain` on `TablePageLayout` + `LayoutSection fit` + `TableRegion fit`.
- Large datasets: prefer `PaginatedTable` (`ActivityLogPage`, `DashboardPage` invoices) — default page size 25–30.
- Avoid full-width tables with 2–3 rows on ultrawide monitors.

---

## Card usage

- **Prefer `LayoutSection`** (`variant="raised"` | `"flat"`) over raw `className="card panel"`.
- One section = one purpose (filters, table, form).
- Do not nest `card` inside `LayoutSection` unless showing a true sub-panel (`panel` for inline KPI blocks is OK).

---

## Form layouts

- Use `FormPageLayout` + single `LayoutSection` + `form className="inv-form form-region"`.
- Line-item forms: `recon-line` grid (`admin.css`) for multi-field rows.
- Actions: primary submit `Btn` at bottom; success `inv-success`, errors `ApiErrorCard`.
- Pre-fill from query: `?item=CODE` on stock forms (pattern used on entry/transfer/reconciliation).

---

## Spacing system

CSS variables (`layout-system.css`):

- `--layout-gap-compact` (10px) — default section gap
- `--layout-pad-x` — horizontal padding `clamp(12px, 1.5vw, 24px)`
- `--grid-gap` — KPI/card grids

**PageHeader:** use `dense` prop on enterprise pages.

**Avoid:** arbitrary `marginBottom: 16` on wrappers when `LayoutSection` handles rhythm.

---

## Responsive behavior

- Sidebars: `AdminLayout` / `InventoryLayout` collapse on mobile (`enterprise.css`, `layout.css`).
- Layout shells are full width below max-width; padding from `--layout-pad-x`.
- `item-detail-layout` (when implemented): sidebar stacks above main below 900px.
- POS: separate breakpoints in `pos.css`.

---

## Enterprise admin patterns

1. **PageHeader** — title, subtitle, optional `actions` (export, refresh).
2. **Toolbar** — `toolbar__group` inside `LayoutSection variant="flat" flushHead`.
3. **States** — `PageLoading` → `ApiErrorCard` → `EmptyState` → content.
4. **Partial data** — `PartialDataBanner` when ERP sub-queries fail (purchasing pattern).
5. **Role** — `RoleBadge` where role context helps (not required on every page).
6. **Notifications** — `useNotification()` for success/failure after mutations (where wired).

---

## POS exceptions

- **No** `page-layout` max-width.
- Root: `pos-page` full viewport.
- Do not apply `LayoutSection` / admin table density.
- Currency may show inline `EGP` for speed (consider `fmtCurrency` later).

---

## Analytics pages

- Shell: `AnalyticsLayout`.
- Charts: `TrendChart` + `value-trend` bars (`enterprise.css`).
- Combine KPI row + chart + table sections; each in `LayoutSection`.
- Export/print: `ExportToolbar` when tabular data is primary.

---

## Sidebar behavior (app chrome)

| Layout | Nav |
|--------|-----|
| `AdminLayout` | Collapsible sidebar, mobile overlay |
| `InventoryLayout` | Top `module-nav` + dense content |
| `PurchasingLayout` | Compact `module-nav` under admin |

Active route highlighting via `NavLink`. Admin users see cross-links to POS and Inventory in nav.

---

## Anti-patterns (do not)

- Root `<div>` with stacked `card panel` on new pages
- Requesting unbounded ERP lists without pagination or warning
- Hardcoding `http://127.0.0.1:8000`
- `dangerouslySetInnerHTML` with ERP content
- Mixing layout shell inside another shell

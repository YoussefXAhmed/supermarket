# Next Steps — Production Stabilization Roadmap

Prioritized phases for taking the SPA from **pilot** to **production-grade**. Each phase should end with `npm run build` green and smoke tests on a staging ERPNext site.

---

## Phase 1 — Layout consistency

**Goal:** Every admin/inventory/purchasing page uses `page-layouts`; no stray full-width empty tables.

| Task | Files (priority) |
|------|------------------|
| Migrate legacy pages to `TablePageLayout` / `FormPageLayout` / `AdminPageLayout` | See `KNOWN_ISSUES.md` list (14 files) |
| Remove redundant `card panel` where `LayoutSection` exists | All migrated pages |
| Apply `dense` + `compact` consistently | PageHeader, Table |
| Verify `admin-content--workspace` + shell max-width on ultrawide | Manual QA 2560px |

**Exit criteria:** `grep -L page-layouts src/modules/**/*Page.jsx` returns only `LoginPage`, `POSPage`.

---

## Phase 2 — Workflow validation

**Goal:** Stock and purchasing flows are correct, testable, and documented.

| Task | Detail |
|------|--------|
| E2E smoke tests | Playwright: login → POS sale → stock entry → PR receive |
| Reconciliation UX | Auto-load bin qty on `?item=` + show delta (counted − system) |
| Invoice matching | Verify ERP role can read `Purchase Invoice Item`; document permission |
| Item Details rebuild | `loadItemDetailProfile`, Item Price, sidebar, timeline validation |
| Unify `fmtCurrency` | Remove duplicate `fmt` functions in modules |

**Exit criteria:** Written test checklist passes on staging; Item Details shows selling/buying/valuation/margin.

---

## Phase 3 — Permission hardening

**Goal:** SPA access matches ERP DocType permissions; no silent empty data.

| Task | Detail |
|------|--------|
| Role matrix doc | Map ERP roles → routes → DocTypes |
| Purchasing access | Decide if stock managers need read-only purchasing |
| `PartialDataBanner` everywhere | Any `safeResourceList` or parallel fetch |
| User management | Restrict `UsersPage` to admin; confirm ERP-side rights |
| Activity log | Prefer ERP Activity Log for audit; local log as convenience only |

**Exit criteria:** Test users (cashier, stock, admin) see only allowed routes; warnings when ERP denies a query.

---

## Phase 4 — Analytics correctness

**Goal:** KPIs and reports are labeled honestly and use correct data sources.

| Task | Detail |
|------|--------|
| Dashboard profit | Label as "Estimated" or pull from GL report API |
| Inventory analytics | Validate movement aggregation vs Stock Ledger |
| Purchase reports | Align cost trend with PI dates; handle partial loads |
| Export parity | `ExportToolbar` on inventory reports or shared export hook |
| Pagination | Server-side or client `PaginatedTable` for large catalogs |

**Exit criteria:** No KPI without clear data source in subtitle or tooltip.

---

## Phase 5 — Production readiness

**Goal:** Deploy safely with monitoring and operational runbooks.

| Task | Detail |
|------|--------|
| Complete `PRODUCTION_READINESS.md` checklist | ERP config on site |
| HTTPS + cookie domain | nginx same-origin preferred |
| Error monitoring | Sentry or similar (not in repo today) |
| Performance budget | Lazy routes OK; measure LCP on dashboard |
| Runbook | Login failures, ERP down, session expiry |
| i18n (if required) | Arabic RTL for store staff |

**Exit criteria:** Staging sign-off; production deploy with rollback plan.

---

## FINAL_PROJECT_SCORE (summary)

| Dimension | Score |
|-----------|-------|
| Architecture | 7/10 |
| UX | 6/10 |
| ERP integration | 7/10 |
| Operational completeness | 6/10 |
| Production readiness | 5/10 |
| Scalability | 5/10 |
| Maintainability | 6/10 |

Full rationale: `docs/PROJECT_CONTEXT.md`.

---

## TOP 10 HIGHEST PRIORITY FIXES

1. **Complete Phase 1 layout migration** — 14 pages on legacy `card panel` pattern.
2. **Rebuild `/inventory/items`** — Item Price, pricing margin, sidebar layout, movement validation.
3. **Centralize formatting** — `fmtCurrency` only; remove per-page `Intl` copies.
4. **Add E2E smoke tests** — login, POS, stock entry, purchase receipt.
5. **Paginate or warn on large ERP lists** — alerts (800 bins), inventory snapshot.
6. **Protect purchasing list fields** — never regress `PURCHASE_RECEIPT_LIST_FIELDS`.
7. **Clarify dual inventory routes** — `/admin/inventory` vs `/inventory` purpose in nav/docs.
8. **Permission matrix + PartialDataBanner** — all multi-fetch dashboards.
9. **Production deploy checklist** — env, CORS, HTTPS, nginx SPA fallback.
10. **Honest dashboard KPIs** — estimated vs GL; document in UI.

---

## Suggested order for next sprint (2 weeks)

| Week | Focus |
|------|-------|
| 1 | Phase 1 (all legacy pages) + Item Details MVP |
| 2 | Phase 2 E2E + Phase 3 permission doc + staging deploy |

---

## Documentation maintenance

When adding a feature, update:

- `PROJECT_CONTEXT.md` — if new module or integration pattern
- `CURRENT_STATE.md` — completion status
- `ERP_RULES.md` — new DocTypes or forbidden fields
- `KNOWN_ISSUES.md` — new debt or resolved items

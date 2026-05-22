# Elmahdi Supermarket ERP — Master Documentation Index

**Product:** Elmahdi ERP  
**Stack:** React 18 + Vite 5 SPA → ERPNext (Frappe) REST API  
**Custom backend app:** `erp-custom/elmahdi/`  
**Last updated:** May 2026

---

## Project overview

Elmahdi ERP is a **frontend-only React SPA** that provides the operational UI for a supermarket running on **ERPNext**. There is no application server in this repository — all business logic, stock ledger, GL entries, and document lifecycle live in ERPNext. The SPA calls the standard Frappe REST API via cookie-based session auth.

**Key modules:**

| Module | Route | Primary audience |
|--------|-------|-----------------|
| POS | `/pos` | Cashiers |
| Shifts | `/shifts/*` | Cashiers + Store Manager |
| Inventory | `/inventory/*` | Inventory Clerks + Managers |
| Purchasing | `/admin/purchasing/*` | Purchasing Officers |
| Admin / Reports | `/admin/*` | Store Manager + Administrator |
| Returns | `/admin/returns` | Cashiers + Store Manager |

**Locale / currency:** `en-EG` / **EGP**  
**i18n:** `react-i18next` with `en` + `ar` (RTL) support via `src/i18n/`

---

## Architecture summary

```
Browser (React SPA)
    │  axios + cookies (withCredentials)
    ▼
Vite dev proxy /api  →  ERPNext (Frappe)
    │                     /api/resource/*
    │                     /api/method/*
    ▼
DocTypes: Item, Bin, Stock Entry, Sales/POS Invoice,
          Purchase Receipt, Purchase Invoice, …
```

### Frontend layers

| Layer | Location | Role |
|-------|----------|------|
| Routes & shells | `src/App.jsx`, `src/components/layout/*` | Auth gates, lazy routes, layouts |
| Feature pages | `src/modules/{admin,inventory,purchasing,pos,shifts,returns}/` | Screen-level UI |
| API clients | `src/services/*.js` | ERPNext HTTP, submit flows, aggregations |
| Shared UI | `src/components/ui/` | Tables, headers, exports, charts |
| Design tokens | `src/styles/globals.css`, `enterprise.css`, `layout-system.css` | Dark theme, density, RTL |
| Config | `src/config/erp.js`, `.env` | ERP URLs, dev proxy |

### Backend layers (custom Frappe app)

| Module | Purpose |
|--------|---------|
| `elmahdi/api/erp_submit.py` | Native `doc.submit()` with SLE/GL side-effect verification |
| `elmahdi/api/shifts.py` | Shift open/close, summary aggregation |
| `elmahdi/api/pos_checkout.py` | Atomic POS invoice create + submit |
| `elmahdi/api/pos_closing_approval.py` | Manager shift approval with anti-self-approval guard |
| `elmahdi/api/pos_profile_auth.py` | POS profile scope authorization |
| `elmahdi/api/purchasing.py` | Purchase receipt/invoice workflow + approval |
| `elmahdi/api/invoice_matching.py` | PR → PI matching and auto-payable creation |
| `elmahdi/api/shift_authorization.py` | Role checks for shift operations |
| `elmahdi/api/stock.py` | Stock read endpoints |
| `elmahdi/api/auth.py` | Session identity |

---

## Stock / accounting integrity design

ERPNext is the **authoritative** system of record for all stock and accounting. The SPA **never** sets `docstatus: 1` via raw REST PUT for stock-affecting documents.

### Submit flow (all critical documents)

```
SPA POST create draft
    → SPA calls elmahdi.api.erp_submit.submit_{doctype}
    → Server: doc.submit() [ERPNext native]
    → Server: assert_submitted_side_effects()
        ├── Verifies Stock Ledger Entry (stock docs)
        └── Verifies GL Entry (invoices, payment entries)
    → SPA success / error with draftName for recovery
```

### Stock document truth

- **Authoritative balance:** `Stock Ledger Entry.qty_after_transaction` per (item_code, warehouse)
- **SPA snapshot:** `Bin` read via `getInventorySnapshot` — for display only, can be stale
- **ERP reconciles** final qty on each submit; SPA never manually adjusts Bin

### Dangerous patterns (always avoid)

| Do not | Why | Alternative |
|--------|-----|-------------|
| `fields: ['*']` on ERP lists | Breaks on permission-restricted columns | Explicit field array |
| `purchase_invoice` on PR list `fields` | ERP error — Field not permitted | Use `per_billed`; resolve via PI Item child |
| Unbounded `limit_page_length: 99999` | Timeouts | Paginate or batch |
| Hardcoded company/warehouse names | Multi-site failure | `getCompanies`, warehouse pickers |

---

## Approval workflow

### Purchase receipt → Manager → Accountant

```
Purchasing Officer creates PR
    → If value > threshold → Manager approval (ERP Workflow)
    → Manager approves → PR submit → stock+
    → Invoice matching → PI draft
    → PI submit (update_stock=0) → payable
```

**Critical rule:** `update_stock = 0` on Purchase Invoice when goods already received on PR (prevents double-count).

### Shift closing → Manager

```
Cashier counts cash → POS Closing Entry draft (docstatus=0)
    → Small variance → Manager auto-approves via approve_pos_closing_entry
    → Large variance → Draft awaits explicit manager approval in /shifts/history
    → Manager submits → docstatus=1 → shift closed
```

**Anti-self-approval:** The cashier who created the closing entry cannot approve their own shift.

---

## POS flow

```
1. Load POS Profile (warehouse + price list + company)
2. Open Shift → POS Opening Entry (submitted)
3. Sell:
   a. Search / scan items (catalog via posApi)
   b. Add to cart (client stock check against POS warehouse)
   c. Checkout → elmahdi.api.pos_checkout.create_and_submit_pos_invoice
   d. Server: insert + native submit + SLE verification
   e. Print thermal receipt
4. Close Shift → POS Closing Entry draft
5. Manager review → approve_pos_closing_entry
```

**Stock:** Deducted by ERPNext on POS Invoice native submit — the SPA never modifies Bin directly.  
**POS Profile authorization:** Every API call to shift/checkout validates that the calling user is authorized for the profile (`pos_profile_auth.py`).

---

## Deployment steps

### Local development

```bash
# 1. Copy environment
cp .env.example .env
# Set VITE_ERPNEXT_URL=http://127.0.0.1:8000 (or your bench URL)

# 2. Install dependencies
npm ci

# 3. Start dev server (proxies /api to ERPNext)
npm run dev
# Vite starts at http://localhost:5173

# 4. ERPNext bench (separate terminal)
cd ~/frappe-bench
bench start
```

### Install the custom Frappe app

```bash
cd ~/frappe-bench
bench get-app /path/to/erp-custom/elmahdi  # or git URL
bench --site <site> install-app elmahdi
bench --site <site> migrate
bench restart
bench --site <site> clear-cache
```

### Production build

```bash
npm run build
# Output: dist/  — serve as static files behind nginx/Caddy

# nginx: SPA fallback required
# try_files $uri $uri/ /index.html;

# Environment: VITE_ERPNEXT_URL must point to production ERPNext
# ERPNext: Allow CORS / trusted origins includes SPA URL
```

---

## Mobile / tablet testing

The SPA uses responsive layouts (`enterprise.css`, `layout.css`). To test on a mobile or tablet on the local network:

```bash
# Find your machine's local IP
hostname -I | awk '{print $1}'

# Start Vite exposing on all interfaces
npm run dev -- --host 0.0.0.0

# On mobile: navigate to http://<your-ip>:5173
# POS works best at tablet width (≥768px)
```

Note: The Vite dev proxy must be reachable; ensure ERPNext allows the LAN origin or configure CORS on the bench site.

---

## E2E testing

The project does not yet have an automated E2E test suite. Recommended smoke test matrix (Playwright):

```bash
# Install Playwright (not yet in package.json)
npm install --save-dev @playwright/test
npx playwright install

# Target test scenarios (manual until automated)
# 1. Login as admin → /admin dashboard loads KPIs
# 2. Login as cashier → /pos shift open → sale → receipt → shift close
# 3. Login as stock user → stock entry submit → bin qty changes
# 4. Login as purchasing → purchase receipt receive → stock increases
# 5. Export CSV from purchase reports
# 6. Activity log shows recent entries
```

See `docs/NEXT_STEPS.md` Phase 2 for full test implementation plan.

---

## Important commands

```bash
# Frontend
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build → dist/
npm run preview      # Preview production build locally

# Frappe bench
bench start                                    # Start all services
bench --site <site> migrate                    # Run migrations after app update
bench --site <site> clear-cache               # Clear cache after config changes
bench restart                                  # Restart workers
bench --site <site> execute elmahdi.setup.operational_permissions.execute  # Apply role perms
bench run-tests --app elmahdi --module elmahdi.tests.test_pos_profile_auth  # Run auth tests

# Git
git status                                     # Check modified files
npm run build && echo "Build OK"              # Pre-commit build check
```

---

## Operational role profiles

| Role | ERP Profile | SPA Home | Capabilities |
|------|-------------|----------|-------------|
| Administrator | Elmahdi Administrator | `/admin` | Full system |
| Cashier | Elmahdi Cashier | `/pos` | POS, shifts |
| Inventory Clerk | Elmahdi Inventory Clerk | `/inventory` | Receipt only |
| Inventory Manager | Elmahdi Inventory Manager | `/inventory` | All stock ops |
| Purchasing Officer | Elmahdi Purchasing Officer | `/admin/purchasing` | PR, PI, suppliers |
| Store Manager | Elmahdi Store Manager | `/admin` | Oversight, approvals |

---

## Complete documentation map

### Architecture

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System boundaries, SPA routing, service layer, ERPNext REST integration |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Tech stack, business modules, production goals, project score |
| [ERP_RULES.md](ERP_RULES.md) | ERPNext integration standards, forbidden patterns, submit flow rules |
| [ERP_NATIVE_SUBMIT.md](ERP_NATIVE_SUBMIT.md) | Native submit architecture — why REST PUT is forbidden for stock docs |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Implementation status, in-progress items, technical debt |
| [NEXT_STEPS.md](NEXT_STEPS.md) | Phased roadmap to production, top 10 priority fixes |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Layout debt, risky API calls, missing guards, re-scan commands |
| [UI_RULES.md](UI_RULES.md) | Layout shells, table density, form patterns, anti-patterns |
| [I18N_SETUP.md](I18N_SETUP.md) | i18next setup, en/ar translation keys, RTL rules |
|| [I18N_FINAL_AUDIT.md](I18N_FINAL_AUDIT.md) | Arabic completion audit — 929 EN/AR key parity, UX consistency review |

### Workflows

| Document | Description |
|----------|-------------|
| [APPROVAL_WORKFLOWS.md](APPROVAL_WORKFLOWS.md) | Approval principles, stock/purchasing/shift/return approval matrices |
| [WORKFLOW_INTEGRITY.md](WORKFLOW_INTEGRITY.md) | Comprehensive audit of all submit flows, race conditions, reconciliation |
| [CASHIER_OPERATIONS.md](CASHIER_OPERATIONS.md) | Cashier role guide — allowed actions, shift flow, fraud prevention |
| [INVENTORY_OPERATIONS.md](INVENTORY_OPERATIONS.md) | Inventory clerk and manager guide — stock movements, reconciliation |
| [PURCHASING_OPERATIONS.md](PURCHASING_OPERATIONS.md) | Purchasing officer guide — receive, invoices, matching workflow |
| [STORE_MANAGER_OPERATIONS.md](STORE_MANAGER_OPERATIONS.md) | Store manager guide — approvals, oversight, reporting |
| [SHIFT_WORKFLOW.md](SHIFT_WORKFLOW.md) | POS shift lifecycle — open, operate, close, approval, ERP flow |
| [RETURNS_WORKFLOW.md](RETURNS_WORKFLOW.md) | Customer returns — Phase 1 implementation, capabilities, ERP flow |
| [SUBMIT_FLOW_RISKS.md](SUBMIT_FLOW_RISKS.md) | Submit retry semantics, double-submit risks, race conditions |
| [ERP_TRANSACTION_GAPS.md](ERP_TRANSACTION_GAPS.md) | Accounting gaps, GRNI, returns, cancel/amend, rollback behavior |

### Security & Access Control

| Document | Description |
|----------|-------------|
| [FINAL_ACCESS_ARCHITECTURE.md](FINAL_ACCESS_ARCHITECTURE.md) | Authoritative access model — capability derivation pipeline |
| [CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md) | All capability flags per operational persona |
| [ROUTE_CAPABILITY_MAP.md](ROUTE_CAPABILITY_MAP.md) | Every SPA route → required capability mapping |
| [PERMISSION_MATRIX.md](PERMISSION_MATRIX.md) | Route × role matrix, warehouse scope, approval gaps |
| [OPERATIONAL_PERMISSION_MATRIX.md](OPERATIONAL_PERMISSION_MATRIX.md) | Full operational matrix: routes, actions, forbidden, warehouse, pricing |
| [SUPERMARKET_ROLE_MODEL.md](SUPERMARKET_ROLE_MODEL.md) | Five operational personas, authority hierarchy, production blockers |
| [ROLE_CAPABILITIES.md](ROLE_CAPABILITIES.md) | Current vs target role structure, missing operational roles |
| [ROLE_ASSIGNMENT_RULES.md](ROLE_ASSIGNMENT_RULES.md) | Template → Role Profile → ERP roles, forbidden combinations |
| [ERP_PERMISSION_ALIGNMENT.md](ERP_PERMISSION_ALIGNMENT.md) | DocType permission matrix per role, ERP setup checklist |
| [INVENTORY_CAPABILITIES.md](INVENTORY_CAPABILITIES.md) | Inventory capability flags, clerk vs manager routes and actions |
| [REQUIRED_ROUTE_GUARDS.md](REQUIRED_ROUTE_GUARDS.md) | Guard taxonomy, per-route gap analysis, suggested App.jsx structure |
| [SECURITY_GAPS.md](SECURITY_GAPS.md) | Critical/High/Medium/Low findings from permission audit |
| [REMAINING_SECURITY_GAPS.md](REMAINING_SECURITY_GAPS.md) | Concise gap table — ERP alignment items |
| [SHIFT_PERMISSION_MODEL.md](SHIFT_PERMISSION_MODEL.md) | Authoritative policy: who may do what on POS Closing Entry |
| [SHIFT_CAPABILITY_MATRIX.md](SHIFT_CAPABILITY_MATRIX.md) | Shift capability flags by role |
| [POS_SHIFT_ERP_PERMISSIONS.md](POS_SHIFT_ERP_PERMISSIONS.md) | ERP DocType permission matrix for POS shift + Desk setup guide |
| [POS_PROFILE_AUTHORIZATION.md](POS_PROFILE_AUTHORIZATION.md) | POS profile scope authorization — production-ready implementation |
| [USER_MANAGEMENT_ARCHITECTURE.md](USER_MANAGEMENT_ARCHITECTURE.md) | User provisioning model, API sequences, weakness analysis |
| [USER_CREATION_FLOW.md](USER_CREATION_FLOW.md) | Step-by-step provisioning: REST sequence + custom method |
| [USER_LIFECYCLE_POLICY.md](USER_LIFECYCLE_POLICY.md) | Disable vs delete policy, onboarding, offboarding, approvals |
| [WAREHOUSE_PERMISSION_FLOW.md](WAREHOUSE_PERMISSION_FLOW.md) | Warehouse User Permission provisioning and runtime enforcement |
| [ADMIN_WAREHOUSE_MANAGEMENT.md](ADMIN_WAREHOUSE_MANAGEMENT.md) | Admin warehouse CRUD features, deletion safety, permission matrix |

### Testing & Quality

| Document | Description |
|----------|-------------|
| [STOCK_SAFETY_AUDIT.md](STOCK_SAFETY_AUDIT.md) | Stock movement audit — risk by operation, reconciliation gaps |
| [SHIFT_PRODUCTION_BLOCKERS.md](SHIFT_PRODUCTION_BLOCKERS.md) | Shift production blockers + UAT checklist |
| [SHIFT_REMAINING_GAPS.md](SHIFT_REMAINING_GAPS.md) | Shift operational gaps — invoice linking, payment mix, voids |
| [RETURNS_PRODUCTION_BLOCKERS.md](RETURNS_PRODUCTION_BLOCKERS.md) | Returns production blockers + test scenarios |
| [RETURNS_REMAINING_GAPS.md](RETURNS_REMAINING_GAPS.md) | Returns operational gaps — ERP permissions, partial returns, audit |

### Deployment

| Document | Description |
|----------|-------------|
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | Production readiness report — ERPNext config checklist, deployment steps, security checklist |

### Archive (historical reports)

| Document | Original purpose |
|----------|-----------------|
| [archive/BACKEND_PERMISSION_AUDIT.md](./archive/BACKEND_PERMISSION_AUDIT.md) | Static analysis of all `@frappe.whitelist()` endpoints — 11 findings (B-01 through B-11) |
| [archive/SECURITY_AUDIT_PHASE2.md](./archive/SECURITY_AUDIT_PHASE2.md) | Frontend SPA permission audit — 8 findings (F-01 through F-08) |
| [archive/PRODUCTION_READINESS_SCORE.md](./archive/PRODUCTION_READINESS_SCORE.md) | Access control readiness score (78/100) |
| [archive/UI_STABILIZATION_AUDIT.md](./archive/UI_STABILIZATION_AUDIT.md) | UI layout migration audit — compliant vs legacy page list |
| [archive/returns_workflow_phase1_implementation_plan.md](./archive/returns_workflow_phase1_implementation_plan.md) | Phase 1 implementation plan for returns (executed) |
| [archive/SHIFT_WORKFLOW_SUMMARY.md](./archive/SHIFT_WORKFLOW_SUMMARY.md) | Original shift workflow summary (merged into SHIFT_WORKFLOW.md) |
| [archive/SHIFT_ERP_FLOW.md](./archive/SHIFT_ERP_FLOW.md) | Original shift ERP flow detail (merged into SHIFT_WORKFLOW.md) |
| [archive/RETURNS_ERP_FLOW.md](./archive/RETURNS_ERP_FLOW.md) | Original returns ERP flow (merged into RETURNS_WORKFLOW.md) |
| [archive/RETURNS_CAPABILITY_MATRIX.md](./archive/RETURNS_CAPABILITY_MATRIX.md) | Original returns capability matrix (merged into RETURNS_WORKFLOW.md) |
| [archive/RETURNS_PHASE1_SUMMARY.md](./archive/RETURNS_PHASE1_SUMMARY.md) | Original returns Phase 1 summary (merged into RETURNS_WORKFLOW.md) |
| [archive/SHIFT_NEXT_PHASE.md](./archive/SHIFT_NEXT_PHASE.md) | Shift operational next phase notes |
| [archive/RETURNS_NEXT_PHASE.md](./archive/RETURNS_NEXT_PHASE.md) | Returns Phase 2/3 roadmap notes |

---

## Quick reference

### Most important files to read first

| File | Why |
|------|-----|
| `src/App.jsx` | All routes |
| `src/config/erp.js` | API base URL rules |
| `src/services/api.js` | Auth, items, sales invoices, dashboard |
| `src/services/inventoryApi.js` | Stock documents |
| `src/services/purchasingApi.js` | PR/PI/suppliers |
| `src/context/AuthContext.jsx` | Role → capability mapping |
| `src/auth/capabilities.js` | Capability derivation |
| `src/auth/capabilityProfiles.js` | Operational persona templates |
| `erp-custom/elmahdi/elmahdi/api/erp_submit.py` | Submit safety layer |
| `erp-custom/elmahdi/elmahdi/api/pos_profile_auth.py` | POS authorization |

### Production blockers (top priority)

1. Install `elmahdi` Frappe app on bench; configure Role Profiles
2. Verify cashier has **no Submit on POS Closing Entry** in ERP DocType permissions
3. Remove `System Manager` from store staff accounts
4. Verify `update_stock = 0` on Purchase Invoice when PR already posted
5. Configure ERP workflows: Stock Reconciliation, large PR/PI

See `PRODUCTION_READINESS.md` for the full ERPNext configuration checklist.

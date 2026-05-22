# Documentation Cleanup Report

**Date:** May 2026  
**Change:** Flattened 6-subfolder structure back to a single `docs/` root (+ `docs/archive/`)

---

## Files at docs/ root (active reference)

| File | Description |
|------|-------------|
| `MASTER_INDEX.md` | Project-wide navigation hub |
| `ARCHITECTURE.md` | System boundaries, SPA routing, service layer, ERPNext REST integration |
| `PROJECT_CONTEXT.md` | Tech stack, business modules, production goals, project score |
| `ERP_RULES.md` | ERPNext integration standards, forbidden patterns, submit flow rules |
| `ERP_NATIVE_SUBMIT.md` | Native submit architecture — why REST PUT is forbidden for stock docs |
| `CURRENT_STATE.md` | Implementation status, in-progress items, technical debt |
| `NEXT_STEPS.md` | Phased roadmap to production, top 10 priority fixes |
| `KNOWN_ISSUES.md` | Layout debt, risky API calls, missing guards, re-scan commands |
| `UI_RULES.md` | Layout shells, table density, form patterns, anti-patterns |
| `I18N_SETUP.md` | i18next setup, en/ar translation keys, RTL rules |
| `I18N_FINAL_AUDIT.md` | Arabic completion audit — 929 EN/AR key parity, UX consistency review |
| `APPROVAL_WORKFLOWS.md` | Approval principles, stock/purchasing/shift/return approval matrices |
| `WORKFLOW_INTEGRITY.md` | Comprehensive audit of all submit flows, race conditions, reconciliation |
| `CASHIER_OPERATIONS.md` | Cashier role guide — allowed actions, shift flow, fraud prevention |
| `INVENTORY_OPERATIONS.md` | Inventory clerk and manager guide — stock movements, reconciliation |
| `PURCHASING_OPERATIONS.md` | Purchasing officer guide — receive, invoices, matching workflow |
| `STORE_MANAGER_OPERATIONS.md` | Store manager guide — approvals, oversight, reporting |
| `SHIFT_WORKFLOW.md` | POS shift lifecycle — open, operate, close, approval, ERP flow |
| `RETURNS_WORKFLOW.md` | Customer returns — Phase 1 implementation, capabilities, ERP flow |
| `SUBMIT_FLOW_RISKS.md` | Submit retry semantics, double-submit risks, race conditions |
| `ERP_TRANSACTION_GAPS.md` | Accounting gaps, GRNI, returns, cancel/amend, rollback behavior |
| `FINAL_ACCESS_ARCHITECTURE.md` | Authoritative access model — capability derivation pipeline |
| `CAPABILITY_MATRIX.md` | All capability flags per operational persona |
| `ROUTE_CAPABILITY_MAP.md` | Every SPA route → required capability mapping |
| `PERMISSION_MATRIX.md` | Route × role matrix, warehouse scope, approval gaps |
| `OPERATIONAL_PERMISSION_MATRIX.md` | Full operational matrix: routes, actions, forbidden, warehouse, pricing |
| `SUPERMARKET_ROLE_MODEL.md` | Five operational personas, authority hierarchy, production blockers |
| `ROLE_CAPABILITIES.md` | Current vs target role structure, missing operational roles |
| `ROLE_ASSIGNMENT_RULES.md` | Template → Role Profile → ERP roles, forbidden combinations |
| `ERP_PERMISSION_ALIGNMENT.md` | DocType permission matrix per role, ERP setup checklist |
| `INVENTORY_CAPABILITIES.md` | Inventory capability flags, clerk vs manager routes and actions |
| `REQUIRED_ROUTE_GUARDS.md` | Guard taxonomy, per-route gap analysis, suggested App.jsx structure |
| `SECURITY_GAPS.md` | Critical/High/Medium/Low findings from permission audit |
| `REMAINING_SECURITY_GAPS.md` | Concise gap table — ERP alignment items |
| `SHIFT_PERMISSION_MODEL.md` | Authoritative policy: who may do what on POS Closing Entry |
| `SHIFT_CAPABILITY_MATRIX.md` | Shift capability flags by role |
| `POS_SHIFT_ERP_PERMISSIONS.md` | ERP DocType permission matrix for POS shift + Desk setup guide |
| `POS_PROFILE_AUTHORIZATION.md` | POS profile scope authorization — production-ready implementation |
| `USER_MANAGEMENT_ARCHITECTURE.md` | User provisioning model, API sequences, weakness analysis |
| `USER_CREATION_FLOW.md` | Step-by-step provisioning: REST sequence + custom method |
| `USER_LIFECYCLE_POLICY.md` | Disable vs delete policy, onboarding, offboarding, approvals |
| `WAREHOUSE_PERMISSION_FLOW.md` | Warehouse User Permission provisioning and runtime enforcement |
| `ADMIN_WAREHOUSE_MANAGEMENT.md` | Admin warehouse CRUD features, deletion safety, permission matrix |
| `STOCK_SAFETY_AUDIT.md` | Stock movement audit — risk by operation, reconciliation gaps |
| `SHIFT_PRODUCTION_BLOCKERS.md` | Shift production blockers + UAT checklist |
| `SHIFT_REMAINING_GAPS.md` | Shift operational gaps — invoice linking, payment mix, voids |
| `RETURNS_PRODUCTION_BLOCKERS.md` | Returns production blockers + test scenarios |
| `RETURNS_REMAINING_GAPS.md` | Returns operational gaps — ERP permissions, partial returns, audit |
| `PRODUCTION_READINESS.md` | Production readiness report — ERPNext config checklist, deployment steps, security checklist |

---

## Files in docs/archive/ (historical, no longer primary reference)

| File | Reason archived |
|------|----------------|
| `BACKEND_PERMISSION_AUDIT.md` | Iterative static analysis report (B-01 to B-11); actionable findings captured in `SECURITY_GAPS.md` |
| `SECURITY_AUDIT_PHASE2.md` | Iterative frontend permission scan (F-01 to F-08); findings tracked in `SECURITY_GAPS.md` and `REQUIRED_ROUTE_GUARDS.md` |
| `PRODUCTION_READINESS_SCORE.md` | One-shot score report (78/100); score referenced in `PROJECT_CONTEXT.md`, checklist lives in `PRODUCTION_READINESS.md` |
| `UI_STABILIZATION_AUDIT.md` | Migration status audit; legacy page list now maintained in `KNOWN_ISSUES.md` |
| `returns_workflow_phase1_implementation_plan.md` | Pre-execution implementation plan; feature delivered, canonical reference is `RETURNS_WORKFLOW.md` |
| `SHIFT_WORKFLOW_SUMMARY.md` | Merge source — content folded into `SHIFT_WORKFLOW.md` |
| `SHIFT_ERP_FLOW.md` | Merge source — content folded into `SHIFT_WORKFLOW.md` |
| `RETURNS_ERP_FLOW.md` | Merge source — content folded into `RETURNS_WORKFLOW.md` |
| `RETURNS_CAPABILITY_MATRIX.md` | Merge source — content folded into `RETURNS_WORKFLOW.md` |
| `RETURNS_PHASE1_SUMMARY.md` | Merge source — content folded into `RETURNS_WORKFLOW.md` |
| `SHIFT_NEXT_PHASE.md` | Phase notes captured in `NEXT_STEPS.md` |
| `RETURNS_NEXT_PHASE.md` | Phase 2/3 notes captured in out-of-scope section of `RETURNS_WORKFLOW.md` |

---

## Final directory tree

```
docs/
├── MASTER_INDEX.md
├── DOCS_CLEANUP_REPORT.md
│
├── ARCHITECTURE.md
├── PROJECT_CONTEXT.md
├── ERP_RULES.md
├── ERP_NATIVE_SUBMIT.md
├── CURRENT_STATE.md
├── NEXT_STEPS.md
├── KNOWN_ISSUES.md
├── UI_RULES.md
├── I18N_SETUP.md
├── I18N_FINAL_AUDIT.md
│
├── APPROVAL_WORKFLOWS.md
├── WORKFLOW_INTEGRITY.md
├── CASHIER_OPERATIONS.md
├── INVENTORY_OPERATIONS.md
├── PURCHASING_OPERATIONS.md
├── STORE_MANAGER_OPERATIONS.md
├── SHIFT_WORKFLOW.md
├── RETURNS_WORKFLOW.md
├── SUBMIT_FLOW_RISKS.md
├── ERP_TRANSACTION_GAPS.md
│
├── FINAL_ACCESS_ARCHITECTURE.md
├── CAPABILITY_MATRIX.md
├── ROUTE_CAPABILITY_MAP.md
├── PERMISSION_MATRIX.md
├── OPERATIONAL_PERMISSION_MATRIX.md
├── SUPERMARKET_ROLE_MODEL.md
├── ROLE_CAPABILITIES.md
├── ROLE_ASSIGNMENT_RULES.md
├── ERP_PERMISSION_ALIGNMENT.md
├── INVENTORY_CAPABILITIES.md
├── REQUIRED_ROUTE_GUARDS.md
├── SECURITY_GAPS.md
├── REMAINING_SECURITY_GAPS.md
├── SHIFT_PERMISSION_MODEL.md
├── SHIFT_CAPABILITY_MATRIX.md
├── POS_SHIFT_ERP_PERMISSIONS.md
├── POS_PROFILE_AUTHORIZATION.md
├── USER_MANAGEMENT_ARCHITECTURE.md
├── USER_CREATION_FLOW.md
├── USER_LIFECYCLE_POLICY.md
├── WAREHOUSE_PERMISSION_FLOW.md
├── ADMIN_WAREHOUSE_MANAGEMENT.md
│
├── STOCK_SAFETY_AUDIT.md
├── SHIFT_PRODUCTION_BLOCKERS.md
├── SHIFT_REMAINING_GAPS.md
├── RETURNS_PRODUCTION_BLOCKERS.md
├── RETURNS_REMAINING_GAPS.md
│
├── PRODUCTION_READINESS.md
│
├── archive/                          ← Historical reports — not primary reference
│   ├── BACKEND_PERMISSION_AUDIT.md
│   ├── SECURITY_AUDIT_PHASE2.md
│   ├── PRODUCTION_READINESS_SCORE.md
│   ├── UI_STABILIZATION_AUDIT.md
│   ├── returns_workflow_phase1_implementation_plan.md
│   ├── SHIFT_WORKFLOW_SUMMARY.md
│   ├── SHIFT_ERP_FLOW.md
│   ├── RETURNS_ERP_FLOW.md
│   ├── RETURNS_CAPABILITY_MATRIX.md
│   ├── RETURNS_PHASE1_SUMMARY.md
│   ├── SHIFT_NEXT_PHASE.md
│   └── RETURNS_NEXT_PHASE.md
│
├── diagrams/
├── gifs/
└── screenshots/
```

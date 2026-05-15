# Remaining Security Gaps

SPA capability gates are necessary but not sufficient. ERPNext must mirror this matrix.

| Gap | Risk | Mitigation |
|-----|------|------------|
| ERP DocType perms wider than SPA | API bypass via curl/Desk | Align Role Profiles per `docs/ERP_PERMISSION_ALIGNMENT.md` |
| Store Manager ERP write on PI/PR | Submit without SPA | Workflow + DocType limits on ERP |
| `get_session_identity` missing | Login fail-closed | Install `elmahdi` app on bench |
| Direct `/admin/users` URL bookmark | Low if ERP denies User write | ERP deny User create for Store Manager |
| POS checkout API | Cashier-only in ERP | Deny Sales Invoice submit for non-cashier roles |
| Valuation fields in API responses | Clerk sees cost | ERP field-level / report permissions |
| Administrator shared accounts | Audit loss | Per-user accounts, 2FA on admin |
| No server-side capability API | SPA-only model | Acceptable if ERP enforces; optional future `get_capabilities` |
| Desk access parallel to SPA | Full ERP UI | Restrict Desk modules per role profile |
| Legacy Desk users without Elmahdi profile | Role-name fallback only | Assign Role Profiles |

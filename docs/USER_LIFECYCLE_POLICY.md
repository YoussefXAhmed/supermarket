# User Lifecycle Policy

**Version:** 1.0 · May 2026  
**Purpose:** Disable vs delete, onboarding, role changes, offboarding, approvals, and audit expectations for supermarket operational accounts.

---

## Lifecycle states

```text
                    ┌──────────────┐
                    │  (not exists) │
                    └──────┬───────┘
                           │ provision
                           ▼
                    ┌──────────────┐
              ┌────│   PROVISIONED │────┐
              │    │   enabled=1   │    │
              │    └──────┬───────┘    │
              │           │            │
     disable  │           │ active     │ role change
              │           ▼            │ (disable → edit → enable)
              │    ┌──────────────┐    │
              └───►│   DISABLED   │◄───┘
                   │  enabled=0   │
                   └──────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       ┌──────────────┐        ┌──────────────┐
       │  RE-ENABLED  │        │    DELETED    │
       │  (approval)  │        │  Desk only    │
       └──────────────┘        └──────────────┘
```

---

## Disable vs delete

### Disable (default offboarding)

| Aspect | Policy |
|--------|--------|
| When | Staff leaves, suspension, investigation, role change pending |
| SPA | **Allow** — primary action; replace Delete button prominence |
| ERP | `PUT User.enabled = 0` |
| Login | Blocked immediately |
| Historical data | Preserved — POS invoices, stock entries still attributed |
| User Permissions | Retained |
| Reversible | Yes — enable after approval |

**Required:** reason code + optional Comment on User doc.

**Reason codes (enum):**

- `left_employment`
- `role_change_pending`
- `security_investigation`
- `extended_leave`
- `duplicate_account`
- `other` (+ free text)

### Delete (forbidden in SPA)

| Aspect | Policy |
|--------|--------|
| When | Mistaken test user only; never for staff with transactions |
| SPA | **Remove** delete button and `deleteUser` API usage |
| ERP | Restrict DELETE on User DocType for all except break-glass System Manager |
| Impact | Broken links in submitted documents; audit gaps |
| Alternative | Disable + rename email to `archived+{user}@internal` (Desk) |

**Current risk:** `UsersPage` calls `deleteUser` with `window.confirm` only — see [SECURITY_GAPS.md](./SECURITY_GAPS.md) C2.

---

## Onboarding policy

| Step | Owner | SLA |
|------|-------|-----|
| Request from store manager | Manager → Admin ticket | — |
| Admin selects template + scope | Administrator | Same day |
| Provision + verify | Administrator | Before shift |
| Welcome email / password | ERP email | User sets password |
| First login check | User + optional admin spot-check | First shift |
| POS Profile link (cashier) | Desk if not in SPA | Before register use |

**No shared accounts:** one ERP user per person; register login must not use store generic `cashier@`.

---

## Role change policy

| Change | Procedure |
|--------|-----------|
| Promotion clerk → manager | Disable → change Role Profile → update User Permissions → enable |
| Demotion | Same + manager approval |
| Lateral (clerk → purchasing) | New template; remove old WH permissions; add receive WH |
| Add warehouse | Add User Permission row; no disable required |
| Remove warehouse | Remove permission; confirm no open drafts in that WH |

**Active session:** User disabled mid-shift cannot complete checkout — coordinate at shift break.

---

## Approval requirements

| Action | Approver | Notes |
|--------|----------|-------|
| Create cashier / clerk / purchasing | Store or HQ Administrator | Logged |
| Create store manager | HQ Administrator (2nd person) | No self-approval |
| Create administrator | Owner / IT | Desk or break-glass |
| Disable user | Administrator | Notify store manager if operational |
| Re-enable after investigation | Store Manager + Administrator | Document clearance |
| Delete user | **Two** ERP Desk admins | Not SPA |
| Export user list | Administrator | Audit optional |
| Bulk disable (incident) | HQ only | Playbook |

---

## Self-service and lockout guards

| Guard | Rule |
|-------|------|
| Disable self | Block |
| Delete self | Block |
| Remove own admin role | Block |
| Disable last enabled Administrator | Block — count ≥ 2 admins required |
| Export while investigation | Restrict |

---

## Offboarding checklist

1. Confirm last shift closed (POS Closing Entry).  
2. Disable user with reason `left_employment`.  
3. Do **not** delete.  
4. Revoke optional API keys / mobile (if any).  
5. Remove from POS Profile user list (Desk).  
6. Archive email in HR system — not in ERP unless Desk rename policy.  
7. Review user's last 7 days transactions (manager).  
8. Comment on User: offboarded date, manager name.

---

## Reconciliation with fraud investigation

| State | Policy |
|-------|--------|
| Under investigation | Disable immediately; preserve permissions |
| Cleared | Re-enable with Comment |
| Terminated with fraud | Disable; legal holds on export; Desk review only |

Never delete user with open POS or stock investigations.

---

## Audit logging expectations

| Event | ERP | SPA |
|-------|-----|-----|
| User created | Version | USER_CREATED |
| Enabled | Version | USER_ENABLED |
| Disabled | Version + Comment (reason) | USER_DISABLED |
| Role profile changed | Version | USER_ROLE_CHANGED |
| Permission changed | User Permission Version | USER_SCOPE_CHANGED |
| Delete | Deletion audit (if enabled) | **None** |
| Failed disable | Error Log | USER_DISABLE_FAILED |
| Admin listed users | — | Optional ACCESS_USERS_LIST |

**Retention:** ERP indefinite; align with company policy.

**Investigation pack:** User doc Versions + Activity Log + linked POS Invoices by `owner`.

---

## Confirmation flows (required before implementation)

| Action | UX requirement |
|--------|----------------|
| Disable | Modal: reason dropdown + "Type username to confirm" |
| Enable | Show disable reason history + confirm |
| Create Store Manager | Second admin email approval or token |
| Change template | Side-by-side permission diff |
| Delete | **Not in SPA** |

**Current:** Delete uses single `window.confirm` — insufficient.

---

## Password and access recovery

| Action | Channel |
|--------|---------|
| Forgot password | ERP reset email |
| Admin reset | `send_welcome_email` or Desk reset |
| Locked account | Desk unlock |

SPA does not store passwords.

---

## Dual employment / multi-role (discouraged)

| Policy | Detail |
|--------|--------|
| Default | One template per user |
| Exception | HQ-approved dual role (e.g. manager + backup cashier) |
| Implementation | Combined Role Profile in ERP — not two templates in SPA |

Prefer separate accounts for separation of duties.

---

## Current `UsersPage` lifecycle gaps

| Policy | Current behavior |
|--------|------------------|
| Disable with reason | Toggle only — no reason |
| Delete forbidden | Delete button present |
| Re-enable approval | Immediate toggle |
| Last admin guard | None |
| Self-disable guard | None |
| Audit comment | None |
| Role visible in list | No `role_profile_name` column |
| Offboarding checklist | Not in app — process only |

---

## Production policy summary

| Do | Don't |
|----|-------|
| Disable users | Delete from SPA |
| Assign Role Profile + User Permissions at create | Create email-only users |
| Use reason codes on disable | Toggle without audit |
| HQ approval for Store Manager | Self-promote via Desk |
| Verify permissions after create | Assume ERP defaults |
| Keep disabled users for audit | Purge users with history |

---

## Related documents

- [USER_MANAGEMENT_ARCHITECTURE.md](./USER_MANAGEMENT_ARCHITECTURE.md)
- [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md)
- [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md)
- [SECURITY_GAPS.md](./SECURITY_GAPS.md)

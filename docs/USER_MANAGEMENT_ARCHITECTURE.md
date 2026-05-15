# User Management Architecture

**Version:** 1.0 · May 2026  
**System:** Elmahdi ERP SPA + ERPNext (Frappe)  
**Purpose:** Production-safe operational user lifecycle from the frontend — without making the SPA the security authority.

---

## Goals

1. **Administrators** create and manage **Cashier**, **Inventory Clerk**, **Purchasing Officer**, and **Store Manager** accounts from `/admin/users` with least privilege.
2. **ERPNext** enforces DocType permissions, User Permissions, and Role Profiles on every API call.
3. **Auditability** — every mutation traceable in ERP Version / Activity Log; SPA supplements with structured client events.
4. **Fraud prevention** — no orphan users, no System Manager on store staff, no delete-in-production, warehouse and price-list scoping at creation time.

**Out of scope (this document):** UI redesign, new screens, custom Frappe apps. This is the **operational and API model** only.

---

## Authority boundaries

| Concern | SPA (frontend) | ERPNext (authoritative) |
|---------|----------------|-------------------------|
| Who may open Users page | Route guard `require="admin"` + future `canManageUsers` | User DocType: read/write for Administrator role only |
| Create user | Orchestrates multi-step API sequence | Validates email, roles, company; sends welcome email if allowed |
| Assign operational role | Sends `role_profile_name` + optional explicit roles | Role Profile expands to child roles; permissions apply immediately |
| Warehouse / price list scope | Collects IDs from admin-approved lists; posts User Permission rows | Enforces on Bin, Stock Entry, POS Profile queries |
| Disable user | `PUT User.enabled = 0` | Blocks login; preserves audit history |
| Delete user | **Must not** in production SPA | Desk-only with elevated rights; prefer never |
| Password reset | Trigger welcome / reset email | Frappe email + password policy |
| Session / home path | `deriveCapabilities` after login | Roles on User doc |
| Submit stock / sales | Not user management | Per-role DocType permissions |

**Rule:** If SPA and ERP disagree, **ERP wins**. SPA hides or guides; it does not grant rights the API would deny.

```text
┌─────────────────────────────────────────────────────────────┐
│                     Administrator (SPA)                      │
│  Select template → User + Role Profile + User Permissions   │
└────────────────────────────┬────────────────────────────────┘
                             │ REST (cookie session)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                        ERPNext                               │
│  User · Role Profile · Role · User Permission · Company      │
│  DocType Permissions · Workflow · Activity Log / Version     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Operational user (Cashier, Clerk, …)              │
│  Login → capabilities from roles → scoped SPA routes         │
└─────────────────────────────────────────────────────────────┘
```

---

## Operational role templates

Each template is a **named bundle** the admin selects once; implementation maps to ERP artifacts.

| Template ID | Display name | ERP Role Profile | SPA home | User Permissions (typical) |
|-------------|--------------|------------------|----------|----------------------------|
| `cashier` | Cashier | Elmahdi Cashier | `/pos` | Warehouse (floor), Price List (retail), Company |
| `inventory_clerk` | Inventory Clerk | Elmahdi Inventory Clerk | `/inventory` | Warehouse(s) assigned, Company |
| `purchasing_officer` | Purchasing Officer | Elmahdi Purchasing Officer | `/admin/purchasing` | Receive warehouse(s), Company |
| `store_manager` | Store Manager | Elmahdi Store Manager | `/admin` (scoped) | All store warehouses, Company |
| `administrator` | Administrator | Elmahdi Administrator | `/admin` | Company (HQ only; no WH limit or all WH) |

**Forbidden in templates:** raw `System Manager` on store templates; `Profile Manager` / `Website Manager` on cashier; dual template without explicit approval (e.g. Cashier + Inventory Clerk).

See [ROLE_ASSIGNMENT_RULES.md](./ROLE_ASSIGNMENT_RULES.md).

---

## SPA service layer (target)

Today: `src/services/api.js` exposes `getUsers`, `createUser`, `setUserEnabled`, `deleteUser`, `getUserRoles`.

**Target module:** `src/services/userManagementApi.js` (or extend `api.js`) with:

| Function | Purpose |
|----------|---------|
| `listOperationalUsers(filters)` | Users with `role_profile_name`, store, enabled |
| `provisionUser(payload)` | Atomic sequence: User → Role Profile → User Permissions |
| `updateUserRoleProfile(name, profile)` | Change template with validation |
| `replaceUserPermissions(name, rules)` | Sync WH / Price List rules |
| `disableUser(name, reason)` | enabled=0 + Comment |
| `enableUser(name)` | enabled=1 |
| `getRoleProfiles()` | List allowed profiles for picker |
| `getAssignableWarehouses(storeId)` | WH admin may assign |
| `validateProvisioning(payload)` | Client pre-check before POST |

**Dangerous mutations** must go through server-side Frappe method (recommended) instead of raw REST chains:

`POST /api/method/elmahdi.user_management.provision_operational_user`

Benefits: single transaction, validation, audit Comment, block forbidden profiles.

Until custom method exists, document **ordered REST sequence** in [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md).

---

## ERP role assignment mapping (summary)

| SPA template | Role Profile (ERP) | Underlying roles (examples) |
|--------------|-------------------|----------------------------|
| Cashier | Elmahdi Cashier | POS User, Cashier |
| Inventory Clerk | Elmahdi Inventory Clerk | Stock User, Warehouse User |
| Purchasing Officer | Elmahdi Purchasing Officer | Purchase User |
| Store Manager | Elmahdi Store Manager | Stock Manager, Purchase Manager, Sales Manager, Reports Manager |
| Administrator | Elmahdi Administrator | Trimmed System Manager subset |

**Never** assign `System Manager` via SPA for operational templates.

Full matrix: [ROLE_ASSIGNMENT_RULES.md](./ROLE_ASSIGNMENT_RULES.md).

---

## User Permissions creation

Applied **at provisioning** for scoped roles:

| allow | DocType | for_value | applies_to |
|-------|---------|-----------|------------|
| Cashier | Warehouse | `Stores - WH-Floor` | All docs |
| Cashier | Price List | `Standard Selling` | All docs |
| Inventory Clerk | Warehouse | each assigned WH | All docs |
| Purchasing Officer | Warehouse | backroom / receive WH | All docs |
| Store Manager | Warehouse | all store WH names | All docs |

Flow: [WAREHOUSE_PERMISSION_FLOW.md](./WAREHOUSE_PERMISSION_FLOW.md).

---

## Disable vs delete

| Action | Production policy |
|--------|-------------------|
| **Disable** | Default offboarding — immediate login block, history retained |
| **Delete** | **Forbidden from SPA** — ERP Desk + second approver only for mistaken test users |
| **Re-enable** | Manager approval if user left under investigation |

Details: [USER_LIFECYCLE_POLICY.md](./USER_LIFECYCLE_POLICY.md).

---

## Approval requirements

| Action | Self-serve admin | Second approver |
|--------|------------------|-----------------|
| Create cashier / clerk | Yes | — |
| Create purchasing officer | Yes | Optional store manager notify |
| Create store manager | **No** — HQ admin only | HQ or second admin |
| Change role profile (upgrade) | Yes with confirm | Manager → Store Manager needs HQ |
| Add second warehouse | Yes | — |
| Disable user | Yes | Manager notify if active shift |
| Delete user | **Never in SPA** | Two-person ERP Desk |
| Reset password / resend welcome | Yes | — |

---

## Audit logging expectations

| Event | ERP (required) | SPA (target) |
|-------|----------------|--------------|
| User created | User Version, optional Comment with template ID | `logActivity` USER_CREATED |
| Role profile changed | User Version | USER_ROLE_CHANGED |
| User Permission added/removed | User Permission Version | USER_SCOPE_CHANGED |
| Disabled | User Version, `enabled=0` | USER_DISABLED + reason |
| Enabled | User Version | USER_ENABLED |
| Delete | User deletion log | **Not from SPA** |
| Failed provision | — | Error + partial doc names for cleanup |
| Admin viewed user list | — | Optional access log |

**Compliance:** ERP Activity Log + Version is legal record; SPA `localStorage` activity is **not** sufficient.

---

## Dangerous mutation protections

| Mutation | Protection |
|----------|------------|
| Delete User | Remove from SPA; ERP role cannot DELETE User for store admins |
| Create without Role Profile | Block submit; ERP mandatory field |
| Assign System Manager | Block in API validator + UI |
| Assign self additional roles | ERP: admin cannot escalate own User without break-glass |
| Disable self | Block while session active |
| Disable last admin | Block with count check |
| Change WH permission to other store | Validate against admin's assignable WH set |
| Bulk export users | Rate limit; audit |
| `role_profile_name` only in POST without permissions | Follow-up step required before marking "complete" |

---

## Required ERP API calls (reference)

### Read

```http
GET /api/resource/User?fields=["name","full_name","email","enabled","user_type","last_login","role_profile_name"]&filters=[["name","!=","Guest"]]
GET /api/resource/User/{username}?fields=["name","full_name","email","enabled","role_profile_name","roles"]
GET /api/resource/Role Profile?fields=["name"]&filters=[["disabled","=",0]]
GET /api/resource/User Permission?filters=[["user","=","{username}"]]&fields=["name","allow","for_value","applicable_for"]
GET /api/resource/Warehouse?fields=["name","warehouse_name","company"]&filters=[["disabled","=",0]]
GET /api/resource/Price List?fields=["name","enabled"]
```

### Write (ordered provisioning — see USER_CREATION_FLOW)

```http
POST /api/resource/User
PUT  /api/resource/User/{username}          # role_profile_name, roles child if needed
POST /api/resource/User Permission            # per rule
PUT  /api/resource/User/{username}            # enabled, send_welcome_email
```

### Optional server method (recommended production)

```http
POST /api/method/elmahdi.user_management.provision_operational_user
Body: { template, email, first_name, warehouses[], price_list?, company, send_welcome_email }
```

```http
POST /api/method/elmahdi.user_management.disable_operational_user
Body: { user, reason }
```

---

## Integration with SPA auth

After provisioning, user logs in:

1. `getCurrentUser` → username  
2. `getUserRoles` → `roles[]`, `role_profile_name`  
3. `deriveCapabilities` → `isPOS`, `isInventory`, `isPurchasing`, inventory caps  
4. `homePathFromCapabilities` → redirect  

**Production requirement:** Remove identifier inference fallback ([SECURITY_GAPS.md](./SECURITY_GAPS.md) C4). Unprovisioned users (no roles) must land on `/login` with error.

**Future:** Load `warehouseScope` from User Permission query into auth boot — [WAREHOUSE_PERMISSION_FLOW.md](./WAREHOUSE_PERMISSION_FLOW.md).

---

## Current `UsersPage` weaknesses

| # | Weakness | Risk |
|---|----------|------|
| W1 | Create sends only `email`, `first_name`, `enabled` — no `role_profile_name` | Users with no operational access or wrong defaults |
| W2 | No User Permission setup | Cross-warehouse visibility in ERP |
| W3 | `deleteUser` with `window.confirm` only | Irreversible data loss, broken audit trail |
| W4 | No disable reason / audit comment | Weak offboarding forensics |
| W5 | No role or template column in table | Admins cannot see what a user can do |
| W6 | No filter by status/type (UI disabled) | Operational scale pain |
| W7 | No guard against disabling/deleting self or last admin | Lockout |
| W8 | No `submittingRef` / double-submit guard on create | Duplicate users |
| W9 | No validation of email uniqueness before POST | Opaque ERP errors |
| W10 | Page behind monolithic `isAdmin` — any System Manager | Over-privileged store managers access user CRUD |
| W11 | No separation: create cashier vs create manager | Privilege escalation |
| W12 | Export includes all users without scope | Data exfiltration if admin compromised |
| W13 | `getUsers` limit 200, no pagination | Incomplete roster |
| W14 | No link to ERP Desk for break-glass edits | Admins may use SPA for things that need Desk |
| W15 | No post-create verification (test login / role read-back) | Silent misconfiguration |

**Evidence:** `src/modules/admin/UsersPage.jsx`, `src/services/api.js`.

---

## Missing protections (target checklist)

- [ ] Dedicated `canManageUsers` capability (not all `isAdmin`)
- [ ] Remove `deleteUser` from SPA production build
- [ ] Mandatory operational template on create
- [ ] Server-side provisioning method with validation
- [ ] Block forbidden role profiles and role combinations
- [ ] Self-mutation guards (disable/delete self)
- [ ] Last-administrator guard
- [ ] ERP Activity Log / Comment on disable and role change
- [ ] Fail-closed auth (no username inference)
- [ ] Store-scoped user list (only users in admin's company/store)
- [ ] Two-step confirm for Store Manager creation
- [ ] Typed confirm for disable (`DISABLE username`)
- [ ] Rate limiting on user create (ERP or proxy)

---

## Missing validations (target)

| Field / rule | Validation |
|--------------|------------|
| Email | RFC format, unique in ERP |
| First name | Required, length, no scripts |
| Template | One of allowed enum |
| Warehouses | Non-empty for clerk/cashier; subset of assignable |
| Price list | Required for cashier template |
| Company | Must match admin's default company |
| Role profile | Must exist and match template mapping |
| Enabled | Default 0 until permissions applied (optional safe default) |
| send_welcome_email | Explicit admin choice |

---

## Required confirmation flows (target)

| Action | Confirmation |
|--------|--------------|
| Create user | Summary modal: name, email, template, warehouses |
| Disable | Modal + reason text + type username |
| Enable | Confirm + show previous disable reason |
| Change role profile | Diff old → new + warn on session impact |
| Add warehouse permission | List delta |
| Delete (Desk only) | N/A in SPA |

---

## Required approval flows (target)

| Action | Approver |
|--------|----------|
| Store Manager account | HQ Administrator (second admin) |
| Administrator account | Owner / IT lead |
| Re-enable after fraud investigation | Store Manager + Admin |
| Role upgrade to Store Manager | HQ |

---

## Production blockers (user management)

| P0 | Issue |
|----|-------|
| 1 | Users created without roles — cannot operate safely |
| 2 | Delete exposed in SPA |
| 3 | Auth inference grants wrong workspace |
| 4 | No User Permissions at create — warehouse fraud risk |

| P1 | Issue |
|----|-------|
| 5 | All System Managers can manage users |
| 6 | No `isStoreManager` — managers get full admin |
| 7 | No server-side provision method |

---

## Related documents

| Document | Topic |
|----------|-------|
| [USER_CREATION_FLOW.md](./USER_CREATION_FLOW.md) | Step-by-step provisioning |
| [ROLE_ASSIGNMENT_RULES.md](./ROLE_ASSIGNMENT_RULES.md) | Templates ↔ ERP roles |
| [WAREHOUSE_PERMISSION_FLOW.md](./WAREHOUSE_PERMISSION_FLOW.md) | User Permission rules |
| [USER_LIFECYCLE_POLICY.md](./USER_LIFECYCLE_POLICY.md) | Disable, delete, offboarding |
| [SUPERMARKET_ROLE_MODEL.md](./SUPERMARKET_ROLE_MODEL.md) | Operational personas |
| [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md) | DocType permissions |
| [SECURITY_GAPS.md](./SECURITY_GAPS.md) | C2, C3, C4 |

---

## Implementation phases (documentation only)

| Phase | Deliverable |
|-------|-------------|
| 1 | ERP Role Profiles + User Permission doctypes configured |
| 2 | Frappe `provision_operational_user` method + tests |
| 3 | SPA: template-based create, remove delete, disable+reason |
| 4 | `canManageUsers` guard + store-scoped list |
| 5 | Auth boot: warehouse scope from User Permission |
| 6 | Fail-closed auth; trim POS_ROLES |

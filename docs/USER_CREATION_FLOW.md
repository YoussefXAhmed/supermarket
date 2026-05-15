# User Creation Flow

**Version:** 1.0 · May 2026  
**Audience:** Administrators provisioning supermarket staff  
**Authority:** ERPNext validates and persists; SPA orchestrates.

---

## Principles

1. **No incomplete users** — a user is not "done" until Role Profile + required User Permissions exist.
2. **Template-driven** — admin picks one operational template; system maps to ERP artifacts.
3. **Idempotent where possible** — failed mid-sequence must leave recoverable state (draft user disabled, or explicit rollback).
4. **Verify after create** — read-back User + permissions before telling staff to log in.

---

## Preconditions (ERP setup)

Before first SPA provisioning:

| Prerequisite | Owner |
|--------------|-------|
| Role Profiles created (5 templates) | ERP admin |
| DocType permissions per [ERP_PERMISSION_ALIGNMENT.md](./ERP_PERMISSION_ALIGNMENT.md) | ERP admin |
| Warehouses named per store convention | ERP admin |
| Retail Price List exists | Merchandising |
| POS Profile per register (warehouse + price list) | Store setup |
| SPA admin has ERP rights: User create, Role Profile read, User Permission create | ERP admin |
| Custom method deployed (recommended) | Dev |

---

## Admin journey (target)

```text
1. Admin opens /admin/users → "Add operational user"
2. Select template: Cashier | Inventory Clerk | Purchasing Officer | Store Manager
   (Store Manager → extra approval gate — see USER_LIFECYCLE_POLICY)
3. Enter: first name, email, company (default)
4. Template-specific fields:
     Cashier: register/POS profile hint, warehouse, price list
     Clerk: one or more warehouses
     Purchasing: receive warehouse(s)
     Store Manager: store (all WH auto-selected)
5. Optional: "Send welcome email" (password set link)
6. Review summary → Confirm
7. Backend provisions (single method or REST sequence)
8. Success: show username, assigned template, permissions summary
9. Admin: verify row in table with Role Profile column
10. Staff: first login → correct home path
```

**SPA today:** Steps 2–7 largely missing — only name + email POST.

---

## Template-specific inputs

| Template | Required inputs | Optional |
|----------|-----------------|----------|
| Cashier | email, first_name, company, warehouse, price_list | POS Profile name (link in ERP Desk) |
| Inventory Clerk | email, first_name, company, warehouses[] | — |
| Purchasing Officer | email, first_name, company, warehouses[] | default supplier (Desk) |
| Store Manager | email, first_name, company, store_id | — |
| Administrator | email, first_name, company | HQ approval ticket ID |

---

## REST provisioning sequence (until custom method)

Execute in order; **stop on first error** and surface ERP message + partial state.

### Step 1 — Create User (disabled safe mode)

```http
POST /api/resource/User
Content-Type: application/json

{
  "email": "ahmed.cashier@store.example",
  "first_name": "Ahmed",
  "enabled": 0,
  "send_welcome_email": 0,
  "user_type": "System User"
}
```

**Notes:**

- `enabled: 0` until permissions applied (recommended).
- ERP derives `name` from email (typically local-part).
- Capture `data.name` as `username`.

### Step 2 — Assign Role Profile

```http
PUT /api/resource/User/{username}

{
  "role_profile_name": "Elmahdi Cashier"
}
```

ERP expands profile into `roles` child table on save.

**Alternative:** Set `roles` child explicitly only if not using Role Profile (not recommended).

### Step 3 — Create User Permissions

For each rule:

```http
POST /api/resource/User Permission

{
  "user": "{username}",
  "allow": "Warehouse",
  "for_value": "Stores - WH-Floor",
  "apply_to_all_doctypes": 1,
  "is_default": 0
}
```

Cashier also needs Price List:

```http
POST /api/resource/User Permission

{
  "user": "{username}",
  "allow": "Price List",
  "for_value": "Standard Selling",
  "apply_to_all_doctypes": 1
}
```

Company scoping (if multi-company):

```http
POST /api/resource/User Permission

{
  "user": "{username}",
  "allow": "Company",
  "for_value": "Elmahdi Supermarket",
  "apply_to_all_doctypes": 1
}
```

### Step 4 — Enable user

```http
PUT /api/resource/User/{username}

{
  "enabled": 1,
  "send_welcome_email": 1
}
```

Only after steps 2–3 succeed.

### Step 5 — Add audit comment (optional, recommended)

```http
POST /api/resource/Comment

{
  "comment_type": "Comment",
  "reference_doctype": "User",
  "reference_name": "{username}",
  "content": "Provisioned via SPA: template=cashier, wh=Stores - WH-Floor, by=admin@example"
}
```

Or via custom method in one transaction.

---

## Custom method flow (recommended production)

```http
POST /api/method/elmahdi.user_management.provision_operational_user

{
  "template": "cashier",
  "email": "ahmed.cashier@store.example",
  "first_name": "Ahmed",
  "company": "Elmahdi Supermarket",
  "warehouses": ["Stores - WH-Floor"],
  "price_list": "Standard Selling",
  "send_welcome_email": true
}
```

**Server responsibilities:**

| Check | Action |
|-------|--------|
| Caller has User create + User Permission create | else 403 |
| Template in allowlist | else 400 |
| Email unique | else 409 |
| Warehouses ⊆ caller's assignable set | else 403 |
| Map template → `role_profile_name` | internal table |
| Forbidden profiles blocked | System Manager, etc. |
| Create User disabled → permissions → enable | atomic |
| Write Comment + Error Log on failure | audit |

**Response:**

```json
{
  "message": {
    "username": "ahmed.cashier@store.example",
    "role_profile_name": "Elmahdi Cashier",
    "user_permissions": ["Warehouse: Stores - WH-Floor", "Price List: Standard Selling"],
    "enabled": true
  }
}
```

---

## Post-create verification

| Check | How |
|-------|-----|
| User exists | `GET /api/resource/User/{username}` |
| Role profile set | field `role_profile_name` |
| Roles non-empty | child `roles` or infer from profile |
| Permissions present | `GET User Permission?filters=[["user","=","..."]]` |
| Login test | Separate incognito (admin must not share password) |
| Home path | Login as user → `/pos`, `/inventory`, etc. |
| Forbidden route | Direct URL `/admin/users` → redirect |
| Sample mutation | Cashier cannot POST Stock Entry |

Document result in onboarding checklist (process).

---

## Failure and rollback

| Failed after | Rollback |
|--------------|----------|
| Step 1 only | Delete user in Desk OR disable orphan |
| Step 2 | Disable user; fix profile in Desk |
| Step 3 partial | List permissions; delete extras; complete missing |
| Step 4 | User disabled with permissions — enable manually |

**SPA must show:** `username`, last successful step, ERP error message, support hint.

**Never** leave enabled user with zero roles.

---

## Approval gates in creation flow

| Template | Gate |
|----------|------|
| Cashier, Clerk, Purchasing | Admin confirm modal |
| Store Manager | Second admin approval (future: pending state) |
| Administrator | Out of SPA or owner-only |

Pending pattern (future):

```text
POST provision → status=pending_approval
Second admin POST approve → enable user
```

---

## Mapping to current SPA code

| Target step | Current `UsersPage` |
|-------------|---------------------|
| Template picker | Missing |
| Role profile on create | `createUser` supports param but UI never sends |
| User Permissions | Not called |
| Safe enabled=0 first | Always `enabled: 1` |
| Verification | List reload only |
| Delete on failure | Not handled |

```javascript
// Current — src/modules/admin/UsersPage.jsx
await createUser({
  email: form.email.trim(),
  first_name: form.first_name.trim(),
  enabled: 1,
  send_welcome_email: 0,
});
```

```javascript
// api.js — role_profile_name supported but unused
export const createUser = ({ email, first_name, enabled = 1, send_welcome_email = 0, role_profile_name }) =>
  api.post('/api/resource/User', { email, first_name, enabled, send_welcome_email, ...(role_profile_name ? { role_profile_name } : {}) });
```

---

## Audit logging (creation)

| When | Log |
|------|-----|
| Provision started | SPA: `USER_PROVISION_START` |
| User doc created | ERP Version |
| Permissions added | User Permission Version |
| User enabled | User Version |
| Provision completed | SPA: `USER_PROVISION_COMPLETE` + Comment on User |
| Provision failed | SPA: `USER_PROVISION_FAILED` + ERP Error Log |

---

## Related documents

- [USER_MANAGEMENT_ARCHITECTURE.md](./USER_MANAGEMENT_ARCHITECTURE.md)
- [ROLE_ASSIGNMENT_RULES.md](./ROLE_ASSIGNMENT_RULES.md)
- [WAREHOUSE_PERMISSION_FLOW.md](./WAREHOUSE_PERMISSION_FLOW.md)

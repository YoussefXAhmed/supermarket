# POS shift closing — permission model (Elmahdi)

This document is the **authoritative policy** for who may do what on **POS Closing Entry**.  
Implementation: `erp-custom/elmahdi/elmahdi/api/shift_authorization.py` + `pos_closing_approval.py` + `operational_permissions.py`.

### Session scope (shift data)

`get_shift_summary` and `prepare_closing_entry` additionally require the caller to be the **POS Opening Entry** `user` or `owner`, or to hold **shift-closing approver** privileges / **break-glass** admin roles (`assert_may_access_pos_opening_session`). This blocks harvesting another cashier’s shift totals when ERP row-level rules are loose.

## Roles and profiles

### Cashier (POS User / Sales User)

- **Open shift**: create + submit **POS Opening Entry** (via `elmahdi.api.shifts.open_pos_shift` or REST where permitted).
- **Close request**: create **POS Closing Entry** draft (`prepare_closing_entry` / REST create). **No submit** on POS Closing Entry.
- **Never**: approve, reject, or submit a POS Closing Entry (enforced in `before_submit_pos_closing` and DocPerm: submit = 0 for POS User / Sales User on POS Closing).

### Store manager (operational)

- **Role profile** (recommended): `Elmahdi Store Manager` → ERP roles include at least **Sales Manager**, **Stock Manager**, **Purchase Manager**, and **POS Manager** (see `provision_operational_users.py`).
- **May**: approve / reject / finalize shift closing via **`elmahdi.api.pos_closing_approval.approve_pos_closing_entry`** / **`reject_pos_closing_entry`** (SPA must not use raw `PUT { docstatus: 1 }` for closings).
- **ERP DocPerm**: **Read, Write, Submit** (and Cancel where applicable) on **POS Closing Entry** for those manager roles (`operational_permissions.py`).

### POS Manager (ERP role)

- Same **POS Closing Entry** approval capability as other approver ERP roles; listed explicitly for sites that assign **POS Manager** only.

### Accountant (optional)

- **Role profile**: `Elmahdi Accountant` → **Accounts User** / **Accounts Manager**.
- **May**: approve / reject / submit POS Closing Entry (same whitelisted methods).

### Administrator / System Manager (break-glass)

- Full override: self-approval and submit restrictions in hooks are **skipped** for these roles only.
- **Reopen / cancel submitted closings** (if used) remains an ERP Desk / admin workflow; there is no separate Elmahdi “reopen shift” API — use break-glass accounts or documented desk procedures only.

## Anti–self-approval

- **Rule**: the **owner** of the POS Closing draft (`doc.owner`) **cannot** approve or reject that same document, except break-glass admins.
- **Cashier**: must not submit their own closing; hook throws if a cashier session attempts submit on a closing they own / operate.

## SPA alignment

- **Capability** `canApproveShift` must stay aligned with this policy:
  - From **ERP roles**: any of `SHIFT_APPROVE_ROLES` in `src/auth/capabilities.js`.
  - From **role profile**: `Elmahdi Store Manager`, `Elmahdi Accountant`, `Elmahdi Administrator` keep `canApproveShift: true` in `capabilityProfiles.js` (mirrors `SHIFT_CLOSING_APPROVER_ROLE_PROFILES` on the server).

## Operational commands

After changing roles or `operational_permissions.py`, run on each site:

```bash
bench --site <site> execute elmahdi.setup.operational_permissions.execute
bench --site <site> execute elmahdi.setup.fix_cashier_pos_closing_perm.execute   # cashier: no submit on closing
bench restart
```

## User-facing errors

403 on `pos_closing_approval.*` is mapped in the SPA to:  
**“You do not have permission to approve shift closings.”** (`src/utils/errorHandling.js`).

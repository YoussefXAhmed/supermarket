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

### Store manager (monitor only)

- **Role profile**: `Elmahdi Store Manager`.
- **May**: view shift reports / POS monitor (`can_view_shift_reports`, `can_view_pos_monitor`).
- **Must not**: approve, reject, or call `pos_closing_approval.*` (enforced in `shift_authorization.py` + SPA `canApproveShift: false`).
- **ERP DocPerm**: read/monitor on closings; **no** submit on POS Closing Entry for manager ERP roles.

### Accountant (sole operational approver)

- **Role profile**: `Elmahdi Accountant` → **Accounts User** / **Accounts Manager**.
- **May**: approve / reject / finalize via **`approve_pos_closing_entry`** / **`reject_pos_closing_entry`**.
- **ERP DocPerm**: write+submit on **POS Closing Entry**; write+submit on **POS Opening Entry** (ERPNext `update_after_submit` when closing is finalized). **Cannot open new shifts** — `before_submit` on POS Opening Entry requires `can_open_shift` (cashier only).

### Administrator / System Manager (break-glass)

- Full override: self-approval and submit restrictions in hooks are **skipped** for these roles only.
- **Reopen / cancel submitted closings** (if used) remains an ERP Desk / admin workflow; there is no separate Elmahdi “reopen shift” API — use break-glass accounts or documented desk procedures only.

## Anti–self-approval

- **Rule**: the **owner** of the POS Closing draft (`doc.owner`) **cannot** approve or reject that same document, except break-glass admins.
- **Cashier**: must not submit their own closing; hook throws if a cashier session attempts submit on a closing they own / operate.

## SPA alignment

- **Capability** `canApproveShift`: **true** only for `Elmahdi Accountant` and break-glass (`capabilityProfiles.js` + `spa_authorization.py`). Store manager is **false**.
- Backend approver profiles: `SHIFT_CLOSING_APPROVER_ROLE_PROFILES` = `Elmahdi Accountant`, `Elmahdi Administrator` only (no ERP role bypass).

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

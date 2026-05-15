# Shift Capability Matrix

| Capability | Cashier | Store Manager | Administrator |
|------------|---------|---------------|---------------|
| `canOpenShift` | ✓ | — | ✓ |
| `canCloseShift` | ✓ | — | ✓ |
| `canApproveShift` | — | ✓ | ✓ |
| `canViewShiftReports` | — | ✓ | ✓ |
| `canManageShift` | ✓ (open+close) | — | ✓ |

`canManageShift` = `canOpenShift && canCloseShift` (POS shift bar).

## Rules

- Cashier cannot approve own variance (`validateShiftApproval`)
- One active opening per user + profile (`validateOpenShift`)
- Close requires counted cash (`validateCloseShift`)

## Profile source

`src/auth/capabilityProfiles.js` — Elmahdi Cashier / Store Manager templates.

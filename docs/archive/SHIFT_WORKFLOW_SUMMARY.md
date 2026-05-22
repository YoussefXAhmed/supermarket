# Shift Workflow Summary

Operational cash control for Elmahdi supermarket POS — built on ERPNext **POS Opening Entry** and **POS Closing Entry**.

## Workflow

| Step | Actor | Action | ERP document |
|------|--------|--------|----------------|
| 1 Open | Cashier | Count opening float, select register | POS Opening Entry (submitted) |
| 2 Operate | Cashier | Sales, returns, voids (Desk policy) | POS Invoice |
| 3 Reconcile | Cashier | Count drawer cash vs system expected | POS Closing Entry (draft or submitted) |
| 4 Variance | System | Warning ≥ EGP 5 · Approval ≥ EGP 50 | Audit in `remarks` |
| 5 Approve | Store Manager | Submit draft closing when variance large | POS Closing Entry submit |

## Routes

| Path | Capability |
|------|------------|
| `/shifts/open` | `canOpenShift` |
| `/shifts/close` | `canCloseShift` |
| `/shifts/history` | `canViewShiftReports` |
| `/pos` | End shift → redirects to `/shifts/close` |

## Code map

| Layer | Path |
|-------|------|
| API | `src/services/shiftsApi.js` |
| Service | `src/services/shiftsService.js` |
| Calculations | `src/utils/shiftCalculations.js` |
| Validation | `src/utils/shiftValidation.js` |
| Server aggregates | `erp-custom/elmahdi/elmahdi/api/shifts.py` |
| UI | `src/modules/shifts/` |

## Audit trail

Structured `Elmahdi-Shift-Audit` block in Opening/Closing `remarks`: operator, expected/actual cash, variance, severity, approval status, sales/returns/void counts, approver.

Local activity log: `ActivityType.SHIFT` in `activityLogService.js`.

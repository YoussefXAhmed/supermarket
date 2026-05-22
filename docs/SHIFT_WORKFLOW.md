# Shift Workflow — POS Cash Control

**Operational scope:** Cashier shift lifecycle, cash reconciliation, manager approval, and ERP document flow.  
**ERP documents:** `POS Opening Entry`, `POS Closing Entry`, `POS Invoice`  
_Merged from: `SHIFT_WORKFLOW_SUMMARY.md` + `SHIFT_ERP_FLOW.md`_

---

## Workflow overview

| Step | Actor | Action | ERP document |
|------|--------|--------|----------------|
| 1 Open | Cashier | Count opening float, select register | POS Opening Entry (submitted) |
| 2 Operate | Cashier | Sales, returns, voids (Desk policy) | POS Invoice |
| 3 Reconcile | Cashier | Count drawer cash vs system expected | POS Closing Entry (draft or submitted) |
| 4 Variance | System | Warning ≥ EGP 5 · Approval ≥ EGP 50 | Audit in `remarks` |
| 5 Approve | Store Manager | Submit draft closing when variance large | POS Closing Entry submit |

---

## Routes

| Path | Capability |
|------|------------|
| `/shifts/open` | `canOpenShift` |
| `/shifts/close` | `canCloseShift` |
| `/shifts/history` | `canViewShiftReports` |
| `/pos` | End shift → redirects to `/shifts/close` |

---

## Code map

| Layer | Path |
|-------|------|
| API | `src/services/shiftsApi.js` |
| Service | `src/services/shiftsService.js` |
| Calculations | `src/utils/shiftCalculations.js` |
| Validation | `src/utils/shiftValidation.js` |
| Server aggregates | `erp-custom/elmahdi/elmahdi/api/shifts.py` |
| UI | `src/modules/shifts/` |

---

## ERP flow detail

### Open shift

1. SPA `openShift()` → `POST /api/resource/POS Opening Entry`
2. `PUT` submit (`docstatus: 1`)
3. `balance_details`: mode of payment + opening amount
4. Optional: `elmahdi.api.shifts.get_shift_summary` for live totals

### During shift

- Checkout gated client-side (`usePOS.shiftOpen`)
- Invoices: `POS Invoice` with `is_pos=1`, same `pos_profile`, `posting_date >= period_start_date`
- If bench has `pos_opening_entry` on POS Invoice, server summary filters by that link; else profile + user + date

### Close shift

1. `loadShiftSummary(opening)` — prefers `GET elmahdi.api.shifts.get_shift_summary`
2. Cashier enters counted cash
3. `prepare_closing_entry` (server) or client-built `payment_reconciliation` rows
4. Small variance (and manager `canSubmitClosing`) → `elmahdi.api.pos_closing_approval.approve_pos_closing_entry` via `approvePOSClosingEntryOnServer` (not REST `docstatus: 1`)
5. Large variance or cashier path → draft (`docstatus: 0`) until approver runs approve

### Approval

- Approver: `approveShiftClosing()` → `approve_pos_closing_entry` (audit fields + controlled submit)
- Server + SPA: approver ≠ closing owner / operator (anti–self-approval); cashiers blocked on submit by `before_submit` hook

### Fallback

If `elmahdi` methods unavailable (app not installed / not whitelisted), SPA aggregates invoices client-side and builds closing via REST (less accurate payment mix).

---

## Audit trail

Structured `Elmahdi-Shift-Audit` block in Opening/Closing `remarks`: operator, expected/actual cash, variance, severity, approval status, sales/returns/void counts, approver.

Local activity log: `ActivityType.SHIFT` in `activityLogService.js`.

---

## Related documents

- [SHIFT_PERMISSION_MODEL.md](../security/SHIFT_PERMISSION_MODEL.md)
- [SHIFT_CAPABILITY_MATRIX.md](../security/SHIFT_CAPABILITY_MATRIX.md)
- [POS_SHIFT_ERP_PERMISSIONS.md](../security/POS_SHIFT_ERP_PERMISSIONS.md)
- [APPROVAL_WORKFLOWS.md](./APPROVAL_WORKFLOWS.md)
- [CASHIER_OPERATIONS.md](./CASHIER_OPERATIONS.md)

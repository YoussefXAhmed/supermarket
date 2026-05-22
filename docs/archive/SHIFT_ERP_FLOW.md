# Shift ERP Flow

## Open shift

1. SPA `openShift()` → `POST /api/resource/POS Opening Entry`
2. `PUT` submit (`docstatus: 1`)
3. `balance_details`: mode of payment + opening amount
4. Optional: `elmahdi.api.shifts.get_shift_summary` for live totals

## During shift

- Checkout gated client-side (`usePOS.shiftOpen`)
- Invoices: `POS Invoice` with `is_pos=1`, same `pos_profile`, `posting_date >= period_start_date`
- If bench has `pos_opening_entry` on POS Invoice, server summary filters by that link; else profile + user + date

## Close shift

1. `loadShiftSummary(opening)` — prefers `GET elmahdi.api.shifts.get_shift_summary`
2. Cashier enters counted cash
3. `prepare_closing_entry` (server) or client-built `payment_reconciliation` rows
4. Small variance (and manager `canSubmitClosing`) → `elmahdi.api.pos_closing_approval.approve_pos_closing_entry` via `approvePOSClosingEntryOnServer` (not REST `docstatus: 1`)
5. Large variance or cashier path → draft (`docstatus: 0`) until approver runs approve

## Approval

- Approver: `approveShiftClosing()` → `approve_pos_closing_entry` (audit fields + controlled submit)
- Server + SPA: approver ≠ closing owner / operator (anti–self-approval); cashiers blocked on submit by `before_submit` hook

## Fallback

If `elmahdi` methods unavailable (app not installed / not whitelisted), SPA aggregates invoices client-side and builds closing via REST (less accurate payment mix).

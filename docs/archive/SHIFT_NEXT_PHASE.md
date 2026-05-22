# Recommended Next Operational Phase

**Priority: Wire returns + stock to shift context**

1. Call `validateRefundAgainstShift` from `returnsService.createReturnDraft` when active opening exists.
2. Pass `pos_opening_entry` on POS checkout in `posCheckout.js`.
3. Daily manager email/report from `/shifts/history` pending list (optional).

**Then: Purchasing receipt → shift-agnostic AP** (already separate) or **inventory cycle count** phase per `NEXT_STEPS.md`.

Shift module is prerequisite for trustworthy **Z-report / end-of-day** compliance before expanding analytics.

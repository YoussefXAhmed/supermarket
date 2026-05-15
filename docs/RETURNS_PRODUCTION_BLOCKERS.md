# Returns — Production Blockers

Before go-live, verify on **supermarket.local** (or production site):

1. **ERP permissions**
   - Cashier: create POS Invoice (return draft), read source invoice
   - Store Manager: submit POS Invoice return
   - Deny return submit for Cashier role

2. **Stock test**
   - Submit sale → note bin qty → create & submit return → bin qty restored by ERP

3. **Partial return test**
   - Return 1 of 3 units → second return max 2 units → third blocked by validation

4. **Duplicate prevention**
   - Full return → further return blocked for same lines

5. **`make_sales_return`**
   - Confirm method exists; if 404, confirm fallback creates valid draft

6. **Refund total**
   - Compare UI displayed total to ERP `grand_total` on submitted return — must match

**Score (Phase 1 SPA):** Ready for UAT after ERP permission audit — **not** production until steps 1–6 pass on real data.

# Shift Production Blockers

| Blocker | Severity | Mitigation |
|---------|----------|------------|
| `elmahdi` app not on bench | High | `bench get-app` + `install-app elmahdi`; whitelist `elmahdi.api.shifts.*` |
| POS Closing submit fails without Desk reconciliation | High | Use `prepare_closing_entry`; test submit on staging |
| Cashier lacks POS Opening/Closing perm | High | Align ERP roles per `ERP_PERMISSION_ALIGNMENT.md` |
| No `pos_opening_entry` on invoices | Medium | Date/profile filter still works; link field recommended |
| Variance thresholds hardcoded (5 / 50 EGP) | Low | Move to Settings / site config |
| Manager not trained on `/shifts/history` approval | Medium | SOP + daily close checklist |

**UAT checklist**

1. Cashier open → sale → close with exact cash → closing submitted
2. Close with EGP 60 shortage → draft + manager approve
3. Second open while first open → blocked
4. Manager cannot approve own shift

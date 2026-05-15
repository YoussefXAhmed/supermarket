# Shift Remaining Gaps

1. **POS Invoice ↔ opening link** — Enforce `pos_opening_entry` on checkout payload when ERP field exists.
2. **Payment mix accuracy** — Without `elmahdi.api.shifts`, client assumes Cash for invoices without loaded payments.
3. **Consolidation** — ERPNext may consolidate POS Invoices on closing; verify bench POS settings.
4. **Mid-shift user disable** — Process only; no auto-close hook.
5. **Shared register** — One ERP user per physical drawer (process + `user` on opening).
6. **Void visibility** — Cancelled invoices (`docstatus=2`) counted; Desk cancellations may differ.
7. **Returns orphan check** — `validateRefundAgainstShift` exported but not wired into returns service yet.
8. **ERP Activity Log sync** — Local `logActivity` only; optional push to Frappe Activity Log.

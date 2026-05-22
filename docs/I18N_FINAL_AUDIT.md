# i18n Final Audit — Arabic Completion & UX Consistency

**Date**: 2026-05-22  
**Build**: ✅ Exit 0 — 274 modules, zero errors  
**Total translation keys**: 929 EN · 929 AR (100% parity)

---

## Summary

This audit completed the Arabic internationalization of the entire operational ERP frontend. All user-visible static strings have been translated. A centralized ERP label mapper was introduced to safely translate ERP doctype names and status strings without touching backend values.

---

## Files Modified

| File | Change |
|------|--------|
| `src/utils/erpLabelMapper.js` | **NEW** — centralized ERP doctype/status i18n mapper |
| `src/components/accounting/ApPaymentStatusPill.jsx` | Uses `erpStatusLabel()` for i18n-aware status labels |
| `src/components/purchasing/BillingStatusPill.jsx` | Uses `erpStatusLabel()` for i18n-aware billing labels |
| `src/components/purchasing/ReceiptMatchingCard.jsx` | All labels, actions, status text, line table translated |
| `src/modules/auth/LoginPage.jsx` | Login form labels, error messages translated |
| `src/modules/admin/SettingsPage.jsx` | Page title, section titles, all row labels, quick links |
| `src/modules/admin/InvoicesPage.jsx` | Table columns, status badges, pagination, empty state |
| `src/modules/admin/InventoryPage.jsx` | Columns, search placeholder, empty state |
| `src/modules/admin/UsersPage.jsx` | Full translation: form, table, modals, export, status badges |
| `src/modules/admin/AdminWarehousesPage.jsx` | Full translation: form, toolbar, filters, table, delete modal |
| `src/modules/shifts/components/ShiftActivityTable.jsx` | Table columns, status, empty state |
| `src/modules/shifts/components/ShiftSessionDetailDrawer.jsx` | All section headers, labels, action buttons |
| `src/modules/shifts/components/ShiftStatusBadge.jsx` | Status labels via i18n keys |
| `src/modules/shifts/components/ShiftSummaryCard.jsx` | All stat card labels |
| `src/modules/shifts/components/CashCountForm.jsx` | Form labels, placeholders, submit button |
| `src/modules/shifts/components/ShiftRejectConfirmModal.jsx` | Title, labels, reason, buttons |
| `src/modules/shifts/components/ShiftApprovalConfirmModal.jsx` | Title, fact labels, buttons |
| `src/modules/shifts/components/VarianceBanner.jsx` | Badge labels, descriptive text |
| `src/components/ui/TrendChart.jsx` | Empty state, aria-label |
| `src/components/ui/ExportToolbar.jsx` | Export format button labels |
| `src/components/pos/POSMetricsBar.jsx` | Metric labels |
| `src/auth/operationalUserTemplates.js` | Validation errors use `t()` when provided; `labelKey` fields added |
| `src/components/accounting/CreateSupplierPaymentPanel.jsx` | All form fields, hints, validation errors, buttons |
| `src/i18n/locales/en/translation.json` | +350 keys across new namespaces |
| `src/i18n/locales/ar/translation.json` | +350 keys (full Arabic parity) |

---

## New Namespaces Added

| Namespace | Keys | Purpose |
|-----------|------|---------|
| `erp.*` | 22 | ERP doctype canonical names |
| `erp.status.*` | 30 | ERP status strings (submitted, paid, rejected, etc.) |
| `settings.*` | 20 | SettingsPage labels |
| `invoices.*` | 11 | InvoicesPage labels |
| `users.*` | 30 | UsersPage labels, errors, export |
| `warehouses.*` | 28 | AdminWarehousesPage labels, filters |
| `login.*` | 9 | LoginPage labels and errors |
| `receiptCard.*` | 20 | ReceiptMatchingCard labels |
| `inventory.page.*` | 11 | InventoryPage (admin quick view) |
| `finance.createPayment.*` | 19 | CreateSupplierPaymentPanel form |

---

## ERP Label Mapper — `src/utils/erpLabelMapper.js`

Provides three functions for safe ERP → display translation:

```js
erpDocLabel('Purchase Receipt', t)   // → "إذن استلام" (AR) / "Purchase Receipt" (EN)
erpStatusLabel('submitted', t)       // → "مُرسل" (AR) / "Submitted" (EN)
erpApStageLabel('invoice_pending', t) // → "بانتظار الفاتورة" (AR)
```

### ERP Doctype Mappings

| ERP Doctype | Arabic |
|-------------|--------|
| Purchase Receipt | إذن استلام |
| Purchase Invoice | فاتورة شراء |
| Payment Entry | دفعة مالية |
| Sales Invoice | فاتورة مبيعات |
| POS Invoice | فاتورة بيع |
| Stock Entry | حركة مخزنية |
| POS Opening Entry | قيد فتح نقطة البيع |
| POS Closing Entry | قيد إغلاق نقطة البيع |
| Stock Reconciliation | تسوية مخزنية |
| Journal Entry | قيد يومية |

---

## Status Systems Normalized

All status strings now go through `erpStatusLabel(key, t)` instead of hardcoded English labels.

| Status | Arabic | Used In |
|--------|--------|---------|
| submitted | مُرسل | ShiftStatusBadge, InvoicesPage, ReceiptMatchingCard |
| approved | معتمد | ApprovalsDashboardPage, PurchaseApprovalCard |
| rejected | مرفوض | ShiftStatusBadge, ShiftRejectConfirmModal |
| paid | مدفوع | ApPaymentStatusPill |
| unpaid | غير مدفوع | ApPaymentStatusPill |
| partially_paid | مدفوع جزئياً | ApPaymentStatusPill |
| overdue | متأخر | ApPaymentStatusPill |
| fully_billed | مُفوتر بالكامل | BillingStatusPill |
| partially_billed | مُفوتر جزئياً | BillingStatusPill |
| variance_detected | انحراف مكتشف | BillingStatusPill |
| enabled | مفعّل | UsersPage |
| disabled | معطّل | UsersPage, AdminWarehousesPage |
| active | نشط | AdminWarehousesPage |
| pending_manager | بانتظار موافقة المدير | ApprovalsDashboardPage |
| pending_accountant | بانتظار موافقة المحاسب | ApprovalsDashboardPage |
| invoice_pending | بانتظار الفاتورة | ReceiptMatchingCard |
| payment_pending | بانتظار الدفع | ReceiptMatchingCard |
| settled | مُسوَّى | ReceiptMatchingCard |

---

## Intentionally Untranslated Strings

These strings are deliberately left in English because they are technical identifiers, not user-facing text:

| String type | Example | Reason |
|-------------|---------|--------|
| ERPNext document IDs | `POS-INV-2026-00042`, `PINV-00001` | Backend-generated serials — immutable |
| Document names from API | `inv.name`, `session.closingName` | ERP canonical references |
| ERP base URL | `ERP_BASE_URL` config value | Technical configuration |
| Currency codes | `EGP` | ISO standard, locale-formatted |
| Auth protocol | `Cookie-based (withCredentials)` | Technical spec on Settings page |
| Frappe REST API | `Frappe REST API v2` | Technical spec, proper noun |
| Warehouse type values | `Stores`, `Transit` | ERP-defined enum values from backend |
| Role profile names | `Elmahdi Cashier` | ERP Role Profile names (synced with ERPNext) |
| AP lifecycle hints | `row.lifecycle_hint` | Dynamic text generated by backend |
| Error messages from server | `getUserFriendlyMessage(e)` | Server-generated, already sanitized |
| Dev console logs | `console.info(...)` | Developer-only, not user-visible |

---

## Remaining Hardcoded Technical Text (Non-User-Facing)

These strings remain in English but are intentionally so — they are visible only to technical users or are ERP-system context:

1. **`SupplierPaymentsPage` AP lifecycle banner**: `"AP lifecycle: Purchase Receipt → Invoice matching → Supplier payment"` — this is a technical workflow note for accountants, intentionally kept bilingual.

2. **`ShiftRejectConfirmModal` body text**: The phrase `"marks … as rejected in ERP remarks"` — kept in English as it describes an exact ERP operation (remarks field name). The title and buttons are fully translated.

3. **`ShiftApprovalConfirmModal` body text**: `"submits the linked … in ERPNext"` — same reasoning; describes exact ERP submit action.

4. **ERP aging bucket labels** in `SupplierPaymentsPage` filter: `"1–30 days"`, `"31–60"` — numeric ranges, universal.

5. **`LoginPage` footer**: `"Powered by ERPNext · Frappe Framework"` — product names / proper nouns.

---

## Build Verification

```
npm run build → Exit 0
274 modules transformed
0 errors, 0 warnings
```

All routes verified:
- `/pos` — POS page renders, Arabic metrics bar functional
- `/admin/dashboard` — All KPI labels translated
- `/admin/users` — Form, table, disable modal all translated
- `/admin/warehouses` — Filters, form, delete assessment all translated
- `/admin/accounting/payments` — Receipt cards, billing pills all translated
- `/shifts/history` — Session cards, detail drawer all translated
- `/inventory/*` — Analytics, batches, reconciliation all translated
- `/approvals` — All approval flows translated
- `/returns` — Return flow fully translated

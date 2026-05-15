# Returns — Remaining Operational Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| ERP Role Profile must allow POS Invoice return create/submit | API 403 | Align Elmahdi Cashier / Store Manager DocType perms |
| `make_sales_return` version mismatch | Fallback path used | Test on target ERPNext v15 site |
| Audit in `remarks` not ERP custom fields | Reporting harder | Phase 2: custom fields + server script |
| No POS inline return | Cashier leaves POS screen | Phase 2: `/pos/returns` shortcut |
| Local activity log only | Not in ERP Activity Log | Optional sync to Comment |
| Same-day partial returns only as implemented | Multi-day policy | ERP posting date rules |
| No supplier returns | Purchasing Desk only | Phase 3 |
| No automatic receipt print on return | Ops manual | Phase 2 print hook |

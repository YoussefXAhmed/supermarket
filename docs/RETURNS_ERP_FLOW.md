# Returns ERP Flow (Phase 1)

## DocType

**POS Invoice** with:

- `is_return = 1`
- `return_against = <original POS Invoice>`
- Line `qty` negative (ERP sales return convention)
- `docstatus = 1` on submit → stock ledger reversal via ERPNext

## Preferred API

```
POST /api/method/erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return
{ "source_name": "POS-INV-..." }
```

Returns a draft return document mapped from the source. SPA then patches `items` for partial qty and `remarks` for audit.

## Fallback

If `make_sales_return` is unavailable, SPA posts a new POS Invoice with `is_return: 1` and negative line qty.

## Submit

```
PUT /api/resource/POS Invoice/{name}
{ "docstatus": 1 }
```

Same submit path as POS checkout — ERP enforces permissions and stock rules.

## Audit trail

Encoded in `remarks`:

```
Elmahdi-Return-Audit; reason=...; refund_method=...; operator=...; status=pending_approval|submitted; approved_by=...
```

Plus standard ERP fields: `owner`, `creation`, `return_against`, `set_warehouse`, `payments`, `grand_total`.

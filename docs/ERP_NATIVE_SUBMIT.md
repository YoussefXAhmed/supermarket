# ERP native submit architecture

**Rule:** Stock- and accounting-moving documents must never be submitted via REST `PUT { docstatus: 1 }`.

## Server module

`erp-custom/elmahdi/elmahdi/api/erp_submit.py`

- `native_submit(doc)` — `doc.submit()` + reload
- `assert_submitted_side_effects(doc)` — verifies:
  - `docstatus == 1`
  - **Stock Ledger Entry** when the doctype / `update_stock` / stock items require it
  - **GL Entry** for invoices and payment entries

### Whitelisted methods

| Method | DocType |
|--------|---------|
| `submit_document` | Any (generic) |
| `submit_stock_entry` | Stock Entry |
| `submit_stock_reconciliation` | Stock Reconciliation |
| `submit_purchase_receipt` | Purchase Receipt |
| `submit_purchase_invoice` | Purchase Invoice |
| `submit_sales_invoice` | Sales Invoice |
| `submit_pos_invoice` | POS Invoice (sale) |
| `submit_pos_invoice_return` | POS Invoice (return) |
| `submit_delivery_note` | Delivery Note |
| `submit_purchase_return` | Purchase Return |
| `submit_payment_entry` | Payment Entry |
| `submit_pos_opening_entry` | POS Opening Entry |

Specialized create+submit:

- `elmahdi.api.pos_checkout.create_and_submit_pos_invoice` — POS sale checkout

## SPA client

`src/services/erpSubmitApi.js` — calls the methods above.

## Migrated flows

| Flow | Before | After |
|------|--------|-------|
| POS sale | REST create + PUT docstatus | `pos_checkout.create_and_submit_pos_invoice` |
| POS return approve | REST PUT docstatus | `erp_submit.submit_pos_invoice_return` |
| Stock Entry | REST PUT docstatus | `erp_submit.submit_stock_entry` |
| Stock Reconciliation | REST PUT docstatus | `erp_submit.submit_stock_reconciliation` |
| Purchase Receipt | REST PUT docstatus | `erp_submit.submit_purchase_receipt` |
| Purchase Invoice (SPA) | REST PUT docstatus | `erp_submit.submit_purchase_invoice` |
| POS Opening submit | REST PUT fallback | `erp_submit.submit_pos_opening_entry` only |
| POS Closing finalize | Already `pos_closing_approval` native submit | unchanged |
| Supplier payment | Already `accounts_payable` native submit + GL verify | unchanged |
| Auto PI from receipt | Already `pi.submit()` in invoice_matching + GL verify | unchanged |

## Failure messages

- `{doctype} submitted without stock movement`
- `{doctype} submitted without accounting entries`

## Deploy

```bash
bench restart
bench --site <site> clear-cache
```

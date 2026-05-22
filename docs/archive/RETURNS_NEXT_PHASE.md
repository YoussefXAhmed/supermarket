# Returns — Recommended Next Phase

## Phase 2

1. ERP custom fields: `elmahdi_return_reason`, `elmahdi_refund_method`, `elmahdi_approved_by`
2. POS shortcut: “Return with receipt” from invoice list (`/pos?return=POS-INV-…`)
3. Server-side capability check in `elmahdi` Frappe app (mirror SPA caps)
4. Print return receipt / credit note
5. ERP Comment sync for audit instead of remarks-only

## Phase 3

- Supplier purchase returns
- Return reason codes master
- Threshold workflows (manager approval over EGP X)

# Final Access Architecture

## Principle

```
ERPNext Role Profile + roles
        ↓
deriveCapabilities()   ← single source (src/auth/capabilities.js)
        ↓
explicit boolean capabilities
        ↓
ProtectedRoute / CapabilityRoute / nav filters / POS guards
```

ERPNext remains the enforcement layer for DocType read/write/submit.

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Profile templates | `src/auth/capabilityProfiles.js` | Elmahdi operational personas |
| Derivation | `src/auth/capabilities.js` | Profile-first, strict ERP role fallback |
| Inventory caps | `src/auth/inventoryCapabilities.js` | Stock workflows (non-profile users) |
| Session | `src/services/authRoleResolution.js` | Fail-closed role resolution |
| Context | `src/context/AuthContext.jsx` | Exposes `capabilities` + legacy aliases |
| Routes | `ProtectedRoute`, `CapabilityRoute`, `InventoryCapabilityRoute` | Hard gates |
| Nav | `AdminLayout`, `InventoryLayout` | Capability-filtered links |
| POS | `POSPage`, `POSShiftBar` | VIEW vs OPERATE separation |

## Operational personas

| Persona | ERP profile | Default home |
|---------|-------------|--------------|
| Cashier | Elmahdi Cashier | `/pos` |
| Inventory Clerk | Elmahdi Inventory Clerk | `/inventory` |
| Purchasing Officer | Elmahdi Purchasing Officer | `/admin/purchasing` |
| Store Manager | Elmahdi Store Manager | `/admin` |
| Administrator | System Manager / Administrator | `/admin` |

## Store Manager fix

Previously: `Sales Manager` in profile matched `POS_ROLES` → `isPOS` → full POS + home `/pos`.

Now: `Elmahdi Store Manager` profile sets `canViewPOS=true`, `canOperatePOS=false`, `canMonitorCashiers=true`. POS opens in monitor/read-only mode.

## Never

- Infer access from usernames (`homePathFromIdentifier` → `/login`)
- Infer from URL path (`capabilitiesFromInferredPath` → empty)
- Broad `r.includes('manager')` on ERP roles
- Treat `Sales Manager` as POS operate without profile

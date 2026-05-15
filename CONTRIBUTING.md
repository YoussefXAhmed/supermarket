# Contributing to Elmahdi Supermarket ERP

Thank you for improving a production-oriented retail operations frontend. This project integrates tightly with ERPNext/Frappe—changes must respect ERP permissions and existing capability architecture.

## Before you start

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/FINAL_ACCESS_ARCHITECTURE.md](docs/FINAL_ACCESS_ARCHITECTURE.md).
2. Run against a **staging** ERPNext site with the **elmahdi** app installed.
3. Never weaken fail-closed auth or add username-based access inference.

## Development setup

```bash
cp .env.example .env
npm install
npm run dev
```

Link `erp-custom/elmahdi` into your Frappe bench (see [erp-custom/elmahdi/README.md](erp-custom/elmahdi/README.md)).

## Branch & commits

- Branch from `main`.
- Use clear commits: `feat(pos): …`, `fix(inventory): …`, `docs: …`.
- One logical change per PR when possible.

## Code guidelines

| Area | Rule |
|------|------|
| **Auth** | Extend `src/auth/capabilities.js` / `capabilityProfiles.js`—do not duplicate role sets |
| **Routes** | Use `ProtectedRoute`, `CapabilityRoute`, `InventoryCapabilityRoute` |
| **ERP API** | Call through `src/services/*`; explicit `fields` on list queries |
| **Purchasing** | Never add `purchase_invoice` to Purchase Receipt list fields |
| **UI** | Match layout shells in `src/components/layout/page-layouts/` |
| **POS** | Keep full-width; no admin layout shells on `/pos` |

## Pull request checklist

- [ ] `npm run build` passes
- [ ] No secrets in commits (`.env`, credentials)
- [ ] Capability / route map updated if access changed ([docs/ROUTE_CAPABILITY_MAP.md](docs/ROUTE_CAPABILITY_MAP.md))
- [ ] ERP permission notes updated if DocType access changed
- [ ] Screenshots/GIFs updated if UI changed materially (optional but appreciated)

## Reporting issues

Include: ERPNext version, role profile, route, expected vs actual, browser console + network tab for failing API calls.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).

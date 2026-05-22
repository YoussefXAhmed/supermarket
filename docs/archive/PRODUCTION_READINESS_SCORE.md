# Production Readiness Score — Access Control

**Date:** May 2026  
**Scope:** SPA operational access architecture only.

| Area | Score | Notes |
|------|-------|-------|
| Capability model clarity | **9/10** | Explicit VIEW/OPERATE; profile-first |
| Route protection | **8/10** | Admin sub-routes gated; ERP still required |
| POS privilege separation | **8/10** | Store Manager monitor mode; ERP must deny submit |
| Fail-closed auth | **9/10** | No username/path inference |
| ERP alignment | **6/10** | Depends on Role Profile setup on site |
| User provisioning | **7/10** | Templates exist; Store Manager approval TBD |
| Documentation | **9/10** | Matrix + route map + architecture |
| **Overall access control** | **78/100** | Ready for pilot after ERP profile audit |

**Blockers before production:**

1. Verify each operational user has correct **Elmahdi Role Profile** (not raw Sales Manager only).
2. Install **elmahdi** Frappe app for `get_session_identity`.
3. ERP permission audit per store (warehouse + User Permissions).
4. Remove `System Manager` from store staff accounts.

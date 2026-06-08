"""
Elmahdi SPA session identity — install this app on ERPNext.

Exposes server-side roles (frappe.get_roles) without User / Has Role DocType read
permissions on the client. Also materializes the per-session CSRF token so the
SPA can inject `X-Frappe-CSRF-Token` on every unsafe-method request without
needing a second round-trip.

API: GET /api/method/elmahdi.api.auth.get_session_identity
"""

import frappe
from frappe.sessions import get_csrf_token as _get_session_csrf_token


@frappe.whitelist(allow_guest=True)
def get_session_identity():
    """SPA session probe — must return 200 for Guest (no 403 spam when not logged in)."""
    user = frappe.session.user or "Guest"
    if user == "Guest":
        return {
            "name": "Guest",
            "email": "",
            "full_name": "",
            "first_name": "",
            "last_name": "",
            "user_image": None,
            "role_profile_name": "",
            "roles": [],
            "csrf_token": "",
            "lifecycle_state": "",
        }

    roles = list(frappe.get_roles(user))
    row = {}
    try:
        # Phase 4.a — surface the lifecycle state. Conditional on the
        # column existing so sites that haven't yet run the
        # install_user_lifecycle_field patch keep working; the SPA must
        # tolerate an empty string.
        fields = ["first_name", "last_name", "email", "role_profile_name", "user_image"]
        if frappe.db.has_column("User", "elmahdi_lifecycle_state"):
            fields.append("elmahdi_lifecycle_state")
        row = (
            frappe.db.get_value(
                "User",
                user,
                fields,
                as_dict=True,
            )
            or {}
        )
    except Exception:
        # Operational users may lack User read; session + roles still suffice for SPA.
        row = {}

    first_name = row.get("first_name") or ""
    last_name = row.get("last_name") or ""
    full_name = " ".join(x for x in (first_name, last_name) if x) or user

    # Materialize the per-session CSRF token. `get_csrf_token` generates one
    # lazily on first call and persists it to session.data.csrf_token —
    # subsequent requests validate against the same value.
    csrf_token = ""
    try:
        csrf_token = _get_session_csrf_token() or ""
    except Exception:
        # Never block the identity probe on CSRF-bootstrap failure; the SPA
        # has a retry path that will re-fetch on the next CSRFTokenError.
        csrf_token = ""

    return {
        "name": user,
        "email": row.get("email") or user,
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "user_image": row.get("user_image"),
        "role_profile_name": row.get("role_profile_name") or "",
        "roles": roles,
        "csrf_token": csrf_token,
        # Phase 4.a — lifecycle state ("" if the patch hasn't run yet;
        # SPA falls back to Active for display).
        "lifecycle_state": row.get("elmahdi_lifecycle_state") or "",
    }

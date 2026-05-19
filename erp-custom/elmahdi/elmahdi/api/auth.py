"""
Elmahdi SPA session identity — install this app on ERPNext.

Exposes server-side roles (frappe.get_roles) without User / Has Role DocType read
permissions on the client.

API: GET /api/method/elmahdi.api.auth.get_session_identity
"""

import frappe


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
        }

    roles = list(frappe.get_roles(user))
    row = {}
    try:
        row = (
            frappe.db.get_value(
                "User",
                user,
                ["first_name", "last_name", "email", "role_profile_name", "user_image"],
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

    return {
        "name": user,
        "email": row.get("email") or user,
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "user_image": row.get("user_image"),
        "role_profile_name": row.get("role_profile_name") or "",
        "roles": roles,
    }

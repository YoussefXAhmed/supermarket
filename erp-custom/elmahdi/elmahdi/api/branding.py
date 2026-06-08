"""
Login-page branding — exposed BEFORE auth so the SPA can render the company
logo + name on the sign-in screen without a hard-coded fallback.

The endpoint is guest-accessible (Frappe's `allow_guest=True`) so pre-login
visitors hit it. We deliberately do NOT expose anything sensitive — just
the company name, the logo URL, and the user-facing language list.
"""

from __future__ import annotations

import frappe


@frappe.whitelist(allow_guest=True)
def get_login_branding():
    """Public branding payload for the login screen.

    Returns:
        {
            "company_name": "Elmahdi Supermarket",
            "logo_url":     "/files/logo.png",
            "tagline":      "Sign in to your workspace",
            "languages":    [{"code": "en", "label": "English"},
                             {"code": "ar", "label": "العربية"}],
        }

    Resolution order for the logo:
      1. Default Company's `company_logo` file field.
      2. Default Company's `default_letter_head` → Letter Head `.image`.
      3. `/files/logo.png` fallback (shipped in the repo).
    """
    company = (
        frappe.db.get_single_value("Global Defaults", "default_company")
        or frappe.db.get_value("Company", {}, "name")
    )
    company_name = ""
    logo_url = ""
    if company:
        company_name = frappe.db.get_value("Company", company, "company_name") or company
        logo_url = frappe.db.get_value("Company", company, "company_logo") or ""
        if not logo_url:
            lh = frappe.db.get_value("Company", company, "default_letter_head")
            if lh:
                logo_url = frappe.db.get_value("Letter Head", lh, "image") or ""

    # The login page is rendered before auth, so guests cannot fetch
    # `/private/files/...`. Fall back to the public asset; admins who want a
    # custom login logo should upload it to the public file space (or move
    # it to /files/ from Frappe Desk).
    if not logo_url or logo_url.startswith("/private/"):
        logo_url = "/files/logo.png"

    return {
        "company_name": company_name or "Elmahdi Supermarket",
        "logo_url": logo_url,
        "tagline": "",  # Frontend supplies a translated default if empty.
        "languages": [
            {"code": "en", "label": "English"},
            {"code": "ar", "label": "العربية"},
        ],
    }

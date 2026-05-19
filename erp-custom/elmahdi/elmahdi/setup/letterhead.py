"""
Create branded Letter Head (logo + company block) and set as company default for all prints.

Run:
  bench --site <site> execute elmahdi.setup.letterhead.execute

Optional:
  bench --site <site> execute elmahdi.setup.letterhead.execute \\
    --kwargs "{'company': 'Elmahdi Supermarket', 'logo_path': '/path/to/myLogo.png'}"
"""

from __future__ import annotations

import os
import shutil

import frappe
from frappe.utils import get_url

COMPANY = "Elmahdi Supermarket"
LETTER_HEAD_NAME = "Elmahdi Supermarket"

# Branded contact block (right side; logo on left — original layout)
LETTERHEAD_INFO = {
    "name": "Elmahdi Supermarket",
    "phone": "01020797395",
    "email": "yossefayyman@gmail.com",
    "tax_id": "5477777",
}

# White logo PNG; rendered dark on invoices via CSS filter (no black header bar).
LOGO_FILE_NAME = "logo.png"


def _logo_source_path(logo_path: str | None = None) -> str:
    if logo_path and os.path.isfile(logo_path):
        return logo_path
    app_dir = os.path.join(frappe.get_app_path("elmahdi"), "public", "images")
    for name in (LOGO_FILE_NAME, "myLogo-white.png", "myLogo.png"):
        candidate = os.path.join(app_dir, name)
        if os.path.isfile(candidate):
            return candidate
    repo_public = os.path.abspath(
        os.path.join(frappe.get_app_path("elmahdi"), "..", "..", "..", "public", LOGO_FILE_NAME)
    )
    if os.path.isfile(repo_public):
        return repo_public
    raise FileNotFoundError(
        f"Logo not found. Place {LOGO_FILE_NAME} in elmahdi/public/images/ or pass logo_path=..."
    )


def _upload_logo_file(logo_path: str) -> str:
    """
    Copy logo into site public/files (no Redis / background jobs required).
    Letter head HTML uses /files/myLogo.png directly.
    """
    files_dir = frappe.get_site_path("public", "files")
    os.makedirs(files_dir, exist_ok=True)
    dest = os.path.join(files_dir, LOGO_FILE_NAME)
    shutil.copy2(logo_path, dest)

    file_url = f"/files/{LOGO_FILE_NAME}"

    try:
        existing = frappe.db.get_value("File", {"file_url": file_url}, "name")
        if existing:
            frappe.db.set_value(
                "File",
                existing,
                {"file_name": LOGO_FILE_NAME, "is_private": 0},
                update_modified=False,
            )
        elif not frappe.db.exists("File", {"file_name": LOGO_FILE_NAME}):
            with open(logo_path, "rb") as handle:
                content = handle.read()
            from frappe.utils.file_manager import save_file

            save_file(LOGO_FILE_NAME, content, None, None, is_private=0)
    except Exception:
        pass

    return file_url


def _company_lines(company: str) -> dict:
    row = frappe.db.get_value(
        "Company",
        company,
        ["company_name", "phone_no", "email", "website", "tax_id"],
        as_dict=True,
    )
    if not row:
        frappe.throw(f"Company not found: {company}")

    address_parts = []
    for link in frappe.get_all(
        "Dynamic Link",
        filters={"link_doctype": "Company", "link_name": company, "parenttype": "Address"},
        fields=["parent"],
        limit=1,
    ):
        addr = frappe.db.get_value(
            "Address",
            link.parent,
            ["address_line1", "address_line2", "city", "state", "pincode", "country"],
            as_dict=True,
        )
        if addr:
            address_parts = [
                p
                for p in [
                    addr.address_line1,
                    addr.address_line2,
                    addr.city,
                    addr.state,
                    addr.pincode,
                    addr.country,
                ]
                if p
            ]
            break

    return {
        "name": LETTERHEAD_INFO["name"] or row.company_name or company,
        "phone": LETTERHEAD_INFO["phone"] or row.phone_no or "",
        "email": LETTERHEAD_INFO["email"] or row.email or "",
        "website": row.website or "",
        "tax_id": LETTERHEAD_INFO["tax_id"] or row.tax_id or "",
        "address": " · ".join(address_parts),
    }


def _sync_company_contact(company: str, info: dict) -> None:
    """Keep Company master in sync with letterhead contact lines."""
    updates = {}
    if info.get("phone"):
        updates["phone_no"] = info["phone"]
    if info.get("email"):
        updates["email"] = info["email"]
    if info.get("tax_id"):
        updates["tax_id"] = info["tax_id"]
    if updates:
        frappe.db.set_value("Company", company, updates, update_modified=True)


def _letterhead_html(logo_url: str, info: dict) -> str:
    site = get_url()
    img_src = logo_url if logo_url.startswith("http") else f"{site.rstrip('/')}{logo_url}"

    meta_bits = []
    if info.get("address"):
        meta_bits.append(info["address"])
    if info.get("phone"):
        meta_bits.append(f"Tel: {info['phone']}")
    if info.get("email"):
        meta_bits.append(info["email"])
    if info.get("website"):
        meta_bits.append(info["website"])
    if info.get("tax_id"):
        meta_bits.append(f"Tax ID: {info['tax_id']}")
    meta_line = " &nbsp;|&nbsp; ".join(meta_bits)

    return f"""
<div class="elmahdi-letterhead" style="width:100%; margin:0 0 18px 0; padding:0 0 14px 0; border-bottom:3px solid #111; background:transparent;">
  <table style="width:100%; border-collapse:collapse;">
    <tr>
      <td style="width:130px; vertical-align:middle; padding:0 16px 0 0;">
        <img src="{img_src}" alt="{info['name']}"
          style="display:block; height:72px; width:auto; max-width:120px; object-fit:contain; filter:brightness(0);" />
      </td>
      <td style="vertical-align:middle; text-align:right;">
        <div style="font-size:24px; font-weight:700; color:#111; line-height:1.2; letter-spacing:0.3px;">
          {info['name']}
        </div>
        <div style="font-size:11px; color:#444; margin-top:6px; line-height:1.5;">
          {meta_line or '&nbsp;'}
        </div>
      </td>
    </tr>
  </table>
</div>
""".strip()


def _ensure_letter_head(content: str) -> str:
    if frappe.db.exists("Letter Head", LETTER_HEAD_NAME):
        doc = frappe.get_doc("Letter Head", LETTER_HEAD_NAME)
    else:
        doc = frappe.new_doc("Letter Head")
        doc.letter_head_name = LETTER_HEAD_NAME

    doc.content = content
    doc.disabled = 0
    meta = frappe.get_meta("Letter Head")
    if meta.has_field("is_default"):
        doc.is_default = 1
    for field, value in (
        ("source", "HTML"),
        ("letter_head_based_on", "HTML"),
        ("footer_based_on", "HTML"),
    ):
        if meta.has_field(field):
            doc.set(field, value)
    if meta.has_field("image"):
        doc.image = None
    doc.flags.ignore_permissions = True
    doc.save()
    return doc.name


def _apply_company_default(company: str, letter_head: str) -> None:
    frappe.db.set_value("Company", company, "default_letter_head", letter_head, update_modified=False)

    for doctype in ("Sales Invoice", "POS Invoice", "Purchase Invoice"):
        if frappe.get_meta(doctype).has_field("letter_head"):
            frappe.db.sql(
                f"""
                UPDATE `tab{doctype}`
                SET letter_head = %s
                WHERE company = %s AND (letter_head IS NULL OR letter_head = '')
                """,
                (letter_head, company),
            )


def execute(company: str | None = None, logo_path: str | None = None):
    company = company or COMPANY
    if not frappe.db.exists("Company", company):
        frappe.throw(f"Company not found: {company}")

    path = _logo_source_path(logo_path)
    logo_url = _upload_logo_file(path)
    info = _company_lines(company)
    html = _letterhead_html(logo_url, info)
    lh_name = _ensure_letter_head(html)
    _sync_company_contact(company, info)
    _apply_company_default(company, lh_name)

    frappe.db.commit()
    return {
        "letter_head": lh_name,
        "company": company,
        "logo_url": logo_url,
        "message": "Letter head created and set as company default for invoices.",
    }

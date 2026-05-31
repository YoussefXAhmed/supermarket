"""
Server-side guards for REST / Desk mutations — fail-closed for operational users.

UI hiding is not sufficient; these checks run on document hooks and API requests.
Does not alter submit business logic, stock validation, or accounting postings.
"""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.spa_authorization import has_cap, is_break_glass_user

# DocTypes operational users must never delete via REST/Desk (disable users instead).
NO_DELETE_DOCTYPES = frozenset(
	{
		"User",
		"Employee",
		"Payment Entry",
		"Purchase Invoice",
		"Purchase Receipt",
		"Sales Invoice",
		"POS Invoice",
		"POS Closing Entry",
		"POS Opening Entry",
		"Stock Entry",
		"Stock Reconciliation",
		"Journal Entry",
		"GL Entry",
	}
)

# Cancel is break-glass / desk-only for operational roles (SPA uses typed workflows).
NO_CANCEL_DOCTYPES = frozenset(
	{
		"Payment Entry",
		"Purchase Invoice",
		"Purchase Receipt",
		"Sales Invoice",
		"POS Invoice",
		"POS Closing Entry",
		"POS Opening Entry",
		"Stock Entry",
		"Stock Reconciliation",
		"Journal Entry",
	}
)

# Block generic REST DELETE on these paths even when DocPerm is misconfigured.
REST_DELETE_BLOCKED = NO_DELETE_DOCTYPES

# Generic REST mutations that must never be exposed to operational users.
REST_MUTATION_DENYLIST = frozenset(
	{
		"Workspace",
		"Role",
		"Module Profile",
		"Account",
		"Journal Entry",
		"Sales Order",
		"Purchase Order",
		"Quotation",
	}
)

# DocTypes requiring explicit backend capability checks for REST mutations.
CAPABILITY_GUARDED_MUTATIONS: dict[str, str] = {
	"User": "can_manage_operational_users",
	"User Permission": "can_manage_operational_users",
	"Employee": "can_manage_employees",
	"POS Closing Entry": "can_approve_shift",
}


def _deny_unless_break_glass(message: str) -> None:
	if is_break_glass_user():
		return
	frappe.throw(_(message), frappe.PermissionError)


def before_request() -> None:
	"""Block dangerous REST /api/resource mutations for non-break-glass sessions."""
	if not getattr(frappe.local, "request", None):
		return
	if frappe.session.user in ("Guest",):
		return
	if is_break_glass_user():
		return

	path = (frappe.request.path or "").strip()
	if not path.startswith("/api/resource/"):
		return
	method = (frappe.request.method or "").upper()
	if method not in {"POST", "PUT", "DELETE"}:
		return

	parts = path.rstrip("/").split("/")
	# /api/resource/DocType/name
	if len(parts) < 4:
		return
	doctype = parts[3]
	if doctype in REST_MUTATION_DENYLIST:
		frappe.throw(
			_("Direct REST mutation is blocked for {0}. Use dedicated workflow APIs.").format(doctype),
			frappe.PermissionError,
		)

	required_cap = CAPABILITY_GUARDED_MUTATIONS.get(doctype)
	if required_cap and not has_cap(required_cap):
		frappe.throw(
			_("You do not have permission to modify {0}.").format(doctype),
			frappe.PermissionError,
		)

	if method == "DELETE" and doctype in REST_DELETE_BLOCKED:
		frappe.throw(
			_("Deletion of {0} is not permitted. Cancel or disable instead.").format(doctype),
			frappe.PermissionError,
		)


def before_cancel_guard(doc, method=None) -> None:
	if doc.doctype not in NO_CANCEL_DOCTYPES:
		return
	_deny_unless_break_glass(
		_("Cancellation of {0} is restricted to administrators.").format(doc.doctype),
	)


def on_trash_guard(doc, method=None) -> None:
	if doc.doctype not in NO_DELETE_DOCTYPES:
		return
	_deny_unless_break_glass(
		_("Deletion of {0} is not permitted. Use disable or cancel workflows instead.").format(
			doc.doctype
		),
	)


def on_trash_user(doc, method=None) -> None:
	"""Never allow operational SPA users to hard-delete User records."""
	if doc.name in ("Administrator", "Guest"):
		return
	_deny_unless_break_glass(_("Users cannot be deleted. Disable the account instead."))

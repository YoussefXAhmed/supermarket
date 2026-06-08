"""HR notifications — best-effort wrappers over Frappe's Notification Log."""

from __future__ import annotations

import frappe


def _add(for_user: str, subject: str, document_type: str, document_name: str) -> None:
	"""Insert one Notification Log row. Silently swallows errors so the
	caller (a write endpoint) is never blocked by a notification hiccup."""
	try:
		frappe.get_doc({
			"doctype": "Notification Log",
			"for_user": for_user,
			"subject": subject,
			"type": "Alert",
			"document_type": document_type,
			"document_name": document_name,
		}).insert(ignore_permissions=True)
	except Exception:
		pass


def _resolve_users_with_role(role: str) -> list[str]:
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT u.name FROM `tabUser` u
		INNER JOIN `tabHas Role` r ON r.parent = u.name
		WHERE r.role = %s AND u.enabled = 1 AND u.name NOT IN ('Administrator','Guest')
		""",
		(role,),
		as_dict=True,
	)
	return [r.name for r in rows]


def _resolve_store_managers_for_branch(branch: str | None) -> list[str]:
	"""Store Managers User-Permission-bound to the given Warehouse."""
	if not branch:
		return _resolve_users_with_role("Sales Manager")
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT up.user FROM `tabUser Permission` up
		INNER JOIN `tabHas Role` r ON r.parent = up.user
		WHERE up.allow = 'Warehouse'
		  AND up.for_value = %s
		  AND r.role = 'Sales Manager'
		""",
		(branch,),
		as_dict=True,
	)
	return [r.user for r in rows]


def notify_leave_pending(name: str, employee: str, leave_type: str,
                          from_date: str, to_date: str) -> None:
	"""Pending leave → notify HR + branch's Store Managers."""
	emp_name = frappe.db.get_value("Employee", employee, "employee_name") or employee
	branch = frappe.db.get_value("Employee", employee, "elmahdi_branch_warehouse") or ""
	subject = f"Leave request: {emp_name} ({leave_type}, {from_date} → {to_date})"

	recipients = set()
	recipients.update(_resolve_users_with_role("HR Manager"))
	recipients.update(_resolve_users_with_role("HR User"))
	recipients.update(_resolve_store_managers_for_branch(branch))
	for u in recipients:
		_add(u, subject, "Leave Application", name)


def notify_leave_decision(name: str, requester: str, decision: str,
                           notes: str | None = None) -> None:
	"""Decision → notify the requester."""
	if not requester or requester in ("Administrator", "Guest"):
		return
	subject = f"Your leave request was {decision.lower()}"
	if notes:
		subject += f" — {notes[:80]}"
	_add(requester, subject, "Leave Application", name)

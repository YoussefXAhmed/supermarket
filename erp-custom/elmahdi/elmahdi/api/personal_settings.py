"""
Personal Settings — `/me/*` backend.

Every endpoint operates on `frappe.session.user` ONLY. No admin override,
no user-scoped lookups. A user cannot read or write anyone else's prefs.

Sections:
    profile        — User.full_name / mobile_no / user_image (+ email read-only)
    language       — User.language (writes to both User.language + caller's local store)
    notifications  — Notification Settings (per-user Single, Frappe-native) +
                     elmahdi_notification_sound (custom User field)
    printing       — elmahdi_default_printer / elmahdi_auto_print_override
    security       — change_password / list_sessions / revoke_session / login_history

All endpoints require a logged-in user (Guest blocked). They do NOT use
`assert_may_manage_system_settings` — there is intentionally no admin gate.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import now_datetime


# Field allowlists per section — defense in depth (a malicious payload
# can't poke arbitrary User fields).

_PROFILE_WRITABLE = ("full_name", "mobile_no", "user_image")
_LANGUAGE_WRITABLE = ("language",)
_PRINTING_WRITABLE = ("elmahdi_default_printer", "elmahdi_auto_print_override")
# Notification Sound is a User custom field; the rest of the
# notifications section lives on the per-user `Notification Settings`.
_NOTIFICATIONS_USER_WRITABLE = ("elmahdi_notification_sound",)
_NOTIFICATIONS_SETTINGS_WRITABLE = ("enabled", "enable_email_notifications",
                                    "email_notify_for_all_documents",
                                    "subscribed_documents")


# ── shared helpers ───────────────────────────────────────────────────────


def _require_authenticated() -> str:
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw(
			_("You must be logged in to manage personal settings."),
			frappe.PermissionError,
		)
	return user


def _user_doc() -> "frappe.model.document.Document":  # noqa: UP037
	return frappe.get_doc("User", _require_authenticated())


# ── profile ──────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_profile() -> dict:
	user = _user_doc()
	return {
		"name": user.name,
		"full_name": user.full_name or "",
		"email": user.email or "",
		"mobile_no": user.mobile_no or "",
		"user_image": user.user_image or "",
		"username": user.username or "",
		"roles": [r.role for r in (user.roles or [])],
		"role_profile_name": user.role_profile_name or "",
	}


@frappe.whitelist(methods=["POST"])
def update_profile(payload) -> dict:
	_require_authenticated()
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid payload."), frappe.ValidationError)

	user = _user_doc()
	dirty = False
	for field, new_value in payload.items():
		if field not in _PROFILE_WRITABLE:
			continue
		if str(getattr(user, field, None) or "") == str(new_value or ""):
			continue
		setattr(user, field, new_value)
		dirty = True
	if dirty:
		user.flags.ignore_permissions = True
		user.save()
		frappe.db.commit()
	return {"updated": dirty}


# ── language ─────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_language() -> dict:
	user = _user_doc()
	return {"language": user.language or "en"}


@frappe.whitelist(methods=["POST"])
def update_language(language: str) -> dict:
	_require_authenticated()
	if language not in ("en", "ar"):
		frappe.throw(
			_("Unsupported language: {0}").format(language),
			frappe.ValidationError,
		)
	frappe.db.set_value("User", frappe.session.user, "language", language)
	frappe.db.commit()
	return {"language": language}


# ── notifications ────────────────────────────────────────────────────────


@frappe.whitelist()
def get_notifications() -> dict:
	user = _user_doc()
	# Notification Settings is a per-user Single in Frappe; it materializes
	# automatically the first time we read it.
	try:
		ns = frappe.get_doc("Notification Settings", frappe.session.user)
		ns_payload = {
			"enabled": int(ns.enabled or 0),
			"enable_email_notifications": int(ns.get("enable_email_notifications") or 0),
		}
	except Exception:  # noqa: BLE001
		ns_payload = {"enabled": 1, "enable_email_notifications": 1}
	return {
		"elmahdi_notification_sound": int(user.get("elmahdi_notification_sound") or 0),
		**ns_payload,
	}


@frappe.whitelist(methods=["POST"])
def update_notifications(payload) -> dict:
	_require_authenticated()
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid payload."), frappe.ValidationError)

	user_updates = {k: (1 if str(v) in ("1", "true", "True") else 0)
	                for k, v in payload.items()
	                if k in _NOTIFICATIONS_USER_WRITABLE}
	if user_updates:
		frappe.db.set_value("User", frappe.session.user, user_updates)

	ns_updates = {k: v for k, v in payload.items()
	              if k in _NOTIFICATIONS_SETTINGS_WRITABLE}
	if ns_updates:
		try:
			ns = frappe.get_doc("Notification Settings", frappe.session.user)
			for field, val in ns_updates.items():
				setattr(ns, field, val)
			ns.flags.ignore_permissions = True
			ns.save()
		except Exception:  # noqa: BLE001
			# Notification Settings is auto-created on first access; if
			# anything breaks we surface a soft warning but don't fail
			# the User-field update.
			frappe.log_error(
				title="Notification Settings update failed",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()
	return {"updated": bool(user_updates or ns_updates),
	        "user": user_updates, "settings": ns_updates}


# ── printing ─────────────────────────────────────────────────────────────


@frappe.whitelist()
def get_printing() -> dict:
	user = _user_doc()
	return {
		"elmahdi_default_printer": user.get("elmahdi_default_printer") or "",
		"elmahdi_auto_print_override": user.get("elmahdi_auto_print_override") or "Use POS Profile",
	}


@frappe.whitelist(methods=["POST"])
def update_printing(payload) -> dict:
	_require_authenticated()
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid payload."), frappe.ValidationError)
	updates = {k: v for k, v in payload.items() if k in _PRINTING_WRITABLE}
	if not updates:
		return {"updated": False}
	frappe.db.set_value("User", frappe.session.user, updates)
	frappe.db.commit()
	return {"updated": True, "values": updates}


# ── security ─────────────────────────────────────────────────────────────


@frappe.whitelist(methods=["POST"])
def change_password(old_password: str, new_password: str) -> dict:
	"""Verify the current password before setting a new one. Uses Frappe's
	own auth check to honor the password policy from Security Settings."""
	user = _require_authenticated()
	if not old_password or not new_password:
		frappe.throw(_("Old and new password are required."),
		             frappe.ValidationError)
	from frappe.auth import check_password
	try:
		check_password(user, old_password)
	except frappe.AuthenticationError:
		frappe.throw(_("Current password is incorrect."),
		             frappe.AuthenticationError)
	# `update_password` enforces password strength via System Settings.
	from frappe.utils.password import update_password
	update_password(user, new_password)
	frappe.db.commit()
	return {"updated": True}


@frappe.whitelist()
def list_sessions() -> list[dict]:
	"""Active sessions for the current user. Read from `tabSessions`
	directly because `frappe.sessions` API is internal."""
	user = _require_authenticated()
	rows = frappe.db.sql(
		"""
		SELECT sid, lastupdate, ipaddress, status
		FROM `tabSessions`
		WHERE user = %s
		ORDER BY lastupdate DESC
		""",
		(user,), as_dict=True,
	)
	out = []
	current_sid = frappe.session.sid
	for r in rows:
		out.append({
			"sid": r.sid,
			# `device` is reconstructed from User-Agent in newer Frappe;
			# fall back to IP+status here.
			"device": (r.ipaddress or "") + (f" · {r.status}" if r.status else ""),
			"lastupdate": str(r.lastupdate) if r.lastupdate else "",
			"is_current": r.sid == current_sid,
		})
	return out


@frappe.whitelist(methods=["POST"])
def revoke_session(sid: str) -> dict:
	"""Revoke a specific session (cannot revoke own current session)."""
	user = _require_authenticated()
	if not sid:
		frappe.throw(_("sid required"), frappe.ValidationError)
	if sid == frappe.session.sid:
		frappe.throw(_("You cannot revoke the current session here. Sign out instead."),
		             frappe.ValidationError)
	deleted = frappe.db.sql(
		"DELETE FROM `tabSessions` WHERE user = %s AND sid = %s",
		(user, sid),
	)
	frappe.db.commit()
	return {"revoked": sid, "rows_affected": deleted}


@frappe.whitelist()
def login_history(limit: int = 50) -> list[dict]:
	"""Recent login activity for the current user via Activity Log."""
	user = _require_authenticated()
	rows = frappe.db.sql(
		"""
		SELECT name, creation, operation, status, ip_address, subject
		FROM `tabActivity Log`
		WHERE user = %s AND operation IN ('Login', 'Logout')
		ORDER BY creation DESC
		LIMIT %s
		""",
		(user, int(limit or 50)),
		as_dict=True,
	)
	for r in rows:
		if r.get("creation"):
			r["creation"] = str(r["creation"])
	return rows

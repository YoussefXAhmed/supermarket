"""Post-migrate: REST matrix, desk lockdown, monitor shift perms, delete/cancel guards."""

from __future__ import annotations

from elmahdi.setup.operational_security_hardening import execute as run_hardening


def execute():
	return run_hardening()

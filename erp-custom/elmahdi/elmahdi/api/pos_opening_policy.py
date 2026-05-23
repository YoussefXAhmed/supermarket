"""POS Opening Entry — operational submit policy (cashier open only)."""

from __future__ import annotations

import frappe
from frappe import _

from elmahdi.api.shift_authorization import is_break_glass_user
from elmahdi.api.spa_authorization import assert_may_open_shift


def before_submit_pos_opening(doc, method=None):
	"""Block REST/native submit except cashiers (and break-glass). Accountants need submit DocPerm only for closing side-effects."""
	if is_break_glass_user():
		return
	assert_may_open_shift()

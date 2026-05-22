"""Ensure POS Invoice idempotency custom field exists on upgraded sites."""


def execute():
	from elmahdi.setup.approval_custom_fields import execute as install_approval_fields

	install_approval_fields()

"""
Supplier payment vs payable segregation — delegates to spa_authorization.

Kept for backward-compatible imports from accounts_payable, erp_submit, invoice_matching.
"""

from __future__ import annotations

from elmahdi.api.spa_authorization import (
	assert_may_manage_supplier_payable,
	assert_may_record_supplier_payment,
	may_manage_supplier_payable,
	may_record_supplier_payment,
)

# Legacy aliases used across the codebase
may_manage_supplier_payable_via_api = may_manage_supplier_payable
assert_may_manage_supplier_payable_via_api = assert_may_manage_supplier_payable

__all__ = [
	"assert_may_manage_supplier_payable",
	"assert_may_manage_supplier_payable_via_api",
	"assert_may_record_supplier_payment",
	"may_manage_supplier_payable",
	"may_manage_supplier_payable_via_api",
	"may_record_supplier_payment",
]

"""
Tests for POS Profile Authorization (pos_profile_auth.py).

Run with:
    bench run-tests --app elmahdi --module elmahdi.tests.test_pos_profile_auth

Or via bench console:
    bench execute elmahdi.tests.test_pos_profile_auth.run_all

Each test creates its own isolated fixtures and cleans up after itself.
No permanent data is written to the database (all wrapped in transactions or
cleaned up in tearDown / addCleanup).
"""

from __future__ import annotations

import unittest

import frappe
from frappe import _


# ---------------------------------------------------------------------------
# Helpers — fixture builders
# ---------------------------------------------------------------------------


def _make_user(email: str, roles: list[str] | None = None, role_profile: str = "") -> str:
    """Create a minimal User doc and return the username (email)."""
    if frappe.db.exists("User", email):
        frappe.delete_doc("User", email, force=True)

    user = frappe.new_doc("User")
    user.email = email
    user.first_name = email.split("@")[0]
    user.send_welcome_email = 0
    user.enabled = 1
    if role_profile:
        user.role_profile_name = role_profile
    user.insert(ignore_permissions=True)

    for role in roles or []:
        user.add_roles(role)

    return email


def _make_pos_profile(
    name: str,
    company: str,
    warehouse: str,
    users: list[str] | None = None,
) -> str:
    """
    Create a minimal POS Profile.
    `users`: list of user emails to add to applicable_for_users.
              If None or empty → open profile (no restriction).
    """
    if frappe.db.exists("POS Profile", name):
        frappe.delete_doc("POS Profile", name, force=True)

    profile = frappe.new_doc("POS Profile")
    profile.name = name
    profile.pos_profile_name = name
    profile.company = company
    profile.warehouse = warehouse
    profile.payments = []

    if users:
        for u in users:
            profile.append("applicable_for_users", {"user": u, "default": 0})

    profile.insert(ignore_permissions=True)
    return name


def _cleanup(*names_and_doctypes):
    """Delete fixtures in reverse order, ignoring errors."""
    for doctype, name in reversed(names_and_doctypes):
        try:
            if frappe.db.exists(doctype, name):
                frappe.delete_doc(doctype, name, force=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Test: is_user_authorized_for_pos_profile
# ---------------------------------------------------------------------------


class TestIsUserAuthorized(unittest.TestCase):
    """Unit tests for the pure predicate (no side effects, no exceptions)."""

    PROFILE = "TestAuth-Profile-Restricted"
    PROFILE_OPEN = "TestAuth-Profile-Open"
    CASHIER_A = "cashier_a_auth@testelmahdi.local"
    CASHIER_B = "cashier_b_auth@testelmahdi.local"
    MANAGER = "manager_auth@testelmahdi.local"
    COMPANY = "Test Company"
    WAREHOUSE = "Stores - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import is_user_authorized_for_pos_profile

        self.check = is_user_authorized_for_pos_profile

        # Fixtures
        _make_user(self.CASHIER_A, roles=["POS User"])
        _make_user(self.CASHIER_B, roles=["POS User"])
        _make_user(self.MANAGER, roles=["Store Manager"])

        _make_pos_profile(
            self.PROFILE,
            self.COMPANY,
            self.WAREHOUSE,
            users=[self.CASHIER_A],  # restricted to A only
        )
        _make_pos_profile(
            self.PROFILE_OPEN,
            self.COMPANY,
            self.WAREHOUSE,
            users=[],  # open profile
        )

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("POS Profile", self.PROFILE_OPEN),
            ("User", self.CASHIER_A),
            ("User", self.CASHIER_B),
            ("User", self.MANAGER),
        )

    # -- Authorized cashier --------------------------------------------------

    def test_authorized_cashier_restricted_profile(self):
        """Cashier A is in the user list → authorized."""
        self.assertTrue(self.check(self.PROFILE, user=self.CASHIER_A))

    # -- Unauthorized cashier ------------------------------------------------

    def test_unauthorized_cashier_restricted_profile(self):
        """Cashier B is NOT in the user list → not authorized."""
        self.assertFalse(self.check(self.PROFILE, user=self.CASHIER_B))

    # -- Open profile --------------------------------------------------------

    def test_any_cashier_open_profile(self):
        """Open profile (no user list) → both cashiers are authorized."""
        self.assertTrue(self.check(self.PROFILE_OPEN, user=self.CASHIER_A))
        self.assertTrue(self.check(self.PROFILE_OPEN, user=self.CASHIER_B))

    # -- Manager override ----------------------------------------------------

    def test_manager_override_restricted_profile(self):
        """Store Manager bypasses user-list restriction."""
        self.assertTrue(self.check(self.PROFILE, user=self.MANAGER))

    # -- Guest always denied -------------------------------------------------

    def test_guest_denied(self):
        """Guest user is always denied."""
        self.assertFalse(self.check(self.PROFILE, user="Guest"))
        self.assertFalse(self.check(self.PROFILE_OPEN, user="Guest"))

    # -- Non-existent profile ------------------------------------------------

    def test_nonexistent_profile_returns_false(self):
        """Non-existent profile returns False (does not raise)."""
        self.assertFalse(self.check("NoSuchProfile-XYZ-9999", user=self.CASHIER_A))


# ---------------------------------------------------------------------------
# Test: assert_user_authorized_for_pos_profile (raises on failure)
# ---------------------------------------------------------------------------


class TestAssertUserAuthorized(unittest.TestCase):
    """Tests that the assert variant raises the correct exceptions."""

    PROFILE = "TestAssert-Profile-Restricted"
    CASHIER_OK = "cashier_ok_assert@testelmahdi.local"
    CASHIER_BAD = "cashier_bad_assert@testelmahdi.local"
    MANAGER = "manager_assert@testelmahdi.local"
    COMPANY = "Test Company"
    WAREHOUSE = "Stores - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import assert_user_authorized_for_pos_profile

        self.assert_auth = assert_user_authorized_for_pos_profile

        _make_user(self.CASHIER_OK, roles=["POS User"])
        _make_user(self.CASHIER_BAD, roles=["POS User"])
        _make_user(self.MANAGER, roles=["POS Manager"])

        _make_pos_profile(
            self.PROFILE,
            self.COMPANY,
            self.WAREHOUSE,
            users=[self.CASHIER_OK],
        )

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("User", self.CASHIER_OK),
            ("User", self.CASHIER_BAD),
            ("User", self.MANAGER),
        )

    def test_authorized_cashier_does_not_raise(self):
        """Authorized cashier → no exception."""
        try:
            self.assert_auth(self.PROFILE, user=self.CASHIER_OK)
        except frappe.PermissionError:
            self.fail("assert_user_authorized_for_pos_profile raised PermissionError for authorized user")

    def test_unauthorized_cashier_raises_permission_error(self):
        """Unauthorized cashier → PermissionError."""
        with self.assertRaises(frappe.PermissionError):
            self.assert_auth(self.PROFILE, user=self.CASHIER_BAD)

    def test_manager_override_does_not_raise(self):
        """POS Manager → no exception even on restricted profile."""
        try:
            self.assert_auth(self.PROFILE, user=self.MANAGER)
        except frappe.PermissionError:
            self.fail("assert_user_authorized_for_pos_profile raised PermissionError for manager")

    def test_blank_profile_raises_validation_error(self):
        """Blank pos_profile → ValidationError (not PermissionError)."""
        with self.assertRaises(frappe.ValidationError):
            self.assert_auth("", user=self.CASHIER_OK)

    def test_nonexistent_profile_raises_validation_error(self):
        """Non-existent profile → ValidationError."""
        with self.assertRaises(frappe.ValidationError):
            self.assert_auth("NoSuchProfile-XYZ-9999", user=self.CASHIER_OK)

    def test_guest_raises_permission_error(self):
        """Guest → PermissionError (must be logged in)."""
        with self.assertRaises(frappe.PermissionError):
            self.assert_auth(self.PROFILE, user="Guest")


# ---------------------------------------------------------------------------
# Test: assert_invoice_warehouse_matches_profile
# ---------------------------------------------------------------------------


class TestWarehouseMatchesProfile(unittest.TestCase):
    """Tests that warehouse spoofing is blocked."""

    PROFILE = "TestWH-Profile"
    CASHIER = "cashier_wh@testelmahdi.local"
    MANAGER = "manager_wh@testelmahdi.local"
    COMPANY = "Test Company"
    PROFILE_WH = "Stores - TC"
    OTHER_WH = "Back Office - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import assert_invoice_warehouse_matches_profile

        self.check_wh = assert_invoice_warehouse_matches_profile

        _make_user(self.CASHIER, roles=["POS User"])
        _make_user(self.MANAGER, roles=["Store Manager"])

        _make_pos_profile(self.PROFILE, self.COMPANY, self.PROFILE_WH, users=[self.CASHIER])

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("User", self.CASHIER),
            ("User", self.MANAGER),
        )

    def _set_session(self, user: str):
        frappe.set_user(user)

    def test_correct_warehouse_passes(self):
        self._set_session(self.CASHIER)
        try:
            self.check_wh(self.PROFILE, self.PROFILE_WH)
        except frappe.PermissionError:
            self.fail("Correct warehouse raised PermissionError")

    def test_wrong_warehouse_raises(self):
        self._set_session(self.CASHIER)
        with self.assertRaises(frappe.PermissionError):
            self.check_wh(self.PROFILE, self.OTHER_WH)

    def test_manager_can_use_different_warehouse(self):
        """Managers bypass the warehouse check."""
        self._set_session(self.MANAGER)
        try:
            self.check_wh(self.PROFILE, self.OTHER_WH)
        except frappe.PermissionError:
            self.fail("Manager should bypass warehouse check")

    def test_blank_warehouse_is_skipped(self):
        """Blank warehouse is skipped (handled by required-field check upstream)."""
        self._set_session(self.CASHIER)
        try:
            self.check_wh(self.PROFILE, "")
        except frappe.PermissionError:
            self.fail("Blank warehouse should not raise PermissionError")


# ---------------------------------------------------------------------------
# Test: open profile (no user list configured)
# ---------------------------------------------------------------------------


class TestOpenProfile(unittest.TestCase):
    """Any authenticated POS user may use an open profile."""

    PROFILE = "TestOpen-Profile"
    CASHIER_A = "cashier_open_a@testelmahdi.local"
    CASHIER_B = "cashier_open_b@testelmahdi.local"
    COMPANY = "Test Company"
    WAREHOUSE = "Stores - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import is_user_authorized_for_pos_profile

        self.check = is_user_authorized_for_pos_profile

        _make_user(self.CASHIER_A, roles=["POS User"])
        _make_user(self.CASHIER_B, roles=["Sales User"])

        _make_pos_profile(self.PROFILE, self.COMPANY, self.WAREHOUSE, users=None)

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("User", self.CASHIER_A),
            ("User", self.CASHIER_B),
        )

    def test_cashier_a_open_profile(self):
        self.assertTrue(self.check(self.PROFILE, user=self.CASHIER_A))

    def test_cashier_b_open_profile(self):
        self.assertTrue(self.check(self.PROFILE, user=self.CASHIER_B))


# ---------------------------------------------------------------------------
# Test: multiple users on one profile
# ---------------------------------------------------------------------------


class TestMultiUserProfile(unittest.TestCase):
    """A profile can list multiple authorized users."""

    PROFILE = "TestMulti-Profile"
    CASHIER_A = "cashier_multi_a@testelmahdi.local"
    CASHIER_B = "cashier_multi_b@testelmahdi.local"
    CASHIER_C = "cashier_multi_c@testelmahdi.local"
    COMPANY = "Test Company"
    WAREHOUSE = "Stores - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import is_user_authorized_for_pos_profile

        self.check = is_user_authorized_for_pos_profile

        _make_user(self.CASHIER_A, roles=["POS User"])
        _make_user(self.CASHIER_B, roles=["POS User"])
        _make_user(self.CASHIER_C, roles=["POS User"])

        _make_pos_profile(
            self.PROFILE,
            self.COMPANY,
            self.WAREHOUSE,
            users=[self.CASHIER_A, self.CASHIER_B],
        )

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("User", self.CASHIER_A),
            ("User", self.CASHIER_B),
            ("User", self.CASHIER_C),
        )

    def test_both_listed_cashiers_authorized(self):
        self.assertTrue(self.check(self.PROFILE, user=self.CASHIER_A))
        self.assertTrue(self.check(self.PROFILE, user=self.CASHIER_B))

    def test_unlisted_cashier_not_authorized(self):
        self.assertFalse(self.check(self.PROFILE, user=self.CASHIER_C))


# ---------------------------------------------------------------------------
# Test: administrator override
# ---------------------------------------------------------------------------


class TestAdministratorOverride(unittest.TestCase):
    """System Manager / Administrator always bypasses the user-list check."""

    PROFILE = "TestAdmin-Profile"
    ADMIN_USER = "sysadmin_override@testelmahdi.local"
    COMPANY = "Test Company"
    WAREHOUSE = "Stores - TC"

    def setUp(self):
        from elmahdi.api.pos_profile_auth import is_user_authorized_for_pos_profile

        self.check = is_user_authorized_for_pos_profile

        _make_user(self.ADMIN_USER, roles=["System Manager"])
        _make_pos_profile(
            self.PROFILE,
            self.COMPANY,
            self.WAREHOUSE,
            users=["some_other_cashier@company.com"],  # Admin not in the list
        )

    def tearDown(self):
        _cleanup(
            ("POS Profile", self.PROFILE),
            ("User", self.ADMIN_USER),
        )

    def test_system_manager_override(self):
        self.assertTrue(self.check(self.PROFILE, user=self.ADMIN_USER))


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


def run_all():
    """
    Execute via:
        bench execute elmahdi.tests.test_pos_profile_auth.run_all
    """
    suite = unittest.TestLoader().loadTestsFromModule(__import__(__name__))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result

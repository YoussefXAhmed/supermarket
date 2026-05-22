import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge, UserAvatar } from '../ui';

const NAV_FULL = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: '◈', exact: true, cap: 'canAccessAdminWorkspace' },
  { to: '/admin/accounting', labelKey: 'nav.finance', icon: '💼', cap: 'canAccessAccountantWorkspace' },
  { to: '/admin/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewApprovalsDashboard' },
  { to: '/admin/products', labelKey: 'nav.products', icon: '🛒', cap: 'canManageSystem' },
  { to: '/admin/inventory', labelKey: 'nav.inventory', icon: '📦', cap: 'canAccessInventory' },
  { to: '/admin/purchasing', labelKey: 'nav.purchasing', icon: '🛍️', cap: 'canAccessPurchasing' },
  { to: '/admin/invoices', labelKey: 'common.invoices', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/admin/returns', labelKey: 'nav.returns', icon: '↩', cap: 'canViewReturns' },
  { to: '/admin/shifts/history', labelKey: 'nav.shifts', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/customers', labelKey: 'nav.customers', icon: '👥', cap: 'canViewReports' },
  { to: '/admin/activity', labelKey: 'nav.activity', icon: '📋', cap: 'canViewReports' },
  { to: '/admin/users', labelKey: 'nav.users', icon: '🧑‍💼', cap: 'canManageUsers' },
  { to: '/admin/warehouses', labelKey: 'nav.warehouses', icon: '🏬', cap: 'canManageSystem' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canViewReports' },
  { to: '/pos', labelKey: 'common.pos', icon: '💳', cap: 'canOperatePOS' },
  { to: '/admin/settings', labelKey: 'nav.settings', icon: '⚙️', cap: 'canManageSettings' },
];

const NAV_STORE_MANAGER = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: '◈', exact: true, cap: 'canAccessAdminWorkspace' },
  { to: '/admin/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewApprovalsDashboard' },
  { to: '/admin/shifts/history', labelKey: 'nav.shifts', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/purchasing/approvals', labelKey: 'nav.purchaseRates', icon: '🛍️', cap: 'canViewPurchaseApprovals' },
  { to: '/admin/invoices', labelKey: 'common.invoices', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canViewReports' },
  { to: '/admin/returns', labelKey: 'nav.returns', icon: '↩', cap: 'canViewReturns' },
  { to: '/pos', labelKey: 'common.pos', icon: '💳', cap: 'canViewPOS' },
];

const NAV_ACCOUNTANT = [
  { to: '/admin/accounting', labelKey: 'nav.finance', icon: '💼', exact: true, cap: 'canAccessAccountantWorkspace' },
  { to: '/admin/accounting/matching', labelKey: 'nav.invoiceMatching', icon: '🧾', cap: 'canAccessInvoiceMatching' },
  { to: '/admin/accounting/payments', labelKey: 'nav.supplierPayments', icon: '💳', cap: 'canViewSupplierPayments' },
  { to: '/admin/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewApprovalsDashboard' },
  { to: '/admin/invoices', labelKey: 'common.invoices', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canViewReports' },
  { to: '/admin/shifts/history', labelKey: 'nav.shifts', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/purchasing/approvals', labelKey: 'nav.purchaseRates', icon: '🛍️', cap: 'canViewPurchaseApprovals' },
];

const NAV_PURCHASING_WORKSPACE = [
  { to: '/admin/purchasing', labelKey: 'nav.purchasing', icon: '🛍️', cap: 'canAccessPurchasing' },
];

export default function AdminLayout({ purchasingWorkspace = false }) {
  const { t } = useTranslation();
  const { user, logout, capabilities } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = useMemo(() => {
    let pool = NAV_FULL;
    if (purchasingWorkspace && !hasCapability(capabilities, 'canManageSystem')) {
      pool = NAV_PURCHASING_WORKSPACE;
    } else if (
      capabilities.operationalPersona === 'store_manager' &&
      !hasCapability(capabilities, 'canManageSystem')
    ) {
      pool = NAV_STORE_MANAGER;
    } else if (
      capabilities.operationalPersona === 'accountant' &&
      !hasCapability(capabilities, 'canManageSystem')
    ) {
      pool = NAV_ACCOUNTANT;
    }
    return pool.filter((item) => hasCapability(capabilities, item.cap));
  }, [purchasingWorkspace, capabilities]);

  const profileLink = hasCapability(capabilities, 'canManageSettings')
    ? [{ label: t('nav.settings'), onClick: () => navigate('/admin/settings') }]
    : [];

  return (
    <div className={`admin-layout ${collapsed ? 'admin-layout--collapsed' : ''} ${mobileNav ? 'admin-layout--mobile-nav' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <img className="sidebar__logo" src="/logo.png" alt="Elmahdi logo" />
          {!collapsed && <span className="sidebar__name">Elmahdi</span>}
          <button
            type="button"
            className="sidebar__collapse-btn sidebar__collapse-btn--mobile"
            aria-label="Toggle menu"
            onClick={() => setMobileNav((m) => !m)}
          >
            ☰
          </button>
          <button type="button" className="sidebar__collapse-btn" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '»' : '«'}
          </button>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              onClick={() => setMobileNav(false)}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            >
              <span className="sidebar__link-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar__link-label">{t(item.labelKey)}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          {!collapsed && <RoleBadge />}
          {collapsed ? (
            <div className="sidebar__user">
              <UserAvatar user={user} size="md" className="sidebar__avatar" />
            </div>
          ) : (
            <UserSessionActions
              user={user}
              compact
              links={profileLink}
              onLogout={handleLogout}
            />
          )}
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-content admin-content--workspace">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
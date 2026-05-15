import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

const NAV_FULL = [
  { to: '/admin', label: 'Dashboard', icon: '◈', exact: true, cap: 'canAccessAdminWorkspace' },
  { to: '/admin/products', label: 'Products', icon: '🛒', cap: 'canManageSystem' },
  { to: '/admin/inventory', label: 'Inventory', icon: '📦', cap: 'canAccessInventory' },
  { to: '/admin/purchasing', label: 'Purchasing', icon: '🛍️', cap: 'canAccessPurchasing' },
  { to: '/admin/invoices', label: 'Invoices', icon: '🧾', cap: 'canViewReports' },
  { to: '/admin/returns', label: 'Returns', icon: '↩', cap: 'canViewReturns' },
  { to: '/shifts/history', label: 'Shifts', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/customers', label: 'Customers', icon: '👥', cap: 'canViewReports' },
  { to: '/admin/activity', label: 'Activity', icon: '📋', cap: 'canViewReports' },
  { to: '/admin/users', label: 'Users', icon: '🧑‍💼', cap: 'canManageUsers' },
  { to: '/admin/reports', label: 'Reports', icon: '📊', cap: 'canViewReports' },
  { to: '/pos', label: 'POS', icon: '💳', cap: 'canViewPOS' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️', cap: 'canManageSettings' },
];

const NAV_PURCHASING_WORKSPACE = [
  { to: '/admin/purchasing', label: 'Purchasing', icon: '🛍️', cap: 'canAccessPurchasing' },
];

export default function AdminLayout({ purchasingWorkspace = false }) {
  const { user, logout, capabilities } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = useMemo(() => {
    const pool =
      purchasingWorkspace && !hasCapability(capabilities, 'canManageSystem')
        ? NAV_PURCHASING_WORKSPACE
        : NAV_FULL;
    return pool.filter((item) => hasCapability(capabilities, item.cap));
  }, [purchasingWorkspace, capabilities]);

  const profileLink = hasCapability(capabilities, 'canManageSettings')
    ? [{ label: 'Profile', onClick: () => navigate('/admin/settings') }]
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
              {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          {!collapsed && <RoleBadge />}
          {collapsed ? (
            <div className="sidebar__user">
              <div className="sidebar__avatar">{user?.full_name?.[0]?.toUpperCase() || 'U'}</div>
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

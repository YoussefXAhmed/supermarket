import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: '◈', exact: true },
  { to: '/admin/products', label: 'Products', icon: '🛒' },
  { to: '/admin/inventory', label: 'Inventory', icon: '📦' },
  { to: '/admin/purchasing', label: 'Purchasing', icon: '🛍️' },
  { to: '/admin/invoices', label: 'Invoices', icon: '🧾' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
  { to: '/admin/activity', label: 'Activity', icon: '📋' },
  { to: '/admin/users', label: 'Users', icon: '🧑‍💼' },
  { to: '/admin/reports', label: 'Reports', icon: '📊' },
  { to: '/pos', label: 'POS', icon: '💳' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
          {NAV.map((item) => (
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
              links={[{ label: 'Profile', onClick: () => navigate('/admin/settings') }]}
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

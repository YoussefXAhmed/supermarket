import { useState, useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { canAccessPath } from '../../auth/routeAccess';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge, UserAvatar } from '../ui';

export default function SidebarShellLayout({
  brandLabel,
  navItems = [],
  className = '',
  footerLinks = [],
}) {
  const { t } = useTranslation();
  const { user, capabilities } = useAuth();
  const navigate = useNavigate();
  const { requestLogout, guardModal } = useGuardedLogout();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      if (!item.to.startsWith('/')) return true;
      return canAccessPath(item.to, capabilities);
    }),
    [navItems, capabilities],
  );

  const sessionLinks = footerLinks.map((link) => ({
    label: t(link.labelKey),
    onClick: () => navigate(link.to),
  }));

  return (
    <div className={`admin-layout ${className} ${collapsed ? 'admin-layout--collapsed' : ''} ${mobileNav ? 'admin-layout--mobile-nav' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <img className="sidebar__logo" src="/logo.png" alt="Elmahdi logo" />
          {!collapsed && <span className="sidebar__name">{brandLabel}</span>}
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
          {visibleNavItems.map((item) => (
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
            <UserSessionActions user={user} compact links={sessionLinks} onLogout={requestLogout} />
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
      {guardModal}
    </div>
  );
}

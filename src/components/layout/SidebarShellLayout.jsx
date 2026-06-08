import { useState, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { canAccessPath } from '../../auth/routeAccess';
import { getSessionLinksForWorkspace } from '../../auth/navigationConfig';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge, UserAvatar, UserMenu } from '../ui';
import NotificationBell from '../notifications/NotificationBell';
import LanguageSwitcher from '../common/LanguageSwitcher';
import NavIcon from '../icons/NavIcon';

export default function SidebarShellLayout({
  brandLabel,
  navItems = [],
  className = '',
  workspace,
}) {
  const { t } = useTranslation();
  const { user, capabilities } = useAuth();
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

  // Session-menu items sourced from the canonical registry — uniform
  // [Personal Settings, Payslip-if-eligible, workspace-specific] across
  // every workspace shell. UserMenu renders them as <Link> items inside
  // the dropdown; Sign out is appended by UserMenu via onSignOut.
  // Phase 3.5.b + 3.5.c.
  const userMenuItems = useMemo(
    () => getSessionLinksForWorkspace(capabilities, workspace).map((link) => ({
      key: link.to,
      label: t(link.labelKey),
      to: link.to,
    })),
    [capabilities, workspace, t],
  );

  return (
    <div
      className={`admin-layout ${className} ${collapsed ? 'admin-layout--collapsed' : ''} ${mobileNav ? 'admin-layout--mobile-nav' : ''}`}
      data-workspace={workspace || undefined}
    >
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
              <span className="sidebar__link-icon">
                <NavIcon icon={item.icon} size={18} />
              </span>
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
            // Phase 3.5.c — UserMenu primitive replaces UserSessionActions.
            // NotificationBell + LanguageSwitcher stay visible as siblings
            // outside the dropdown per decision D2.
            // Phase 4-hotfix: a visible Sign out icon button sits next to
            // UserMenu so the action is discoverable without first opening
            // the dropdown (users reported they couldn't find it).
            <div className="session-actions session-actions--compact">
              <NotificationBell />
              <LanguageSwitcher />
              <UserMenu
                user={user}
                items={userMenuItems}
                onSignOut={requestLogout}
              />
              <button
                type="button"
                className="session-signout-btn"
                onClick={requestLogout}
                aria-label={t('ui.userMenu.signOut', { defaultValue: 'Sign out' })}
                title={t('ui.userMenu.signOut', { defaultValue: 'Sign out' })}
              >
                <span aria-hidden="true">⎋</span>
              </button>
            </div>
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

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { getInventoryNavItems, getInventorySessionLinks } from '../../auth/navigationConfig';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

export default function InventoryLayout() {
  const { t } = useTranslation();
  const { user, capabilities } = useAuth();
  const navigate = useNavigate();
  const { requestLogout, guardModal } = useGuardedLogout();

  const visibleNav = useMemo(() => getInventoryNavItems(capabilities), [capabilities]);
  const sessionLinks = useMemo(
    () => getInventorySessionLinks(capabilities).map((link) => ({
      label: t(link.labelKey),
      onClick: () => navigate(link.to),
    })),
    [capabilities, navigate, t],
  );

  return (
    <main className="admin-main">
      <div className="admin-content dense-module">
        <div className="inventory-module-header">
          <RoleBadge />
          <nav className="module-nav" aria-label="Inventory">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `module-nav__link ${isActive ? 'module-nav__link--active' : ''}`
                }
              >
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
          <UserSessionActions
            user={user}
            compact
            links={sessionLinks}
            onLogout={requestLogout}
          />
        </div>

        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        {guardModal}
      </div>
    </main>
  );
}

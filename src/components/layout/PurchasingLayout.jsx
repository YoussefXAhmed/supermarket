import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getPurchasingNavItems } from '../../auth/navigationConfig';
import ErrorBoundary from '../common/ErrorBoundary';

export default function PurchasingLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const links = useMemo(() => getPurchasingNavItems(capabilities), [capabilities]);

  return (
    <div className="dense-module">
      <nav className="module-nav" aria-label="Purchasing">
        {links.map((item) => (
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
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}

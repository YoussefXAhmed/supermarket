import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorBoundary from '../common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';

const NAV = [
  { to: '/admin/purchasing', labelKey: 'nav.overview', end: true },
  { to: '/admin/purchasing/suppliers', labelKey: 'nav.suppliers' },
  { to: '/admin/purchasing/receive', labelKey: 'nav.receive' },
  { to: '/admin/purchasing/approvals', labelKey: 'nav.approvals', cap: 'canViewPurchaseApprovals' },
  { to: '/admin/purchasing/invoices', labelKey: 'common.invoices' },
  { to: '/admin/purchasing/matching', labelKey: 'nav.matching' },
  { to: '/admin/purchasing/reports', labelKey: 'nav.reports' },
];

export default function PurchasingLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const links = NAV.filter((item) => !item.cap || hasCapability(capabilities, item.cap));

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

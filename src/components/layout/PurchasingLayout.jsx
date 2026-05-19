import { NavLink, Outlet } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';

const NAV = [
  { to: '/admin/purchasing', label: 'Overview', end: true },
  { to: '/admin/purchasing/suppliers', label: 'Suppliers' },
  { to: '/admin/purchasing/receive', label: 'Receive' },
  { to: '/admin/purchasing/approvals', label: 'Approvals', cap: 'canViewPurchaseApprovals' },
  { to: '/admin/purchasing/invoices', label: 'Invoices' },
  { to: '/admin/purchasing/matching', label: 'Matching' },
  { to: '/admin/purchasing/reports', label: 'Reports' },
];

export default function PurchasingLayout() {
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
            {item.label}
          </NavLink>
        ))}
      </nav>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}

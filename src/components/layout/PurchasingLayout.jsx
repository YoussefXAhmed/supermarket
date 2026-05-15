import { NavLink, Outlet } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary';

const NAV = [
  { to: '/admin/purchasing', label: 'Overview', end: true },
  { to: '/admin/purchasing/suppliers', label: 'Suppliers' },
  { to: '/admin/purchasing/receive', label: 'Receive' },
  { to: '/admin/purchasing/invoices', label: 'Invoices' },
  { to: '/admin/purchasing/matching', label: 'Matching' },
  { to: '/admin/purchasing/reports', label: 'Reports' },
];

export default function PurchasingLayout() {
  return (
    <div className="dense-module">
      <nav className="module-nav" aria-label="Purchasing">
        {NAV.map((item) => (
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

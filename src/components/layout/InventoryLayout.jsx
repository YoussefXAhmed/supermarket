import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

const NAV = [
  { to: '/inventory', label: 'Overview', end: true },
  { to: '/inventory/warehouses', label: 'Warehouses' },
  { to: '/inventory/stock-entry', label: 'Stock entry' },
  { to: '/inventory/transfer', label: 'Transfer' },
  { to: '/inventory/reconciliation', label: 'Reconcile' },
  { to: '/inventory/ledger', label: 'Ledger' },
  { to: '/inventory/items', label: 'Items' },
  { to: '/inventory/alerts', label: 'Alerts' },
  { to: '/inventory/reorder', label: 'Reorder' },
  { to: '/inventory/batches', label: 'Batches' },
  { to: '/inventory/analytics', label: 'Analytics' },
  { to: '/inventory/reports', label: 'Reports' },
];

export default function InventoryLayout() {
  const { user, logout, isAdmin, isPOS } = useAuth();
  const navigate = useNavigate();

  return (
    <main className="admin-main">
      <div className="admin-content dense-module">
        <div className="inventory-module-header">
          <RoleBadge />
          <nav className="module-nav" aria-label="Inventory">
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
          <UserSessionActions
            user={user}
            compact
            links={[
              ...(isAdmin ? [{ label: 'Admin', onClick: () => navigate('/admin') }] : []),
              ...(isPOS || isAdmin ? [{ label: 'POS', onClick: () => navigate('/pos') }] : []),
            ]}
            onLogout={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          />
        </div>

        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </div>
    </main>
  );
}

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useInventoryCapabilities } from '../../hooks/useInventoryCapabilities';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

const NAV = [
  { to: '/inventory', label: 'Overview', end: true },
  { to: '/inventory/warehouses', label: 'Warehouses' },
  { to: '/inventory/stock-entry', label: 'Stock entry' },
  { to: '/inventory/transfer', label: 'Transfer', cap: 'canInventoryIssueTransfer' },
  { to: '/inventory/reconciliation', label: 'Reconcile', cap: 'canInventoryReconcile' },
  { to: '/inventory/ledger', label: 'Ledger' },
  { to: '/inventory/items', label: 'Items' },
  { to: '/inventory/alerts', label: 'Alerts' },
  { to: '/inventory/reorder', label: 'Reorder' },
  { to: '/inventory/batches', label: 'Batches' },
  { to: '/inventory/analytics', label: 'Analytics', cap: 'canInventoryAnalytics' },
  { to: '/inventory/reports', label: 'Reports' },
];

export default function InventoryLayout() {
  const { user, logout, canAccessAdminWorkspace, canViewPOS } = useAuth();
  const caps = useInventoryCapabilities();
  const navigate = useNavigate();

  const visibleNav = NAV.filter((item) => {
    if (!item.cap) return true;
    return Boolean(caps[item.cap]);
  });

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
                {item.label}
              </NavLink>
            ))}
          </nav>
          <UserSessionActions
            user={user}
            compact
            links={[
              ...(canAccessAdminWorkspace ? [{ label: 'Admin', onClick: () => navigate('/admin') }] : []),
              ...(canViewPOS ? [{ label: 'POS', onClick: () => navigate('/pos') }] : []),
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

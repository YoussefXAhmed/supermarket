import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import UserSessionActions from './UserSessionActions';

const NAV = [
  { to: '/inventory', label: 'Dashboard', end: true },
  { to: '/inventory/warehouses', label: 'Warehouses' },
  { to: '/inventory/stock-entry', label: 'Stock Entry' },
  { to: '/inventory/ledger', label: 'Stock Ledger' },
  { to: '/inventory/items', label: 'Item Details' },
  { to: '/inventory/alerts', label: 'Low Stock' },
  { to: '/inventory/reports', label: 'Reports' },
];

export default function InventoryLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <main className="admin-main">
      <div className="admin-content">
        <div className="inventory-nav card" style={{ marginBottom: 16 }}>
          <div className="inventory-nav__links">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `inventory-nav__link ${isActive ? 'inventory-nav__link--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <UserSessionActions
            user={user}
            compact
            links={isAdmin ? [{ label: 'Admin', onClick: () => navigate('/admin') }] : []}
            onLogout={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          />
        </div>

        <Outlet />
      </div>
    </main>
  );
}

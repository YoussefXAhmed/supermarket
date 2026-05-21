import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useInventoryCapabilities } from '../../hooks/useInventoryCapabilities';
import UserSessionActions from './UserSessionActions';
import ErrorBoundary from '../common/ErrorBoundary';
import { RoleBadge } from '../ui';

const NAV = [
  { to: '/inventory', labelKey: 'nav.overview', end: true },
  { to: '/inventory/warehouses', labelKey: 'nav.warehouses' },
  { to: '/inventory/stock-entry', labelKey: 'nav.stockEntry' },
  { to: '/inventory/transfer', labelKey: 'nav.transfer', cap: 'canInventoryIssueTransfer' },
  { to: '/inventory/reconciliation', labelKey: 'nav.reconcile', cap: 'canInventoryReconcile' },
  { to: '/inventory/ledger', labelKey: 'nav.ledger' },
  { to: '/inventory/items', labelKey: 'nav.items' },
  { to: '/inventory/alerts', labelKey: 'nav.alerts' },
  { to: '/inventory/reorder', labelKey: 'nav.reorder' },
  { to: '/inventory/batches', labelKey: 'nav.batches' },
  { to: '/inventory/analytics', labelKey: 'nav.analytics', cap: 'canInventoryAnalytics' },
  { to: '/inventory/reports', labelKey: 'nav.reports' },
];

export default function InventoryLayout() {
  const { t } = useTranslation();
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
                {t(item.labelKey)}
              </NavLink>
            ))}
          </nav>
          <UserSessionActions
            user={user}
            compact
            links={[
              ...(canAccessAdminWorkspace ? [{ label: t('common.admin'), onClick: () => navigate('/admin') }] : []),
              ...(canViewPOS ? [{ label: t('common.pos'), onClick: () => navigate('/pos') }] : []),
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

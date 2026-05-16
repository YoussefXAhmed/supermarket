import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UserSessionActions from './UserSessionActions';

const LINKS = [
  { to: 'open', label: 'Open shift', cap: 'canOpenShift' },
  { to: 'close', label: 'Close shift', cap: 'canCloseShift' },
  { to: 'history', label: 'History', cap: 'canViewShiftReports' },
  { to: '/pos', label: 'POS', cap: 'canViewPOS' },
];

export default function ShiftsLayout() {
  const { user, logout, capabilities, canAccessAdminWorkspace } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inAdminShell = location.pathname.startsWith('/admin/');

  const sessionLinks =
    canAccessAdminWorkspace && !inAdminShell
      ? [{ label: 'Admin', onClick: () => navigate('/admin') }]
      : [];

  const links = LINKS.filter((l) => hasCapability(capabilities, l.cap));

  return (
    <div className="shifts-layout">
      <header className="shifts-layout__head">
        <div>
          <h1 className="shifts-layout__title">Shift control</h1>
          <p className="page-header__sub">Cash reconciliation · ERPNext POS Opening/Closing</p>
        </div>
        <UserSessionActions user={user} onLogout={logout} links={sessionLinks} />
      </header>
      <nav className="shifts-layout__nav">
        {canAccessAdminWorkspace && !inAdminShell && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `shifts-layout__link shifts-layout__link--admin ${isActive ? 'shifts-layout__link--active' : ''}`
            }
          >
            Admin
          </NavLink>
        )}
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === 'history'}
            className={({ isActive }) =>
              `shifts-layout__link ${isActive ? 'shifts-layout__link--active' : ''}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="shifts-layout__main">
        <Outlet />
      </main>
    </div>
  );
}

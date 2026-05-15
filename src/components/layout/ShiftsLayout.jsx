import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UserSessionActions from './UserSessionActions';

const LINKS = [
  { to: '/shifts/open', label: 'Open shift', cap: 'canOpenShift' },
  { to: '/shifts/close', label: 'Close shift', cap: 'canCloseShift' },
  { to: '/shifts/history', label: 'History', cap: 'canViewShiftReports' },
  { to: '/pos', label: 'POS', cap: 'canViewPOS' },
];

export default function ShiftsLayout() {
  const { user, logout, capabilities, homePath } = useAuth();

  const links = LINKS.filter((l) => hasCapability(capabilities, l.cap));

  return (
    <div className="shifts-layout">
      <header className="shifts-layout__head">
        <div>
          <h1 className="shifts-layout__title">Shift control</h1>
          <p className="page-header__sub">Cash reconciliation · ERPNext POS Opening/Closing</p>
        </div>
        <UserSessionActions user={user} onLogout={logout} homePath={homePath} />
      </header>
      <nav className="shifts-layout__nav">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
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

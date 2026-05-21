import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UserSessionActions from './UserSessionActions';

const LINKS = [
  { to: 'open', labelKey: 'shifts.openShift', cap: 'canOpenShift' },
  { to: 'close', labelKey: 'shifts.closeShift', cap: 'canCloseShift' },
  { to: 'history', labelKey: 'nav.history', cap: 'canViewShiftReports' },
  { to: '/pos', labelKey: 'common.pos', cap: 'canViewPOS' },
];

export default function ShiftsLayout() {
  const { t } = useTranslation();
  const { user, logout, capabilities, canAccessAdminWorkspace } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inAdminShell = location.pathname.startsWith('/admin/');

  const sessionLinks =
    canAccessAdminWorkspace && !inAdminShell
      ? [{ label: t('common.admin'), onClick: () => navigate('/admin') }]
      : [];

  const links = LINKS.filter((l) => hasCapability(capabilities, l.cap));

  return (
    <div className="shifts-layout">
      <header className="shifts-layout__head">
        <div>
          <h1 className="shifts-layout__title">{t('shifts.shiftControl')}</h1>
          <p className="page-header__sub">{t('shifts.subtitle')}</p>
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
            {t('common.admin')}
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
            {t(l.labelKey)}
          </NavLink>
        ))}
      </nav>
      <main className="shifts-layout__main">
        <Outlet />
      </main>
    </div>
  );
}

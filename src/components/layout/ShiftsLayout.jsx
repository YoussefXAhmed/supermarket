import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { getShiftsNavItems, getShiftsSessionLinks } from '../../auth/navigationConfig';
import UserSessionActions from './UserSessionActions';

export default function ShiftsLayout() {
  const { t } = useTranslation();
  const { user, capabilities } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inAdminShell = location.pathname.startsWith('/admin/');
  const { requestLogout, guardModal } = useGuardedLogout();

  const sessionLinks = useMemo(
    () => getShiftsSessionLinks(capabilities, inAdminShell).map((link) => ({
      label: t(link.labelKey),
      onClick: () => navigate(link.to),
    })),
    [capabilities, inAdminShell, navigate, t],
  );

  const links = useMemo(() => getShiftsNavItems(capabilities), [capabilities]);

  return (
    <div className="shifts-layout">
      <header className="shifts-layout__head">
        <div>
          <h1 className="shifts-layout__title">{t('shifts.shiftControl')}</h1>
          <p className="page-header__sub">{t('shifts.subtitle')}</p>
        </div>
        <UserSessionActions user={user} onLogout={requestLogout} links={sessionLinks} />
      </header>
      <nav className="shifts-layout__nav">
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
      {guardModal}
    </div>
  );
}

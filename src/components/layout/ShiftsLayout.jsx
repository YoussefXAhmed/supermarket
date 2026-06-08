import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { getShiftsNavItems, getSessionLinksForWorkspace } from '../../auth/navigationConfig';
import { UserMenu } from '../ui';
import NotificationBell from '../notifications/NotificationBell';
import LanguageSwitcher from '../common/LanguageSwitcher';

export default function ShiftsLayout() {
  const { t } = useTranslation();
  const { user, capabilities } = useAuth();
  const location = useLocation();
  const inAdminShell = location.pathname.startsWith('/admin/');
  const { requestLogout, guardModal } = useGuardedLogout();

  // Phase 3.5.b — session menu sourced from the canonical registry, with
  // `inAdminShell` passed through so the existing shifts-in-admin-shell
  // suppression behaviour is preserved. Phase 3.5.c — items shape for UserMenu.
  const userMenuItems = useMemo(
    () => getSessionLinksForWorkspace(capabilities, 'shifts', { inAdminShell }).map((link) => ({
      key: link.to,
      label: t(link.labelKey),
      to: link.to,
    })),
    [capabilities, inAdminShell, t],
  );

  const links = useMemo(() => getShiftsNavItems(capabilities), [capabilities]);

  return (
    <div className="shifts-layout">
      <header className="shifts-layout__head">
        <div>
          <h1 className="shifts-layout__title">{t('shifts.shiftControl')}</h1>
          <p className="page-header__sub">{t('shifts.subtitle')}</p>
        </div>
        <div className="session-actions">
          <NotificationBell />
          <LanguageSwitcher />
          <UserMenu user={user} items={userMenuItems} onSignOut={requestLogout} />
        </div>
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

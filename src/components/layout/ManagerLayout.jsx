import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getManagerNavItems } from '../../auth/navigationConfig';
import SidebarShellLayout from './SidebarShellLayout';

export default function ManagerLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const navItems = useMemo(() => getManagerNavItems(capabilities), [capabilities]);

  return (
    <SidebarShellLayout
      brandLabel={t('nav.manager')}
      navItems={navItems}
      workspace="manager"
    />
  );
}

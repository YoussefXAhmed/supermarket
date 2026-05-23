import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getFinanceNavItems } from '../../auth/navigationConfig';
import SidebarShellLayout from './SidebarShellLayout';

export default function FinanceLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const navItems = useMemo(() => getFinanceNavItems(capabilities), [capabilities]);

  return (
    <SidebarShellLayout
      className="finance-layout"
      brandLabel={t('nav.finance')}
      navItems={navItems}
    />
  );
}

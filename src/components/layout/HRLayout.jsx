/**
 * HR workspace shell — thin composition of SidebarShellLayout.
 *
 * Phase 3.5.b consolidation: replaces the previous 80-LOC bespoke
 * sidebar implementation. HR users now see the canonical session menu
 * (Personal Settings + Payslip if eligible) that was previously absent
 * from this workspace — closes audit findings 11.1 + 11.3 + 11.4.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getHRNavItems } from '../../auth/navigationConfig';
import SidebarShellLayout from './SidebarShellLayout';

export default function HRLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const navItems = useMemo(() => getHRNavItems(capabilities), [capabilities]);

  return (
    <SidebarShellLayout
      brandLabel={t('nav.hr')}
      navItems={navItems}
      workspace="hr"
    />
  );
}

/**
 * Inventory workspace shell — thin composition of SidebarShellLayout.
 *
 * Phase 3.5.b consolidation: previously rendered an inline horizontal
 * header nav with NO sidebar (audit finding 11.2 — jarring context
 * switch for users navigating from other workspaces). Now matches every
 * other workspace shell: left-aligned collapsible sidebar with workspace
 * accent via [data-workspace="inventory"], canonical session menu, and
 * RoleBadge in the sidebar footer.
 *
 * Page-level dense-module spacing is no longer applied at the shell
 * level — inventory pages already use the canonical PageLayout (which
 * owns horizontal padding) so removing the extra layer matches the
 * Phase 3.5.a double-padding fix.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getInventoryNavItems } from '../../auth/navigationConfig';
import SidebarShellLayout from './SidebarShellLayout';

export default function InventoryLayout() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const navItems = useMemo(() => getInventoryNavItems(capabilities), [capabilities]);

  return (
    <SidebarShellLayout
      brandLabel={t('nav.inventory')}
      navItems={navItems}
      workspace="inventory"
    />
  );
}

/**
 * Admin workspace shell — thin composition of SidebarShellLayout.
 *
 * Phase 3.5.b consolidation: the previous 95-LOC bespoke sidebar
 * implementation duplicated the same collapse / mobile-drawer / footer
 * logic that SidebarShellLayout already provides. AdminLayout now
 * follows the same pattern as FinanceLayout / ManagerLayout /
 * PurchasingShellLayout — closes audit finding 11.1.
 *
 * Session-menu links (Personal Settings, Payslip, System Settings) are
 * sourced from the canonical `getSessionLinksForWorkspace` registry
 * inside SidebarShellLayout, so Admin users now see the same uniform
 * menu Finance users already do (closes audit findings 11.3 + 11.4).
 */
import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getAdminNavItems } from '../../auth/navigationConfig';
import SidebarShellLayout from './SidebarShellLayout';

export default function AdminLayout() {
  const { capabilities } = useAuth();
  const navItems = useMemo(() => getAdminNavItems(capabilities), [capabilities]);

  return (
    <SidebarShellLayout
      brandLabel="Elmahdi"
      navItems={navItems}
      workspace="admin"
    />
  );
}

/**
 * /finance/settings — Finance workspace settings (aging rules + AP
 * overdue scan + Accounts Settings subset).
 *
 * Eligible roles: Accountant + Administrator (`canManageFinanceSettings`).
 */
import WorkspaceSettingsPage from '../admin/settings/components/WorkspaceSettingsPage';

export default function FinanceSettingsPage() {
  return (
    <WorkspaceSettingsPage
      workspace="finance"
      titleKey="settings.finance.workspaceTitle"
      descriptionKey="settings.finance.workspaceDesc"
    />
  );
}

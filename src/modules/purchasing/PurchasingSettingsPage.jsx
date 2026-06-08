/**
 * /purchasing/settings — Purchasing workspace settings (approval
 * thresholds + Buying Settings subset).
 *
 * Eligible roles: Store Manager + Administrator (`canManagePurchasingSettings`).
 */
import WorkspaceSettingsPage from '../admin/settings/components/WorkspaceSettingsPage';

export default function PurchasingSettingsPage() {
  return (
    <WorkspaceSettingsPage
      workspace="purchasing"
      titleKey="settings.purchasing.workspaceTitle"
      descriptionKey="settings.purchasing.workspaceDesc"
    />
  );
}

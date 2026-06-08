/**
 * /inventory/settings — Inventory workspace settings (transfer limits +
 * reorder defaults).
 *
 * Eligible roles: Store Manager + Administrator (`canManageInventorySettings`).
 */
import WorkspaceSettingsPage from '../admin/settings/components/WorkspaceSettingsPage';

export default function InventorySettingsPage() {
  return (
    <WorkspaceSettingsPage
      workspace="inventory"
      titleKey="settings.inventory.workspaceTitle"
      descriptionKey="settings.inventory.workspaceDesc"
    />
  );
}

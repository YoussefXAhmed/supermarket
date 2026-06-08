/**
 * /pos/settings — POS workspace settings (Auto Print, Receipt format,
 * Cash limits).
 *
 * Eligible roles: Store Manager + Administrator (`canManagePosProfiles`
 * gate on the route).
 */
import { useTranslation } from 'react-i18next';
import AccessibleLink from '../../components/auth/AccessibleLink';
import { LayoutSection } from '../../components/layout/page-layouts';
import WorkspaceSettingsPage from '../admin/settings/components/WorkspaceSettingsPage';

export default function PosSettingsPage() {
  const { t } = useTranslation();
  return (
    <WorkspaceSettingsPage
      workspace="pos"
      titleKey="settings.pos.title"
      descriptionKey="settings.pos.desc"
      renderExtras={() => (
        <LayoutSection variant="flat" title={t('settings.pos.profilesTitle', { defaultValue: 'POS Profiles' })} style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', color: 'var(--text-2)', fontSize: '0.86rem' }}>
            {t('settings.pos.profilesDesc', {
              defaultValue: 'Per-cashier and per-branch overrides (auto-print, receipt format, MOPs) live on the POS Profile catalog.',
            })}
          </p>
          <AccessibleLink to="/admin/pos-profiles" className="btn btn--ghost btn--sm">
            {t('settings.pos.openCatalog', { defaultValue: 'Open POS Profile catalog ↗' })}
          </AccessibleLink>
        </LayoutSection>
      )}
    />
  );
}

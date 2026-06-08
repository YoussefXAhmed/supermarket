/**
 * /admin/settings — Global System Settings index + per-section router.
 *
 * Implemented as a single React component using `useParams` so we don't
 * need 12 separate nested routes. Section selection persists in the URL.
 *
 * Phase 3 migration: rendered on top of `<SettingsShell>` (shared rail
 * primitive) instead of the workspace-private SettingsLayout — closes
 * audit finding 2.1 (duplicated two-pane grid).
 */
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../../../components/ui';
import { LayoutSection } from '../../../components/layout/page-layouts';
import SettingsShell from '../../../components/layout/SettingsShell';
import { SECTION_ORDER } from '../../../services/systemSettingsApi';

import CompanySettings from './sections/CompanySettings';
import BranchesSettings from './sections/BranchesSettings';
import UsersRolesSettings from './sections/UsersRolesSettings';
import ProductsSettings from './sections/ProductsSettings';
import PricingSettings from './sections/PricingSettings';
import InventorySettings from './sections/InventorySettings';
import FinanceSettings from './sections/FinanceSettings';
import NotificationsSettings from './sections/NotificationsSettings';
import PrintingSettings from './sections/PrintingSettings';
import SecuritySettings from './sections/SecuritySettings';
import BackupSettings from './sections/BackupSettings';
import FeatureFlagsSettings from './sections/FeatureFlagsSettings';

const SECTION_COMPONENTS = {
  'company':         CompanySettings,
  'branches':        BranchesSettings,
  'users-roles':     UsersRolesSettings,
  'products':        ProductsSettings,
  'pricing':         PricingSettings,
  'inventory':       InventorySettings,
  'finance':         FinanceSettings,
  'notifications':   NotificationsSettings,
  'printing':        PrintingSettings,
  'security':        SecuritySettings,
  'backup':          BackupSettings,
  'feature-flags':   FeatureFlagsSettings,
};

const SECTION_ICONS = {
  company:         '🏢',
  branches:        '🏪',
  'users-roles':   '👥',
  products:        '📦',
  pricing:         '💲',
  inventory:       '📊',
  finance:         '💰',
  notifications:   '🔔',
  printing:        '🖨',
  security:        '🔐',
  backup:          '💾',
  'feature-flags': '🎚',
};

export default function SystemSettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams();
  const Active = section ? SECTION_COMPONENTS[section] : null;

  // Build rail items from the canonical order. Each item routes to the
  // section URL so SettingsShell uses <NavLink> internally — browser
  // history + middle-click + URL preview all work as expected.
  const railItems = SECTION_ORDER.map((key) => ({
    key,
    label: t(`settings.section.${key}`, { defaultValue: key }),
    icon: SECTION_ICONS[key],
    to: `/admin/settings/${key}`,
    end: false,
  }));

  const breadcrumbs = section ? [
    { label: t('nav.admin', { defaultValue: 'Admin' }), to: '/admin' },
    { label: t('nav.settings', { defaultValue: 'Settings' }), to: '/admin/settings' },
    { label: t(`settings.section.${section}`, { defaultValue: section }) },
  ] : [
    { label: t('nav.admin', { defaultValue: 'Admin' }), to: '/admin' },
    { label: t('nav.settings', { defaultValue: 'Settings' }) },
  ];

  return (
    <SettingsShell
      railItems={railItems}
      activeKey={section}
      header={(
        <PageHeader
          title={t('settings.title', { defaultValue: 'System Settings' })}
          subtitle={t('settings.subtitle', {
            defaultValue: 'Administrator-only — every change is audited',
          })}
          dense
          breadcrumbs={breadcrumbs}
        />
      )}
      ariaLabel={t('settings.title', { defaultValue: 'System Settings' })}
    >
      {Active ? <Active /> : (
        <LayoutSection variant="raised">
          <EmptyState
            icon="⚙️"
            title={t('settings.pickSection', { defaultValue: 'Pick a section' })}
            desc={t('settings.pickSectionDesc', {
              defaultValue: 'Select a settings section from the left rail.',
            })}
          />
        </LayoutSection>
      )}
    </SettingsShell>
  );
}

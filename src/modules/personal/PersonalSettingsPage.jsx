/**
 * /me — Personal Settings index + section router.
 *
 * No admin gate. Every authenticated user has full access.
 *
 * Phase 3 migration: rendered on top of `<SettingsShell>` (shared rail
 * primitive). Inline 220px grid + button-style rail are gone — closes
 * audit finding 2.1 and removes 6 inline-style violations from this file.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { LayoutSection } from '../../components/layout/page-layouts';
import SettingsShell from '../../components/layout/SettingsShell';

import ProfileSection from './sections/ProfileSection';
import LanguageSection from './sections/LanguageSection';
import NotificationsSection from './sections/NotificationsSection';
import PrintingSection from './sections/PrintingSection';
import SecuritySection from './sections/SecuritySection';

const SECTION_COMPONENTS = {
  profile:       ProfileSection,
  language:      LanguageSection,
  notifications: NotificationsSection,
  printing:      PrintingSection,
  security:      SecuritySection,
};

const SECTION_ORDER = ['profile', 'language', 'notifications', 'printing', 'security'];

const SECTION_ICONS = {
  profile:       '👤',
  language:      '🌐',
  notifications: '🔔',
  printing:      '🖨',
  security:      '🔐',
};

export default function PersonalSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { section } = useParams();
  const current = section || location.pathname.replace(/^\/me\/?/, '') || '';
  const Active = current ? SECTION_COMPONENTS[current] : null;

  // Bare /me lands on Profile so users always see a useful section
  // immediately instead of an empty-state card.
  useEffect(() => {
    if (!current) navigate('/me/profile', { replace: true });
  }, [current, navigate]);

  const railItems = SECTION_ORDER.map((key) => ({
    key,
    label: t(`personal.section.${key}`, { defaultValue: key }),
    icon: SECTION_ICONS[key],
    to: `/me/${key}`,
    end: false,
  }));

  return (
    <SettingsShell
      railItems={railItems}
      activeKey={current}
      header={(
        <PageHeader
          title={t('personal.title', { defaultValue: 'Personal settings' })}
          subtitle={t('personal.subtitle', {
            defaultValue: 'Your account, your preferences. Affects only you.',
          })}
          dense
        />
      )}
      ariaLabel={t('personal.title', { defaultValue: 'Personal settings' })}
    >
      {Active ? <Active /> : (
        <LayoutSection variant="raised">
          {/* Bare /me redirects to /me/profile in the effect above — this
              fallback only shows for a single render frame. */}
          <p className="settings-shell__loading">…</p>
        </LayoutSection>
      )}
    </SettingsShell>
  );
}

/**
 * <SettingsShell> — single shared two-pane layout for the settings
 * surfaces (System Settings / Personal Settings / Workspace Settings).
 *
 * Replaces the duplicated inline grid in:
 *   src/modules/admin/settings/components/SettingsLayout.jsx
 *   src/modules/personal/PersonalSettingsPage.jsx
 *
 * API:
 *   <SettingsShell
 *     railItems={[{ key, label, icon, to }]}
 *     activeKey={current}
 *     onSelect={(key) => navigate(...)}   // optional, default: <Link to>
 *     header={<PageHeader title="..." />} // optional
 *   >
 *     {sectionContent}
 *   </SettingsShell>
 *
 * If `to` is provided per rail item, the rail renders <NavLink>s and
 * router handles activation. Otherwise the caller controls via
 * `activeKey` + `onSelect`.
 *
 * Visual rail: 220px wide on desktop; collapses below --bp-sm
 * (handled by CSS, no JS needed).
 */
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminPageLayout, LayoutSection } from './page-layouts';

export default function SettingsShell({
  header,
  railItems = [],
  activeKey,
  onSelect,
  ariaLabel,
  children,
  className = '',
}) {
  const { t } = useTranslation();
  return (
    <AdminPageLayout className={className}>
      {header}
      <div className="settings-shell">
        <LayoutSection variant="raised" flushHead className="settings-shell__rail">
          <nav
            aria-label={ariaLabel || t('ui.settingsShell.nav', { defaultValue: 'Settings sections' })}
            className="settings-rail"
          >
            <ul className="settings-rail__list">
              {railItems.map((item) => {
                const isActive = item.key === activeKey;
                const linkCls = `settings-rail__link ${isActive ? 'is-active' : ''}`.trim();
                // Prefer router NavLink when `to` is given — opens via
                // middle-click + preserves the URL preview on hover.
                if (item.to) {
                  return (
                    <li key={item.key} className="settings-rail__li">
                      <NavLink
                        to={item.to}
                        className={({ isActive: routerActive }) =>
                          `settings-rail__link ${routerActive ? 'is-active' : ''}`.trim()
                        }
                        end={item.end}
                      >
                        {item.icon && (
                          <span className="settings-rail__icon" aria-hidden="true">{item.icon}</span>
                        )}
                        <span className="settings-rail__label">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                }
                // Fallback to button when caller controls navigation manually.
                return (
                  <li key={item.key} className="settings-rail__li">
                    <button
                      type="button"
                      onClick={() => onSelect?.(item.key)}
                      className={linkCls}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.icon && (
                        <span className="settings-rail__icon" aria-hidden="true">{item.icon}</span>
                      )}
                      <span className="settings-rail__label">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </LayoutSection>

        <div className="settings-shell__pane">{children}</div>
      </div>
    </AdminPageLayout>
  );
}

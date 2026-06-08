/**
 * Feature Flags — 7 toggles, each persisted atomically via
 * set_feature_flag (one audit row per change).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLoading } from '../../../../components/ui';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { useNotify } from '../../../../context/NotificationContext';
import {
  getFeatureFlags, setFeatureFlag,
} from '../../../../services/systemSettingsApi';
import { getUserFriendlyMessage } from '../../../../utils/errorHandling';
import SettingsAuditLog from '../components/SettingsAuditLog';

const FLAGS = [
  { key: 'enable_pos',        labelKey: 'settings.featureFlags.pos',        defaultLabel: 'POS',        icon: '🛒' },
  { key: 'enable_inventory',  labelKey: 'settings.featureFlags.inventory',  defaultLabel: 'Inventory',  icon: '📦' },
  { key: 'enable_purchasing', labelKey: 'settings.featureFlags.purchasing', defaultLabel: 'Purchasing', icon: '🛍' },
  { key: 'enable_finance',    labelKey: 'settings.featureFlags.finance',    defaultLabel: 'Finance',    icon: '💰' },
  { key: 'enable_hr',         labelKey: 'settings.featureFlags.hr',         defaultLabel: 'HR',         icon: '👥' },
  { key: 'enable_crm',        labelKey: 'settings.featureFlags.crm',        defaultLabel: 'CRM',        icon: '🤝' },
  { key: 'enable_delivery',   labelKey: 'settings.featureFlags.delivery',   defaultLabel: 'Delivery',   icon: '🚚' },
];

export default function FeatureFlagsSettings() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFlags(await getFeatureFlags());
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key, next) => {
    setBusyKey(key);
    try {
      await setFeatureFlag(key, next);
      setFlags((prev) => ({ ...prev, [key]: next ? 1 : 0 }));
      notify.success(t('settings.featureFlags.toggled', {
        defaultValue: '{{flag}} {{state}}',
        flag: key,
        state: next ? t('settings.featureFlags.on', { defaultValue: 'enabled' })
                    : t('settings.featureFlags.off', { defaultValue: 'disabled' }),
      }));
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <LayoutSection variant="raised"
        title={t('settings.featureFlags.title', { defaultValue: 'Feature flags' })}>
        <p className="personal-section__intro">
          {t('settings.featureFlags.desc', {
            defaultValue: 'Toggle entire modules on or off. Disabled modules are hidden from navigation and their routes return 404 for non-Admin users.',
          })}
        </p>
        {loading ? (
          <PageLoading size={20} />
        ) : (
          <div className="feature-flag-grid">
            {FLAGS.map((f) => {
              const enabled = String(flags[f.key] || 0) === '1';
              return (
                <div key={f.key} className="feature-flag-card">
                  <span className="feature-flag-card__icon" aria-hidden>{f.icon}</span>
                  <div className="feature-flag-card__body">
                    <p className="feature-flag-card__name">{t(f.labelKey, { defaultValue: f.defaultLabel })}</p>
                    <p className="feature-flag-card__state">
                      {enabled
                        ? t('settings.featureFlags.on', { defaultValue: 'Enabled' })
                        : t('settings.featureFlags.off', { defaultValue: 'Disabled' })}
                    </p>
                  </div>
                  <label className={`switch feature-flag-card__toggle ${busyKey === f.key ? 'is-busy' : ''}`}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={busyKey !== null}
                      onChange={(e) => toggle(f.key, e.target.checked)}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
        <p className="feature-flag-future-note">
          {t('settings.featureFlags.future', {
            defaultValue: 'Future modules can be added to the Elmahdi Settings doctype without code changes elsewhere.',
          })}
        </p>
      </LayoutSection>

      <SettingsAuditLog section="feature-flags" />
    </>
  );
}

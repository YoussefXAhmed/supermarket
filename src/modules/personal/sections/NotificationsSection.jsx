import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLoading } from '../../../components/ui';
import { LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import { getNotifications, updateNotifications } from '../../../services/personalSettingsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

function Switch({ checked, onChange, label, help }) {
  return (
    <label className="settings-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="settings-switch__body">
        <div className="settings-switch__label">{label}</div>
        {help && <div className="settings-switch__help">{help}</div>}
      </div>
    </label>
  );
}

export default function NotificationsSection() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [values, setValues] = useState({
    enabled: 1,
    enable_email_notifications: 1,
    elmahdi_notification_sound: 1,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getNotifications();
      setValues({
        enabled: Number(d.enabled || 0),
        enable_email_notifications: Number(d.enable_email_notifications || 0),
        elmahdi_notification_sound: Number(d.elmahdi_notification_sound || 0),
      });
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    setValues(next);
    try {
      await updateNotifications(next);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    }
  };

  if (loading) return <LayoutSection variant="raised" title={t('personal.notifications.title', { defaultValue: 'Notifications' })}><PageLoading size={22} /></LayoutSection>;

  return (
    <LayoutSection variant="raised" title={t('personal.notifications.title', { defaultValue: 'Notifications' })}>
      <p className="personal-section__intro">
        {t('personal.notifications.desc', { defaultValue: 'Controls only what you see and hear. Other users keep their own settings.' })}
      </p>

      <Switch
        checked={values.enabled === 1}
        onChange={(v) => persist({ ...values, enabled: v ? 1 : 0 })}
        label={t('personal.notifications.desktop', { defaultValue: 'Desktop notifications' })}
        help={t('personal.notifications.desktopHelp', { defaultValue: 'Show in-app notifications when documents need your attention.' })}
      />
      <Switch
        checked={values.enable_email_notifications === 1}
        onChange={(v) => persist({ ...values, enable_email_notifications: v ? 1 : 0 })}
        label={t('personal.notifications.email', { defaultValue: 'Email notifications' })}
        help={t('personal.notifications.emailHelp', { defaultValue: 'Also email me when an in-app notification fires.' })}
      />
      <Switch
        checked={values.elmahdi_notification_sound === 1}
        onChange={(v) => persist({ ...values, elmahdi_notification_sound: v ? 1 : 0 })}
        label={t('personal.notifications.sound', { defaultValue: 'Notification sound' })}
        help={t('personal.notifications.soundHelp', { defaultValue: 'Play a short sound when a notification arrives.' })}
      />
    </LayoutSection>
  );
}

/**
 * Backup — configure auto-backup + run an on-demand backup.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Btn, FormField, Input, PageLoading } from '../../../../components/ui';
import FormGrid from '../../../../components/ui/FormGrid';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { useNotify } from '../../../../context/NotificationContext';
import {
  getBackupStatus, triggerBackupNow,
  getSection, updateSection,
} from '../../../../services/systemSettingsApi';
import { fmtDateTime } from '../../../../utils/format';
import { getUserFriendlyMessage } from '../../../../utils/errorHandling';
import SectionForm from '../components/SectionForm';
import SettingsAuditLog from '../components/SettingsAuditLog';

export default function BackupSettings() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getBackupStatus());
    } catch (e) {
      setStatus(null);
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await triggerBackupNow();
      const ok = String(res?.status || '').startsWith('OK');
      if (ok) notify.success(t('settings.backup.ranOK', { defaultValue: 'Backup completed.' }));
      else notify.warning(t('settings.backup.ranFail', { defaultValue: 'Backup failed: {{status}}', status: res?.status }));
      await loadStatus();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <LayoutSection variant="raised" title={t('settings.backup.statusTitle', { defaultValue: 'Backup status' })}>
        {loading ? (
          <PageLoading size={20} />
        ) : !status ? (
          <p className="muted-3">—</p>
        ) : (
          <div className="backup-status-row">
            <div>
              <p className="backup-status-row__label">
                {t('settings.backup.lastStatus', { defaultValue: 'Last status' })}
              </p>
              {status.last_backup_status ? (
                <Badge color={String(status.last_backup_status).startsWith('OK') ? 'green' : 'red'}>
                  {status.last_backup_status}
                </Badge>
              ) : <span className="muted-3">—</span>}
            </div>
            <div>
              <p className="backup-status-row__label">
                {t('settings.backup.lastAt', { defaultValue: 'Last backup at' })}
              </p>
              {status.last_backup_at ? fmtDateTime(status.last_backup_at)
                : <span className="muted-3">—</span>}
            </div>
            <Btn variant="primary" size="md" onClick={runNow} loading={running} disabled={running}>
              {t('settings.backup.runNow', { defaultValue: 'Run backup now' })}
            </Btn>
          </div>
        )}
      </LayoutSection>

      <div className="personal-section--spaced">
        <SectionForm
          section="backup"
          title={t('settings.backup.configTitle', { defaultValue: 'Backup configuration' })}
          description={t('settings.backup.configDesc', {
            defaultValue: 'Auto-backup runs via the Frappe scheduler at the chosen frequency. Older backups beyond the retention window are removed.',
          })}
          loader={() => getSection('backup')}
          onSave={(payload) => updateSection('backup', payload)}
        >
          {({ values, setField, data }) => {
            const block = (data?.blocks || [])[0];
            if (!block) return null;
            const get = (f) => values[`${block.doctype}::${f}`];
            const set = (f, v) => setField(block.doctype, f, v);
            return (
              <FormGrid cols="auto-dense">
                <label className="form-field form-field--checkbox">
                  <input type="checkbox" checked={String(get('backup_enabled')) === '1'}
                    onChange={(e) => set('backup_enabled', e.target.checked ? 1 : 0)} />
                  <span>{t('settings.backup.enabled', { defaultValue: 'Auto backup enabled' })}</span>
                </label>
                <FormField label={t('settings.backup.frequency', { defaultValue: 'Frequency' })}>
                  {({ id }) => (
                    <select id={id} className="input" value={get('backup_frequency') || 'Daily'}
                      onChange={(e) => set('backup_frequency', e.target.value)}>
                      <option value="Daily">{t('settings.backup.daily', { defaultValue: 'Daily' })}</option>
                      <option value="Weekly">{t('settings.backup.weekly', { defaultValue: 'Weekly' })}</option>
                      <option value="Monthly">{t('settings.backup.monthly', { defaultValue: 'Monthly' })}</option>
                    </select>
                  )}
                </FormField>
                <FormField label={t('settings.backup.retention', { defaultValue: 'Retention (days)' })}>
                  {({ id }) => (
                    <Input id={id} type="number" min={1} max={365}
                      value={get('backup_retention_days') ?? 30}
                      onChange={(e) => set('backup_retention_days', Number(e.target.value))} />
                  )}
                </FormField>
              </FormGrid>
            );
          }}
        </SectionForm>
      </div>

      <SettingsAuditLog section="backup" />
    </>
  );
}

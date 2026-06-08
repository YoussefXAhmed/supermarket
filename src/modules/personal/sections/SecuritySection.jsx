/**
 * Security — change password, list active sessions, view recent logins.
 *
 * Server-side: password update goes through Frappe's `update_password`
 * which honors System Settings / Security Settings policies. Sessions
 * revoke removes a row from `tabSessions` (cannot revoke the current
 * session — user must sign out).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge, Btn, ConfirmDialog, EmptyState, FormField, Input, PageLoading, Table,
} from '../../../components/ui';
import FormGrid from '../../../components/ui/FormGrid';
import FormActions from '../../../components/ui/FormActions';
import { LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import {
  changePassword, listSessions, revokeSession, loginHistory,
} from '../../../services/personalSettingsApi';
import { fmtDateTime } from '../../../utils/format';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function SecuritySection() {
  const { t } = useTranslation();
  const notify = useNotify();

  // ─ change password
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', confirm: '' });
  const [pwdBusy, setPwdBusy] = useState(false);

  const submitPwd = async () => {
    if (!pwd.old_password || !pwd.new_password) {
      notify.warning(t('personal.security.pwdRequired', { defaultValue: 'Both passwords are required.' }));
      return;
    }
    if (pwd.new_password !== pwd.confirm) {
      notify.warning(t('personal.security.pwdMismatch', { defaultValue: 'New password does not match the confirmation.' }));
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword({ oldPassword: pwd.old_password, newPassword: pwd.new_password });
      notify.success(t('personal.security.pwdChanged', { defaultValue: 'Password updated.' }));
      setPwd({ old_password: '', new_password: '', confirm: '' });
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setPwdBusy(false);
    }
  };

  // ─ sessions
  const [sessions, setSessions] = useState([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      setSessions(await listSessions());
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setSessLoading(false);
    }
  }, [notify]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const submitRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await revokeSession(revokeTarget.sid);
      notify.success(t('personal.security.sessRevoked', { defaultValue: 'Session revoked.' }));
      setRevokeTarget(null);
      await loadSessions();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setRevokeBusy(false);
    }
  };

  // ─ login history
  const [logins, setLogins] = useState([]);
  const [hLoading, setHLoading] = useState(true);

  const loadLogins = useCallback(async () => {
    setHLoading(true);
    try {
      setLogins(await loginHistory({ limit: 50 }));
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setHLoading(false);
    }
  }, [notify]);
  useEffect(() => { loadLogins(); }, [loadLogins]);

  return (
    <>
      <LayoutSection variant="raised" title={t('personal.security.pwdTitle', { defaultValue: 'Change password' })}>
        <FormGrid cols="auto-dense">
          <FormField label={t('personal.security.pwdOld', { defaultValue: 'Current password' })}>
            {({ id }) => (
              <Input id={id} type="password" value={pwd.old_password}
                onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })}
                autoComplete="current-password" />
            )}
          </FormField>
          <FormField label={t('personal.security.pwdNew', { defaultValue: 'New password' })}>
            {({ id }) => (
              <Input id={id} type="password" value={pwd.new_password}
                onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
                autoComplete="new-password" />
            )}
          </FormField>
          <FormField label={t('personal.security.pwdConfirm', { defaultValue: 'Confirm new password' })}>
            {({ id }) => (
              <Input id={id} type="password" value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                autoComplete="new-password" />
            )}
          </FormField>
        </FormGrid>
        <FormActions align="end">
          <Btn variant="primary" size="md" onClick={submitPwd}
            disabled={pwdBusy || !pwd.old_password || !pwd.new_password}
            loading={pwdBusy}>
            {t('personal.security.pwdSave', { defaultValue: 'Update password' })}
          </Btn>
        </FormActions>
      </LayoutSection>

      <LayoutSection variant="raised"
        title={t('personal.security.sessTitle', { defaultValue: 'Active sessions' })}
        className="personal-section--spaced">
        {sessLoading ? <PageLoading size={20} />
          : sessions.length === 0 ? (
            <EmptyState icon="🔐" title={t('personal.security.sessEmpty', { defaultValue: 'No active sessions' })} />
          ) : (
            <Table
              data={sessions}
              columns={[
                { key: 'sid', label: t('personal.security.colSid', { defaultValue: 'Session' }),
                  render: (v, r) => (
                    <span className="session-id-cell">
                      <span className="mono session-id-cell__sid">{(v || '').slice(0, 12)}…</span>
                      {r.is_current && <Badge color="green">{t('personal.security.current', { defaultValue: 'Current' })}</Badge>}
                    </span>
                  ),
                },
                { key: 'device', label: t('personal.security.colDevice', { defaultValue: 'Device' }) },
                { key: 'lastupdate', label: t('personal.security.colSeen', { defaultValue: 'Last activity' }),
                  render: (v) => fmtDateTime(v) },
                { key: 'actions', label: t('ui.table.actions', { defaultValue: 'Actions' }),
                  render: (_v, r) => r.is_current ? '—' : (
                    <Btn variant="ghost" size="sm" onClick={() => setRevokeTarget(r)}>
                      {t('personal.security.revoke', { defaultValue: 'Revoke' })}
                    </Btn>
                  ),
                },
              ]}
            />
          )}
      </LayoutSection>

      <LayoutSection variant="raised"
        title={t('personal.security.histTitle', { defaultValue: 'Login history' })}
        className="personal-section--spaced">
        {hLoading ? <PageLoading size={20} />
          : logins.length === 0 ? (
            <EmptyState icon="📜" title={t('personal.security.histEmpty', { defaultValue: 'No login history yet' })} />
          ) : (
            <Table
              data={logins}
              columns={[
                { key: 'creation', label: t('personal.security.colWhen', { defaultValue: 'When' }),
                  render: (v) => fmtDateTime(v) },
                { key: 'operation', label: t('personal.security.colOp', { defaultValue: 'Operation' }),
                  render: (v) => <Badge color={v === 'Login' ? 'green' : 'default'}>{v}</Badge> },
                { key: 'status', label: t('personal.security.colStatus', { defaultValue: 'Status' }),
                  render: (v) => v ? <Badge color={v === 'Success' ? 'green' : 'red'}>{v}</Badge> : '—' },
                { key: 'ip_address', label: t('personal.security.colIp', { defaultValue: 'IP' }),
                  render: (v) => v ? <span className="mono">{v}</span> : '—' },
              ]}
            />
          )}
      </LayoutSection>

      <ConfirmDialog
        open={!!revokeTarget}
        title={t('personal.security.revokeTitle', { defaultValue: 'Revoke session' })}
        message={revokeTarget
          ? t('personal.security.revokeConfirm', { defaultValue: 'This session will be signed out immediately.' })
          : ''}
        confirmLabel={t('personal.security.revoke', { defaultValue: 'Revoke' })}
        variant="danger"
        loading={revokeBusy}
        onCancel={() => !revokeBusy && setRevokeTarget(null)}
        onConfirm={submitRevoke}
      />
    </>
  );
}

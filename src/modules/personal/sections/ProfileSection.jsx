import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Badge, Btn, FormField, Input, PageLoading } from '../../../components/ui';
import FormGrid from '../../../components/ui/FormGrid';
import FormActions from '../../../components/ui/FormActions';
import { LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import { getProfile, updateProfile } from '../../../services/personalSettingsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function ProfileSection() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [data, setData] = useState(null);
  const [values, setValues] = useState({ full_name: '', mobile_no: '', user_image: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = await getProfile();
      setData(p);
      setValues({
        full_name: p?.full_name || '',
        mobile_no: p?.mobile_no || '',
        user_image: p?.user_image || '',
      });
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return values.full_name !== (data.full_name || '')
        || values.mobile_no !== (data.mobile_no || '')
        || values.user_image !== (data.user_image || '');
  }, [values, data]);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(values);
      notify.success(t('personal.profile.saved', { defaultValue: 'Profile updated.' }));
      await load();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayoutSection variant="raised" title={t('personal.profile.title', { defaultValue: 'Profile' })}>
      {loading ? <PageLoading size={22} />
        : error ? <ApiErrorCard message={error} onRetry={load} />
        : (
        <>
          <FormGrid cols="auto">
            <FormField label={t('personal.profile.fullName', { defaultValue: 'Full name' })}>
              {({ id }) => (
                <Input id={id} type="text" value={values.full_name}
                  onChange={(e) => setValues({ ...values, full_name: e.target.value })} />
              )}
            </FormField>
            <FormField label={t('personal.profile.phone', { defaultValue: 'Phone' })}>
              {({ id }) => (
                <Input id={id} type="tel" value={values.mobile_no}
                  onChange={(e) => setValues({ ...values, mobile_no: e.target.value })} />
              )}
            </FormField>
            <FormField label={t('personal.profile.photo', { defaultValue: 'Photo URL' })}>
              {({ id }) => (
                <Input id={id} type="text" className="mono" value={values.user_image}
                  placeholder="/files/me.png"
                  onChange={(e) => setValues({ ...values, user_image: e.target.value })} />
              )}
            </FormField>
            <FormField label={t('personal.profile.emailReadonly', { defaultValue: 'Email (login)' })}>
              {({ id }) => <Input id={id} type="text" value={data?.email || ''} disabled />}
            </FormField>
            <FormField label={t('personal.profile.usernameReadonly', { defaultValue: 'Username' })}>
              {({ id }) => <Input id={id} type="text" className="mono" value={data?.username || data?.name || ''} disabled />}
            </FormField>
          </FormGrid>

          <FormField label={t('personal.profile.rolesReadonly', { defaultValue: 'Roles (assigned by Administrator)' })}>
            <div className="badge-wrap">
              {(data?.roles || []).map((r) => <Badge key={r} color="blue">{r}</Badge>)}
              {data?.role_profile_name && <Badge color="accent">{data.role_profile_name}</Badge>}
            </div>
          </FormField>

          <FormActions align="end">
            <Btn variant="ghost" size="md" onClick={() => setValues({
              full_name: data?.full_name || '',
              mobile_no: data?.mobile_no || '',
              user_image: data?.user_image || '',
            })} disabled={!dirty || saving}>
              {t('common.reset', { defaultValue: 'Reset' })}
            </Btn>
            <Btn variant="primary" size="md" onClick={save} disabled={!dirty || saving} loading={saving}>
              {t('common.save', { defaultValue: 'Save' })}
            </Btn>
          </FormActions>
        </>
      )}
    </LayoutSection>
  );
}

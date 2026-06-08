/**
 * Company — combines Global Defaults (system-wide) + per-Company
 * identity (Company doctype). The company picklist appears only if >1
 * company exists on the site.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, FormField, Input, PageLoading, ApiErrorCard } from '../../../../components/ui';
import FormGrid from '../../../../components/ui/FormGrid';
import FormActions from '../../../../components/ui/FormActions';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { useNotify } from '../../../../context/NotificationContext';
import {
  getCompany, listCompanies, updateCompany,
  getSection, updateSection,
} from '../../../../services/systemSettingsApi';
import { getUserFriendlyMessage } from '../../../../utils/errorHandling';
import SectionForm from '../components/SectionForm';
import SectionBlock from '../components/SectionBlock';
import SettingsAuditLog from '../components/SettingsAuditLog';

const COMPANY_FIELDS = [
  ['company_name',         { label: 'Company name',         kind: 'text' }],
  ['abbr',                 { label: 'Abbreviation',          kind: 'text', mono: true }],
  ['country',              { label: 'Country',               kind: 'text' }],
  ['default_currency',     { label: 'Default currency',      kind: 'text' }],
  ['tax_id',               { label: 'Tax ID',                kind: 'text' }],
  ['phone_no',             { label: 'Phone',                 kind: 'text' }],
  ['email',                { label: 'Email',                 kind: 'text' }],
  ['website',              { label: 'Website',               kind: 'text' }],
  ['default_holiday_list', { label: 'Default holiday list',  kind: 'text' }],
];

export default function CompanySettings() {
  const { t } = useTranslation();
  const notify = useNotify();

  // Company picklist
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompany] = useState(null);
  const [companyValues, setCompanyValues] = useState({});
  const [companyOriginal, setCompanyOriginal] = useState({});
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyErr, setCompanyErr] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  const loadCompanies = useCallback(async () => {
    setCompanyLoading(true);
    setCompanyErr('');
    try {
      const list = await listCompanies();
      setCompanies(list);
      const target = list[0]?.name;
      if (target) {
        const detail = await getCompany(target);
        setActiveCompany(target);
        setCompanyOriginal(detail);
        setCompanyValues(detail);
      }
    } catch (e) {
      setCompanyErr(getUserFriendlyMessage(e));
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const onChangeCompany = async (name) => {
    if (!name) return;
    setCompanyLoading(true);
    try {
      const detail = await getCompany(name);
      setActiveCompany(name);
      setCompanyOriginal(detail);
      setCompanyValues(detail);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setCompanyLoading(false);
    }
  };

  const companyDirty = useMemo(() => {
    if (!activeCompany) return false;
    return COMPANY_FIELDS.some(([f]) => String(companyValues[f] ?? '') !== String(companyOriginal[f] ?? ''));
  }, [companyValues, companyOriginal, activeCompany]);

  const saveCompany = async () => {
    if (!activeCompany) return;
    setSavingCompany(true);
    try {
      const payload = {};
      COMPANY_FIELDS.forEach(([f]) => {
        if (String(companyValues[f] ?? '') !== String(companyOriginal[f] ?? '')) {
          payload[f] = companyValues[f];
        }
      });
      await updateCompany(activeCompany, payload);
      const detail = await getCompany(activeCompany);
      setCompanyOriginal(detail);
      setCompanyValues(detail);
      notify.success(t('settings.companySaved', { defaultValue: 'Company updated.' }));
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setSavingCompany(false);
    }
  };

  return (
    <>
      <LayoutSection variant="raised"
        title={t('settings.company.title', { defaultValue: 'Company identity' })}>
        <p className="personal-section__intro">
          {t('settings.company.desc', {
            defaultValue: 'Editable fields are stored on the Company doctype. Logo upload cascades to the default Letter Head.',
          })}
        </p>

        {companies.length > 1 && (
          <FormField label={t('settings.company.pick', { defaultValue: 'Company' })}>
            {({ id }) => (
              <select id={id} className="input" value={activeCompany || ''}
                onChange={(e) => onChangeCompany(e.target.value)}>
                {companies.map((c) => (
                  <option key={c.name} value={c.name}>{c.company_name || c.name}</option>
                ))}
              </select>
            )}
          </FormField>
        )}

        {companyLoading ? (
          <PageLoading size={20} />
        ) : companyErr ? (
          <ApiErrorCard message={companyErr} onRetry={loadCompanies} />
        ) : !activeCompany ? (
          <p className="muted-3">{t('settings.company.none', { defaultValue: 'No company configured.' })}</p>
        ) : (
          <>
            <FormGrid cols="auto">
              {COMPANY_FIELDS.map(([field, meta]) => (
                <FormField key={field} label={meta.label}>
                  {({ id }) => (
                    <Input
                      id={id}
                      type="text"
                      className={meta.mono ? 'mono' : ''}
                      value={companyValues[field] ?? ''}
                      onChange={(e) => setCompanyValues({ ...companyValues, [field]: e.target.value })}
                    />
                  )}
                </FormField>
              ))}
            </FormGrid>
            <FormActions align="end">
              <Btn variant="ghost" size="md"
                onClick={() => setCompanyValues(companyOriginal)}
                disabled={!companyDirty || savingCompany}>
                {t('settings.reset', { defaultValue: 'Reset' })}
              </Btn>
              <Btn variant="primary" size="md" onClick={saveCompany}
                disabled={!companyDirty || savingCompany} loading={savingCompany}>
                {t('settings.save', { defaultValue: 'Save changes' })}
              </Btn>
            </FormActions>
          </>
        )}
      </LayoutSection>

      <SectionForm
        section="company"
        title={t('settings.company.globalDefaults', { defaultValue: 'Global defaults' })}
        description={t('settings.company.globalDesc', { defaultValue: 'System-wide currency / country / fiscal year (Frappe Global Defaults).' })}
        loader={() => getSection('company')}
        onSave={(payload) => updateSection('company', payload)}
      >
        {({ values, setField, data }) => (
          <>
            {(data?.blocks || []).map((block) => (
              <SectionBlock key={block.doctype} block={block} values={values} setField={setField} />
            ))}
          </>
        )}
      </SectionForm>

      <SettingsAuditLog section="company" />
    </>
  );
}

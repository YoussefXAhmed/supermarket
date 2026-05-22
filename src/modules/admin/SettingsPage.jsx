import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Badge, PageHeader, PageLoading } from '../../components/ui';
import { AdminPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { ERP_BASE_URL } from '../../config/erp';
import { useAuth } from '../../hooks/useAuth';
import { getCompanies, getCompany } from '../../services/api';
import { getERPDeskUrl } from '../../utils/erpLinks';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, roles } = useAuth();
  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState('');

  const loadCompany = useCallback(async () => {
    setCompanyLoading(true);
    setCompanyError('');
    try {
      const listRes = await getCompanies({ limit: 1 });
      const first = listRes?.data?.data?.[0];
      if (!first?.name) {
        setCompany(null);
        return;
      }
      const detailRes = await getCompany(first.name);
      setCompany(detailRes?.data?.data || null);
    } catch (e) {
      setCompany(null);
      setCompanyError(getUserFriendlyMessage(e, t('settings.companyUnavailable')));
    } finally {
      setCompanyLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  const quickLinks = [
    [t('settings.erpQuickLinks.itemList'), '/app/item'],
    [t('settings.erpQuickLinks.posProfile'), '/app/pos-profile'],
    [t('settings.erpQuickLinks.priceList'), '/app/price-list'],
    [t('settings.erpQuickLinks.warehouse'), '/app/warehouse'],
    [t('settings.erpQuickLinks.userManagement'), '/app/user'],
  ];

  return (
    <AdminPageLayout>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} dense />

      <div className="settings-grid">
        <LayoutSection variant="raised" title={t('settings.myProfile')}>
          <div className="kv-stack">
            <Row label={t('settings.fullName')} value={user?.full_name} />
            <Row label={t('settings.email')} value={user?.email} />
            <Row label={t('settings.username')} value={user?.name} />
          </div>
          <div className="panel">
            <p className="subtle-label">{t('settings.roles')}</p>
            <div className="badge-wrap">
              {roles.map((r) => (
                <Badge key={r} color="blue">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </LayoutSection>

        <LayoutSection variant="raised" title={t('settings.erpConnection')}>
          <div className="kv-stack">
            <Row label={t('settings.baseUrl')} value={ERP_BASE_URL} />
            <Row label={t('settings.auth')} value="Cookie-based (withCredentials)" />
            <Row label={t('settings.protocol')} value="Frappe REST API v2" />
          </div>
          <div className="panel">
            <a
              href={getERPDeskUrl()}
              target="_blank"
              rel="noreferrer"
              className="btn btn--ghost btn--sm"
            >
              {t('settings.openErpNext')}
            </a>
          </div>
        </LayoutSection>

        <LayoutSection variant="raised" title={t('settings.quickLinks')}>
          <div className="quick-links">
            {quickLinks.map(([label, path]) => (
              <a
                key={path}
                href={getERPDeskUrl(path.replace(/^\/app/, ''))}
                target="_blank"
                rel="noreferrer"
                className="quick-link-row"
              >
                {label}
                <span className="quick-link-row__arrow">↗</span>
              </a>
            ))}
          </div>
        </LayoutSection>

        <LayoutSection variant="raised" title={t('settings.companyDetails')}>
          {companyLoading ? (
            <PageLoading size={20} />
          ) : companyError ? (
            <ApiErrorCard title={t('settings.companyUnavailable')} message={companyError} onRetry={loadCompany} />
          ) : !company ? (
            <p className="page-header__sub">{t('settings.noCompany')}</p>
          ) : (
            <div className="kv-stack">
              <Row label={t('settings.company')} value={company.company_name || company.name} />
              <Row label={t('settings.code')} value={company.abbr} />
              <Row label={t('settings.country')} value={company.country} />
              <Row label={t('settings.currency')} value={company.default_currency} />
              <Row label={t('settings.taxId')} value={company.tax_id} />
              <Row label={t('settings.phone')} value={company.phone_no} />
              <Row label={t('settings.email')} value={company.email} />
              <Row label={t('settings.website')} value={company.website} />
              <Row label={t('settings.holidayList')} value={company.default_holiday_list} />
            </div>
          )}
        </LayoutSection>
      </div>
    </AdminPageLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="kv-row">
      <span className="kv-row__label">{label}</span>
      <span className="kv-row__value">{value || '—'}</span>
    </div>
  );
}

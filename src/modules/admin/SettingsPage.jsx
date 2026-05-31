import { useCallback, useEffect, useState } from 'react';
import { ApiErrorCard, Badge, EmptyState, PageHeader, PageLoading } from '../../components/ui';
import { AdminPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { ERP_BASE_URL } from '../../config/erp';
import { useAuth } from '../../hooks/useAuth';
import { getCompanies, getCompany } from '../../services/api';
import { getERPDeskUrl } from '../../utils/erpLinks';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function SettingsPage() {
  const { user, roles, capabilities } = useAuth();
  // Desk shortcuts bypass SPA validation/audit; show them only to system
  // managers (break-glass access). Cashiers / inventory clerks / accountants
  // who land here see Profile + Company Details only — no path back to /app.
  const canEnterDesk = Boolean(capabilities?.canManageSystem);
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
      setCompanyError(getUserFriendlyMessage(e, 'Failed to load company details'));
    } finally {
      setCompanyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  return (
    <AdminPageLayout>
      <PageHeader title="Settings" subtitle="System configuration" dense />

      <div className="settings-grid">
        <LayoutSection variant="raised" title="My Profile">
          <div className="kv-stack">
            <Row label="Full Name" value={user?.full_name} />
            <Row label="Email" value={user?.email} />
            <Row label="Username" value={user?.name} />
          </div>
          <div className="panel">
            <p className="subtle-label">Roles</p>
            <div className="badge-wrap">
              {roles.map((r) => (
                <Badge key={r} color="blue">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </LayoutSection>

        <LayoutSection variant="raised" title="System Connection">
          <div className="kv-stack">
            <Row label="Base URL" value={ERP_BASE_URL} />
            <Row label="Auth" value="Cookie-based (withCredentials)" />
            <Row label="Protocol" value="Frappe REST API v2" />
          </div>
          {canEnterDesk && (
            <div className="panel">
              <a
                href={getERPDeskUrl()}
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost btn--sm"
              >
                Open admin console ↗
              </a>
            </div>
          )}
        </LayoutSection>

        {canEnterDesk && (
          <LayoutSection variant="raised" title="Quick Links">
            <div className="quick-links">
              {[
                ['Item List', '/app/item'],
                ['POS Profile', '/app/pos-profile'],
                ['Price List', '/app/price-list'],
                ['Warehouse', '/app/warehouse'],
                ['User Management', '/app/user'],
              ].map(([label, path]) => (
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
        )}

        <LayoutSection variant="raised" title="Company Details">
          {companyLoading ? (
            <PageLoading size={20} />
          ) : companyError ? (
            <ApiErrorCard title="Company details unavailable" message={companyError} onRetry={loadCompany} />
          ) : !company ? (
            <EmptyState
              icon="🏢"
              title="No company configured"
              desc="Configure your Company in the admin console, then return here to manage its details."
            />
          ) : (
            <div className="kv-stack">
              <Row label="Company" value={company.company_name || company.name} />
              <Row label="Code" value={company.abbr} />
              <Row label="Country" value={company.country} />
              <Row label="Currency" value={company.default_currency} />
              <Row label="Tax ID" value={company.tax_id} />
              <Row label="Phone" value={company.phone_no} />
              <Row label="Email" value={company.email} />
              <Row label="Website" value={company.website} />
              <Row label="Holiday List" value={company.default_holiday_list} />
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

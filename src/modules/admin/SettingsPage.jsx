import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getCompanies, getCompany } from '../../services/api';
import { PageHeader, Badge, Spinner } from '../../components/ui';

export default function SettingsPage() {
  const { user, roles } = useAuth();
  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState('');

  useEffect(() => {
    const loadCompany = async () => {
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
        setCompanyError(e.message || 'Failed to load company details');
      } finally {
        setCompanyLoading(false);
      }
    };
    loadCompany();
  }, []);

  return (
    <div>
      <PageHeader title="Settings" subtitle="System configuration" />

      <div className="settings-grid">

        {/* Profile */}
        <div className="card">
          <h3 className="section-title">My Profile</h3>
          <div className="kv-stack">
            <Row label="Full Name" value={user?.full_name} />
            <Row label="Email"     value={user?.email} />
            <Row label="Username"  value={user?.name} />
          </div>
          <div className="panel" style={{ marginTop: 16, marginBottom: 0 }}>
            <p className="subtle-label">Roles</p>
            <div className="badge-wrap">
              {roles.map(r => <Badge key={r} color="blue">{r}</Badge>)}
            </div>
          </div>
        </div>

        {/* ERPNext Connection */}
        <div className="card">
          <h3 className="section-title">ERPNext Connection</h3>
          <div className="kv-stack">
            <Row label="Base URL"  value="http://localhost:8000" />
            <Row label="Auth"      value="Cookie-based (withCredentials)" />
            <Row label="Protocol"  value="Frappe REST API v2" />
          </div>
          <div className="panel" style={{ marginTop: 16, marginBottom: 0 }}>
            <a
              href="http://localhost:8000/app"
              target="_blank" rel="noreferrer"
              className="btn btn--ghost btn--sm"
            >Open ERPNext ↗</a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="card">
          <h3 className="section-title">Quick Links</h3>
          <div className="quick-links">
          {[
            ['Item List',      '/app/item'],
            ['POS Profile',    '/app/pos-profile'],
            ['Price List',     '/app/price-list'],
            ['Warehouse',      '/app/warehouse'],
            ['User Management','/app/user'],
          ].map(([label, path]) => (
            <a
              key={path}
              href={`http://localhost:8000${path}`}
              target="_blank" rel="noreferrer"
              className="quick-link-row"
            >
              {label}
              <span className="quick-link-row__arrow">↗</span>
            </a>
          ))}
          </div>
        </div>

        {/* Company Details */}
        <div className="card">
          <h3 className="section-title">Company Details</h3>
          {companyLoading ? (
            <div className="content-loading" style={{ padding: '18px 0' }}>
              <Spinner size={20} />
            </div>
          ) : companyError ? (
            <p className="inv-error">{companyError}</p>
          ) : !company ? (
            <p className="page-header__sub">No company found.</p>
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
        </div>
      </div>
    </div>
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

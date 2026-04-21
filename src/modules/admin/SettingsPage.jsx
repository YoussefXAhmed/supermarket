import { useAuth } from '../../hooks/useAuth';
import { PageHeader, Badge } from '../../components/ui';

export default function SettingsPage() {
  const { user, roles } = useAuth();

  return (
    <div>
      <PageHeader title="Settings" subtitle="System configuration" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Profile */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>My Profile</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Full Name" value={user?.full_name} />
            <Row label="Email"     value={user?.email} />
            <Row label="Username"  value={user?.name} />
          </div>
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Roles</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {roles.map(r => <Badge key={r} color="blue">{r}</Badge>)}
            </div>
          </div>
        </div>

        {/* ERPNext Connection */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>ERPNext Connection</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Base URL"  value="http://localhost:8000" />
            <Row label="Auth"      value="Cookie-based (withCredentials)" />
            <Row label="Protocol"  value="Frappe REST API v2" />
          </div>
          <div style={{ marginTop: 16 }}>
            <a
              href="http://localhost:8000/app"
              target="_blank" rel="noreferrer"
              className="btn btn--ghost btn--sm"
            >Open ERPNext ↗</a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Quick Links</h3>
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
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-2)' }}
            >
              {label}
              <span style={{ color: 'var(--accent)' }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem' }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}

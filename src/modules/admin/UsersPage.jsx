import { useEffect, useMemo, useState } from 'react';
import { createUser, deleteUser, getUsers, setUserEnabled } from '../../services/api';
import { Badge, Btn, EmptyState, PageHeader, Spinner, Table } from '../../components/ui';

function toStatusBadge(enabled) {
  return enabled ? <Badge color="green">Enabled</Badge> : <Badge color="red">Disabled</Badge>;
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: '', first_name: '' });
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUsers({ limit: 200 });
      setUsers(res.data.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const totals = useMemo(() => {
    const enabled = users.filter(u => Number(u.enabled) === 1).length;
    return { total: users.length, enabled, disabled: users.length - enabled };
  }, [users]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.first_name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createUser({
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        enabled: 1,
        send_welcome_email: 0,
      });
      setForm({ email: '', first_name: '' });
      await loadUsers();
    } catch (e2) {
      setError(e2.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (row) => {
    const next = Number(row.enabled) !== 1;
    setError('');
    try {
      await setUserEnabled(row.name, next);
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Failed to update user status');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete user "${row.name}"?`)) return;
    setError('');
    try {
      await deleteUser(row.name);
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Failed to delete user');
    }
  };

  const columns = [
    {
      key: 'full_name',
      label: 'Name',
      render: (v, row) => v || row.name,
    },
    {
      key: 'email',
      label: 'Email',
      render: (v) => v || '—',
    },
    {
      key: 'name',
      label: 'Username',
      render: (v) => <span className="mono" style={{ fontSize: '0.78rem' }}>{v}</span>,
    },
    {
      key: 'enabled',
      label: 'Status',
      render: (v) => toStatusBadge(Number(v) === 1),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={() => handleToggle(row)}>
            {Number(row.enabled) === 1 ? 'Disable' : 'Enable'}
          </Btn>
          <Btn variant="danger" size="sm" onClick={() => handleDelete(row)}>
            Delete
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${totals.total} total · ${totals.enabled} enabled · ${totals.disabled} disabled`}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Add User</h3>
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
          <input
            className="input"
            type="text"
            placeholder="Full name"
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="email@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <Btn type="submit" variant="primary" size="md" loading={saving}>Add User</Btn>
        </form>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.35)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>
      ) : users.length === 0 ? (
        <EmptyState icon="👤" title="No users found" desc="Create your first user from the form above." />
      ) : (
        <Table columns={columns} data={users} />
      )}
    </div>
  );
}

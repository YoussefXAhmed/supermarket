import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiErrorCard,
  Badge,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
  Table,
} from '../../components/ui';
import ExportToolbar from '../../components/ui/ExportToolbar';
import { AdminPageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import {
  OPERATIONAL_USER_TEMPLATES,
  TEMPLATE_IDS,
  getTemplateById,
  getTemplateByRoleProfile,
  validateProvisioningInput,
} from '../../auth/operationalUserTemplates';
import { useAuth } from '../../context/AuthContext';
import { getUsers } from '../../services/api';
import {
  disableOperationalUser,
  enableOperationalUser,
  getDefaultCompany,
  getPriceLists,
  listWarehousesForProvisioning,
  provisionOperationalUser,
} from '../../services/userManagementApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const EXPORT_COLUMNS = [
  { key: 'full_name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Username' },
  { key: 'role_profile_name', label: 'Role profile' },
  { key: 'enabled', label: 'Status' },
  { key: 'last_login', label: 'Last Login' },
];

const INITIAL_FORM = {
  templateId: 'cashier',
  email: '',
  first_name: '',
  warehouses: [],
  priceList: '',
  company: '',
  send_welcome_email: false,
};

function toStatusBadge(enabled) {
  return enabled ? <Badge color="green">Enabled</Badge> : <Badge color="red">Disabled</Badge>;
}

function roleProfileLabel(roleProfileName) {
  const t = getTemplateByRoleProfile(roleProfileName);
  return t ? t.label : roleProfileName || '—';
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const submittingRef = useRef(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [disableTarget, setDisableTarget] = useState(null);
  const [disableConfirmText, setDisableConfirmText] = useState('');
  const [disabling, setDisabling] = useState(false);

  const template = getTemplateById(form.templateId);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUsers({ limit: 200 });
      setUsers(res.data.data || []);
    } catch (e) {
      setUsers([]);
      setError(getUserFriendlyMessage(e, 'Failed to load users'));
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    setOptionsLoading(true);
    try {
      const [whRes, plRes, company] = await Promise.all([
        listWarehousesForProvisioning({ limit: 200 }),
        getPriceLists(),
        getDefaultCompany(),
      ]);
      setWarehouses((whRes.data?.data || []).filter((w) => !w.is_group));
      setPriceLists(plRes.data?.data || []);
      setForm((f) => (f.company ? f : { ...f, company: company || '' }));
    } catch {
      setWarehouses([]);
      setPriceLists([]);
    } finally {
      setOptionsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadOptions();
  }, []);

  const totals = useMemo(() => {
    const enabled = users.filter((u) => Number(u.enabled) === 1).length;
    return { total: users.length, enabled, disabled: users.length - enabled };
  }, [users]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return users;
    return users.filter((row) => {
      const haystack = [
        row.full_name,
        row.name,
        row.email,
        row.role_profile_name,
        roleProfileLabel(row.role_profile_name),
        Number(row.enabled) === 1 ? 'enabled' : 'disabled',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [users, query]);

  const exportRows = useMemo(
    () =>
      filtered.map((row) => ({
        ...row,
        full_name: row.full_name || row.name,
        role_profile_name: roleProfileLabel(row.role_profile_name),
        enabled: Number(row.enabled) === 1 ? 'Enabled' : 'Disabled',
      })),
    [filtered]
  );

  const setTemplateId = (templateId) => {
    setForm((f) => {
      const next = { ...f, templateId };
      const t = getTemplateById(templateId);
      if (t?.warehouseRule === 'exactly_one' && f.warehouses.length > 1) {
        next.warehouses = f.warehouses.slice(0, 1);
      }
      if (t && !t.requiresPriceList) {
        next.priceList = '';
      }
      return next;
    });
  };

  const handleWarehouseSingle = (name) => {
    setForm((f) => ({ ...f, warehouses: name ? [name] : [] }));
  };

  const handleWarehouseMulti = (e) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    setForm((f) => ({ ...f, warehouses: selected }));
  };

  const selectAllWarehouses = () => {
    setForm((f) => ({
      ...f,
      warehouses: warehouses.map((w) => w.name).filter(Boolean),
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const validation = validateProvisioningInput(form.templateId, {
      warehouses: form.warehouses,
      priceList: form.priceList,
      company: form.company,
    });
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    if (!form.email.trim() || !form.first_name.trim()) return;

    submittingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await provisionOperationalUser({
        templateId: form.templateId,
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        warehouses: form.warehouses,
        priceList: form.priceList,
        company: form.company,
        send_welcome_email: form.send_welcome_email,
      });
      setForm({ ...INITIAL_FORM, company: form.company });
      await loadUsers();
    } catch (e2) {
      setError(getUserFriendlyMessage(e2, e2.message || 'Failed to create user'));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const startDisable = (row) => {
    if (currentUser?.name && row.name === currentUser.name) {
      setError('You cannot disable your own account.');
      return;
    }
    setDisableTarget(row);
    setDisableConfirmText('');
    setError('');
  };

  const cancelDisable = () => {
    setDisableTarget(null);
    setDisableConfirmText('');
  };

  const confirmDisable = async () => {
    if (!disableTarget || disableConfirmText !== disableTarget.name) return;
    setDisabling(true);
    setError('');
    try {
      await disableOperationalUser(disableTarget.name);
      cancelDisable();
      await loadUsers();
    } catch (e) {
      setError(getUserFriendlyMessage(e, 'Failed to disable user'));
    } finally {
      setDisabling(false);
    }
  };

  const handleEnable = async (row) => {
    if (!window.confirm(`Enable user "${row.name}"?`)) return;
    setError('');
    try {
      await enableOperationalUser(row.name);
      await loadUsers();
    } catch (e) {
      setError(getUserFriendlyMessage(e, 'Failed to enable user'));
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
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    {
      key: 'role_profile_name',
      label: 'Role',
      render: (v) => roleProfileLabel(v),
    },
    {
      key: 'enabled',
      label: 'Status',
      render: (v) => toStatusBadge(Number(v) === 1),
    },
    {
      key: 'last_login',
      label: 'Last Login',
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="row-actions">
          {Number(row.enabled) === 1 ? (
            <Btn variant="ghost" size="sm" onClick={() => startDisable(row)}>
              Disable
            </Btn>
          ) : (
            <Btn variant="ghost" size="sm" onClick={() => handleEnable(row)}>
              Enable
            </Btn>
          )}
        </div>
      ),
    },
  ];

  const sparse = filtered.length > 0 && filtered.length <= 5;
  const layoutClass = [
    'page-layout--list-page',
    sparse ? 'page-layout--table-fit-relaxed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const disableReady = disableTarget && disableConfirmText === disableTarget.name;

  return (
    <AdminPageLayout tableConstrain={sparse} className={layoutClass}>
      <PageHeader
        title="Users"
        subtitle={
          query.trim()
            ? `${filtered.length} of ${totals.total} · ${totals.enabled} enabled · ${totals.disabled} disabled`
            : `${totals.total} total · ${totals.enabled} enabled · ${totals.disabled} disabled`
        }
        dense
      />

      <LayoutSection variant="raised" title="Add operational user">
        <p className="user-form__hint">
          Assign an ERP Role Profile and warehouse scope via template — roles are not set manually.
        </p>
        <form onSubmit={handleCreate} className="user-form">
          <div className="user-form__row">
            <label className="user-form__label">
              Role template
              <select
                className="input"
                value={form.templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                {TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {OPERATIONAL_USER_TEMPLATES[id].label} → {OPERATIONAL_USER_TEMPLATES[id].roleProfileName}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-form__label">
              Company
              <input
                className="input"
                type="text"
                placeholder="Company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="user-form__row">
            <label className="user-form__label">
              Full name
              <input
                className="input"
                type="text"
                placeholder="Full name"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                required
              />
            </label>
            <label className="user-form__label">
              Email
              <input
                className="input"
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="user-form__row user-form__row--full">
            <label className="user-form__label">
              {template?.warehouseRule === 'exactly_one' ? 'Warehouse' : 'Warehouses'}
              {template?.warehouseRule !== 'exactly_one' && warehouses.length > 1 && (
                <Btn
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="user-form__inline-btn"
                  onClick={selectAllWarehouses}
                  disabled={optionsLoading}
                >
                  Select all
                </Btn>
              )}
              {template?.warehouseRule === 'exactly_one' ? (
                <select
                  className="input"
                  value={form.warehouses[0] || ''}
                  onChange={(e) => handleWarehouseSingle(e.target.value)}
                  required
                  disabled={optionsLoading}
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.warehouse_name || w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="input user-form__multiselect"
                  multiple
                  value={form.warehouses}
                  onChange={handleWarehouseMulti}
                  required={form.warehouses.length === 0}
                  disabled={optionsLoading}
                  size={Math.min(6, Math.max(3, warehouses.length))}
                >
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.warehouse_name || w.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          {template?.requiresPriceList && (
            <div className="user-form__row user-form__row--full">
              <label className="user-form__label">
                Price list
                <select
                  className="input"
                  value={form.priceList}
                  onChange={(e) => setForm((f) => ({ ...f, priceList: e.target.value }))}
                  required
                  disabled={optionsLoading}
                >
                  <option value="">Select price list…</option>
                  {priceLists.map((pl) => (
                    <option key={pl.name} value={pl.name}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="user-form__checkbox">
            <input
              type="checkbox"
              checked={form.send_welcome_email}
              onChange={(e) => setForm((f) => ({ ...f, send_welcome_email: e.target.checked }))}
            />
            Send welcome email after provisioning
          </label>

          <div className="user-form__actions">
            <Btn type="submit" variant="primary" size="md" loading={saving} disabled={optionsLoading}>
              Create user
            </Btn>
          </div>
        </form>
      </LayoutSection>

      {disableTarget && (
        <LayoutSection variant="raised" title="Disable user">
          <p className="user-form__hint">
            Disabling blocks login and preserves audit history. Type the username{' '}
            <span className="mono">{disableTarget.name}</span> to confirm.
          </p>
          <div className="user-form__row user-form__row--full">
            <input
              className="input"
              type="text"
              placeholder={disableTarget.name}
              value={disableConfirmText}
              onChange={(e) => setDisableConfirmText(e.target.value)}
              autoComplete="off"
              aria-label="Type username to confirm disable"
            />
          </div>
          <div className="user-form__actions">
            <Btn
              variant="danger"
              size="md"
              loading={disabling}
              disabled={!disableReady}
              onClick={confirmDisable}
            >
              Disable user
            </Btn>
            <Btn variant="ghost" size="md" onClick={cancelDisable} disabled={disabling}>
              Cancel
            </Btn>
          </div>
        </LayoutSection>
      )}

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              type="search"
              placeholder="Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <ExportToolbar
            filename="users"
            title="Users"
            columns={EXPORT_COLUMNS}
            rows={exportRows}
            disabled={!exportRows.length}
          />
        </div>
      </LayoutSection>

      {error && !loading && (
        <ApiErrorCard
          message={error}
          onRetry={users.length === 0 ? loadUsers : undefined}
        />
      )}

      {loading ? (
        <PageLoading size={26} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👤"
          title={query.trim() ? 'No matching users' : 'No users found'}
          desc={
            query.trim()
              ? 'Try a different search term.'
              : 'Create an operational user using the form above.'
          }
        />
      ) : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={filtered} compact />
          </TableRegion>
        </LayoutSection>
      )}
    </AdminPageLayout>
  );
}

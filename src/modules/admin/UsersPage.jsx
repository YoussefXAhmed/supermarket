import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const INITIAL_FORM = {
  templateId: 'cashier',
  email: '',
  first_name: '',
  warehouses: [],
  priceList: '',
  company: '',
  send_welcome_email: false,
};

export default function UsersPage() {
  const { t } = useTranslation();
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

  const EXPORT_COLUMNS = [
    { key: 'full_name', label: t('users.exportName') },
    { key: 'email', label: t('users.exportEmail') },
    { key: 'name', label: t('users.exportUsername') },
    { key: 'role_profile_name', label: t('users.exportRoleProfile') },
    { key: 'enabled', label: t('users.exportStatus') },
    { key: 'last_login', label: t('users.exportLastLogin') },
  ];

  const toStatusBadge = (enabled) =>
    enabled
      ? <Badge color="green">{t('users.enabled')}</Badge>
      : <Badge color="red">{t('users.disabled')}</Badge>;

  const roleProfileLabel = (roleProfileName) => {
    const tpl = getTemplateByRoleProfile(roleProfileName);
    if (tpl) return t(tpl.labelKey) || tpl.label;
    return roleProfileName || '—';
  };

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUsers({ limit: 200 });
      setUsers(res.data.data || []);
    } catch (e) {
      setUsers([]);
      setError(getUserFriendlyMessage(e, t('users.failedLoad')));
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
        enabled: Number(row.enabled) === 1 ? t('users.enabled') : t('users.disabled'),
      })),
    [filtered]
  );

  const setTemplateId = (templateId) => {
    setForm((f) => {
      const next = { ...f, templateId };
      const tpl = getTemplateById(templateId);
      if (tpl?.warehouseRule === 'exactly_one' && f.warehouses.length > 1) {
        next.warehouses = f.warehouses.slice(0, 1);
      }
      if (tpl && !tpl.requiresPriceList) {
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
    }, t);
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
      setError(getUserFriendlyMessage(e2, e2.message || t('users.failedCreate')));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const startDisable = (row) => {
    if (currentUser?.name && row.name === currentUser.name) {
      setError(t('users.cannotDisableSelf'));
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
      setError(getUserFriendlyMessage(e, t('users.failedDisable')));
    } finally {
      setDisabling(false);
    }
  };

  const handleEnable = async (row) => {
    if (!window.confirm(`${t('users.enableBtn')} "${row.name}"?`)) return;
    setError('');
    try {
      await enableOperationalUser(row.name);
      await loadUsers();
    } catch (e) {
      setError(getUserFriendlyMessage(e, t('users.failedEnable')));
    }
  };

  const columns = [
    {
      key: 'full_name',
      label: t('users.name'),
      render: (v, row) => v || row.name,
    },
    {
      key: 'email',
      label: t('users.emailCol'),
      render: (v) => v || '—',
    },
    {
      key: 'name',
      label: t('users.usernameCol'),
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    {
      key: 'role_profile_name',
      label: t('users.roleCol'),
      render: (v) => roleProfileLabel(v),
    },
    {
      key: 'enabled',
      label: t('users.statusCol'),
      render: (v) => toStatusBadge(Number(v) === 1),
    },
    {
      key: 'last_login',
      label: t('users.lastLogin'),
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      key: 'actions',
      label: t('ui.table.actions'),
      render: (_, row) => (
        <div className="row-actions">
          {Number(row.enabled) === 1 ? (
            <Btn variant="ghost" size="sm" onClick={() => startDisable(row)}>
              {t('users.disableBtn')}
            </Btn>
          ) : (
            <Btn variant="ghost" size="sm" onClick={() => handleEnable(row)}>
              {t('users.enableBtn')}
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
        title={t('users.title')}
        subtitle={
          query.trim()
            ? `${filtered.length} / ${totals.total} · ${totals.enabled} ${t('users.enabled')}`
            : `${totals.total} · ${totals.enabled} ${t('users.enabled')}`
        }
        dense
      />

      <LayoutSection variant="raised" title={t('users.addUser')}>
        <form onSubmit={handleCreate} className="user-form">
          <div className="user-form__row">
            <label className="user-form__label">
              {t('users.template')}
              <select
                className="input"
                value={form.templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                {TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(OPERATIONAL_USER_TEMPLATES[id].labelKey)} → {OPERATIONAL_USER_TEMPLATES[id].roleProfileName}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-form__label">
              {t('purchasing.supplier.company')}
              <input
                className="input"
                type="text"
                placeholder={t('purchasing.supplier.company')}
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="user-form__row">
            <label className="user-form__label">
              {t('users.firstName')}
              <input
                className="input"
                type="text"
                placeholder={t('users.firstName')}
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                required
              />
            </label>
            <label className="user-form__label">
              {t('settings.email')}
              <input
                className="input"
                type="email"
                placeholder={t('users.emailPlaceholder')}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="user-form__row user-form__row--full">
            <label className="user-form__label">
              {template?.warehouseRule === 'exactly_one' ? t('users.warehouse') : t('users.warehouses')}
              {template?.warehouseRule !== 'exactly_one' && warehouses.length > 1 && (
                <Btn
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="user-form__inline-btn"
                  onClick={selectAllWarehouses}
                  disabled={optionsLoading}
                >
                  {t('common.select')}
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
                  <option value="">{t('users.selectWarehouse')}</option>
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
                {t('users.priceList')}
                <select
                  className="input"
                  value={form.priceList}
                  onChange={(e) => setForm((f) => ({ ...f, priceList: e.target.value }))}
                  required
                  disabled={optionsLoading}
                >
                  <option value="">{t('users.selectPriceList')}</option>
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
            {t('users.sendWelcome')}
          </label>

          <div className="user-form__actions">
            <Btn type="submit" variant="primary" size="md" loading={saving} disabled={optionsLoading}>
              {t('users.createUser')}
            </Btn>
          </div>
        </form>
      </LayoutSection>

      {disableTarget && (
        <LayoutSection variant="raised" title={t('users.disableUser')}>
          <p className="user-form__hint">
            {t('users.disableConfirm')} <span className="mono">{disableTarget.name}</span>
          </p>
          <div className="user-form__row user-form__row--full">
            <input
              className="input"
              type="text"
              placeholder={disableTarget.name}
              value={disableConfirmText}
              onChange={(e) => setDisableConfirmText(e.target.value)}
              autoComplete="off"
              aria-label={t('users.disableConfirm')}
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
              {t('users.disableBtn')}
            </Btn>
            <Btn variant="ghost" size="md" onClick={cancelDisable} disabled={disabling}>
              {t('common.cancel')}
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
              placeholder={t('users.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('users.searchLabel')}
            />
          </div>
          <ExportToolbar
            filename="users"
            title={t('users.title')}
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
          title={query.trim() ? t('users.noMatching') : t('users.noUsers')}
          desc={query.trim() ? t('users.trySearch') : t('users.createFirst')}
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

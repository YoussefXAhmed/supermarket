import { useCallback, useEffect, useMemo, useState } from 'react';
import AccessibleLink from '../../components/auth/AccessibleLink';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Badge,
  Btn,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PageLoading,
  Table,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { useNotify } from '../../context/NotificationContext';
import {
  OPERATIONAL_USER_TEMPLATES,
  TEMPLATE_IDS,
  getTemplateById,
  validateProvisioningInput,
} from '../../auth/operationalUserTemplates';
import {
  createEmployee,
  linkEmployeeToUser,
  listEmployees,
  listBranches,
  listActiveEmployeesForReportsTo,
  setEmployeeStatus,
  updateEmployee,
} from '../../services/hrEmployeeApi';
import {
  disableOperationalUser,
  getDefaultCompany,
  getPriceLists,
  listWarehousesForProvisioning,
  provisionOperationalUser,
} from '../../services/userManagementApi';
import { updateUser } from '../../services/api';
import {
  EMPLOYMENT_STATUS,
  employmentStatusLabel,
} from '../../utils/hrEmployees';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const EMPTY_FORM = {
  employee_id: '',
  full_name: '',
  phone: '',
  national_id: '',
  address: '',
  department: '',
  position: '',
  // Batch B additions — branch (warehouse), direct manager, gender, DOB.
  branch: '',
  reports_to: '',
  gender: '',
  date_of_birth: '',
  hire_date: new Date().toISOString().slice(0, 10),
  employment_status: EMPLOYMENT_STATUS.ACTIVE,
  has_system_access: false,
  email: '',
  company: '',
};

function statusBadge(status, t) {
  const color =
    status === EMPLOYMENT_STATUS.ACTIVE
      ? 'green'
      : status === EMPLOYMENT_STATUS.SUSPENDED
        ? 'amber'
        : 'red';
  return <Badge color={color}>{employmentStatusLabel(status, t)}</Badge>;
}

export default function EmployeesPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { canManageEmployees } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const [provisionTarget, setProvisionTarget] = useState(null);
  const [provisionForm, setProvisionForm] = useState({
    templateId: 'cashier',
    email: '',
    warehouses: [],
    priceList: '',
    company: '',
    send_welcome_email: true,
  });
  const [warehouses, setWarehouses] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [provisioning, setProvisioning] = useState(false);

  // Batch B — branch filter + form-side picklists.
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState([]);
  const [reportsToOptions, setReportsToOptions] = useState([]);

  const hrTemplates = useMemo(
    () => TEMPLATE_IDS.filter((id) => id !== 'hr_officer').map((id) => OPERATIONAL_USER_TEMPLATES[id]),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listEmployees({
        limit: 500,
        branch: branchFilter || undefined,
        search: query.trim() || undefined,
      }));
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, t('hr.employees.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t, branchFilter, query]);

  // Branch + Reports To picklists — fetched once. Stored in module-level
  // state so they survive list reloads without re-fetching every time.
  useEffect(() => {
    listBranches().then(setBranches).catch(() => setBranches([]));
    listActiveEmployeesForReportsTo().then(setReportsToOptions).catch(() => setReportsToOptions([]));
  }, []);

  const loadProvisionOptions = useCallback(async () => {
    try {
      const [whRes, plRes, company] = await Promise.all([
        listWarehousesForProvisioning({ limit: 200 }),
        getPriceLists(),
        getDefaultCompany(),
      ]);
      setWarehouses((whRes.data?.data || []).filter((w) => !w.is_group));
      setPriceLists(plRes.data?.data || []);
      setProvisionForm((f) => ({ ...f, company: f.company || company || '' }));
    } catch {
      setWarehouses([]);
      setPriceLists([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadProvisionOptions();
  }, [load, loadProvisionOptions]);

  // Backend already filters by branch + search, so the client-side filter
  // is just a final substring pass that includes national_id (so a quick
  // refine on the loaded set still works without re-hitting the server).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name?.toLowerCase().includes(q) ||
        r.employee_id?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.position?.toLowerCase().includes(q) ||
        r.national_id?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, company: provisionForm.company || '' });
    setFormErr('');
    setModal({ mode: 'create' });
  };

  const openEdit = (row) => {
    setForm({
      employee_id: row.employee_id || '',
      full_name: row.full_name || '',
      phone: row.phone || '',
      national_id: row.national_id || '',
      address: row.address || '',
      department: row.department || '',
      position: row.position || '',
      branch: row.branch || '',
      reports_to: row.reports_to || '',
      gender: row.gender || '',
      date_of_birth: row.date_of_birth || '',
      hire_date: row.hire_date || new Date().toISOString().slice(0, 10),
      employment_status: row.employment_status || EMPLOYMENT_STATUS.ACTIVE,
      has_system_access: row.has_system_access,
      email: row.email || row.system_user_id || '',
      company: row.company || '',
    });
    setFormErr('');
    setModal({ mode: 'edit', id: row.id, row });
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setFormErr('');
  };

  const saveEmployee = async (e) => {
    e.preventDefault();
    if (!canManageEmployees || saving) return;
    if (!form.full_name?.trim()) {
      setFormErr(t('hr.employees.nameRequired'));
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      let saved;
      if (modal?.mode === 'edit' && modal.id) {
        saved = await updateEmployee(modal.id, form);
      } else {
        saved = await createEmployee(form);
      }
      await load();
      closeModal();
      if (form.has_system_access && !saved.has_system_access && form.email?.trim()) {
        setProvisionTarget(saved);
        setProvisionForm((f) => ({
          ...f,
          email: form.email.trim(),
        }));
      }
    } catch (err) {
      setFormErr(getUserFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deactivateEmployee = (row, status) => {
    if (!canManageEmployees) return;
    setStatusTarget({ row, status });
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    const { row, status } = statusTarget;
    setStatusBusy(true);
    try {
      await setEmployeeStatus(row.id, status);
      if (row.has_system_access && row.system_user_id) {
        try {
          await disableOperationalUser(row.system_user_id);
        } catch {
          /* user may already be disabled */
        }
      }
      setStatusTarget(null);
      await load();
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setStatusBusy(false);
    }
  };

  const runProvision = async (e) => {
    e.preventDefault();
    if (!provisionTarget || provisioning) return;
    const template = getTemplateById(provisionForm.templateId);
    const validation = validateProvisioningInput(provisionForm.templateId, {
      warehouses: provisionForm.warehouses,
      priceList: provisionForm.priceList,
      company: provisionForm.company,
    });
    if (!validation.valid) {
      setFormErr(validation.error);
      return;
    }
    const email = provisionTarget.email || form.email || provisionForm.email;
    if (!email?.trim()) {
      setFormErr(t('hr.employees.emailRequiredForAccess'));
      return;
    }
    setProvisioning(true);
    setFormErr('');
    try {
      const result = await provisionOperationalUser({
        templateId: provisionForm.templateId,
        email: email.trim(),
        first_name: provisionTarget.full_name,
        warehouses: provisionForm.warehouses,
        priceList: provisionForm.priceList,
        company: provisionForm.company,
        send_welcome_email: provisionForm.send_welcome_email,
      });
      await linkEmployeeToUser(provisionTarget.id, result.username);
      setProvisionTarget(null);
      await load();
    } catch (err) {
      setFormErr(getUserFriendlyMessage(err));
    } finally {
      setProvisioning(false);
    }
  };

  const sendWelcomeEmail = async (row) => {
    if (!row.system_user_id) return;
    try {
      await updateUser(row.system_user_id, { send_welcome_email: 1 });
      notify.success(t('hr.employees.welcomeEmailSent'));
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setError(msg);
      notify.error(msg);
    }
  };

  const columns = [
    { key: 'employee_id', label: t('hr.employees.colId') },
    { key: 'full_name', label: t('hr.employees.colName') },
    { key: 'department', label: t('hr.employees.colDepartment') },
    { key: 'position', label: t('hr.employees.colPosition') },
    {
      key: 'branch',
      label: t('hr.employees.colBranch', { defaultValue: 'Branch' }),
      render: (_value, row) =>
        row.branch ? (
          <Badge color="default">{row.branch}</Badge>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>—</span>
        ),
    },
    {
      key: 'employment_status',
      label: t('hr.employees.colStatus'),
      render: (_value, row) => statusBadge(row.employment_status, t),
    },
    {
      key: 'access',
      label: t('hr.employees.colAccess'),
      render: (_value, row) =>
        row.has_system_access ? (
          <Badge color="blue">{t('hr.employees.hasAccess')}</Badge>
        ) : (
          <Badge color="default">{t('hr.employees.noAccess')}</Badge>
        ),
    },
    {
      key: 'actions',
      label: t('ui.table.actions'),
      render: (_value, row) => (
        <div className="table-actions">
          {canManageEmployees && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => openEdit(row)}>
                {t('common.edit')}
              </Btn>
              {!row.has_system_access && row.employment_status === EMPLOYMENT_STATUS.ACTIVE && (
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setProvisionTarget(row);
                    setProvisionForm((f) => ({
                      ...f,
                      email: row.email || row.system_user_id || '',
                    }));
                  }}
                >
                  {t('hr.employees.grantAccess')}
                </Btn>
              )}
              {row.has_system_access && (
                <Btn variant="ghost" size="sm" onClick={() => sendWelcomeEmail(row)}>
                  {t('hr.employees.resetPassword')}
                </Btn>
              )}
              {row.employment_status === EMPLOYMENT_STATUS.ACTIVE && (
                <Btn variant="ghost" size="sm" onClick={() => deactivateEmployee(row, EMPLOYMENT_STATUS.SUSPENDED)}>
                  {t('hr.employees.suspend')}
                </Btn>
              )}
              {row.employment_status !== EMPLOYMENT_STATUS.RESIGNED && (
                <Btn variant="ghost" size="sm" onClick={() => deactivateEmployee(row, EMPLOYMENT_STATUS.RESIGNED)}>
                  {t('hr.employees.deactivate')}
                </Btn>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <TablePageLayout>
      <PageHeader
        title={t('hr.employees.title')}
        subtitle={t('hr.employees.subtitle')}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={load} disabled={loading}>
              {t('common.refresh')}
            </Btn>
            {canManageEmployees && (
              <Btn variant="primary" size="sm" onClick={openCreate}>
                {t('hr.employees.add')}
              </Btn>
            )}
          </>
        }
      />

      <LayoutSection variant="flat">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder={t('hr.employees.search', { defaultValue: 'Search by name, ID, national ID or phone…' })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 200 }}
            aria-label={t('hr.employees.search', { defaultValue: 'Search' })}
          />
          <select
            className="input"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            aria-label={t('hr.employees.branchFilter', { defaultValue: 'Branch' })}
            style={{ maxWidth: 220 }}
          >
            <option value="">{t('hr.employees.allBranches', { defaultValue: 'All branches' })}</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>
            ))}
          </select>
        </div>
      </LayoutSection>

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard message={error} onRetry={load} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon="👥" title={t('hr.employees.empty')} desc={t('hr.employees.emptyDesc')} />
      )}
      {!loading && !error && filtered.length > 0 && (
        <LayoutSection variant="raised" flushHead>
          <Table columns={columns} data={filtered} />
        </LayoutSection>
      )}

      {modal && (
        <div className="modal-overlay" role="presentation" onClick={closeModal}>
          <div className="modal card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{modal.mode === 'edit' ? t('hr.employees.editTitle') : t('hr.employees.addTitle')}</h2>
            <form className="form-stack" onSubmit={saveEmployee}>
              <label>
                {t('hr.employees.colId')}
                <input className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.colName')} *
                <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.phone')}
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.nationalId')}
                <input className="input" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.address')}
                <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.colDepartment')}
                <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.colPosition')}
                <input className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.branch', { defaultValue: 'Branch (Warehouse)' })}
                <select
                  className="input"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                >
                  <option value="">{t('hr.employees.noBranch', { defaultValue: '— Unassigned —' })}</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.warehouse_name || b.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('hr.employees.reportsTo', { defaultValue: 'Reports to' })}
                <select
                  className="input"
                  value={form.reports_to}
                  onChange={(e) => setForm({ ...form, reports_to: e.target.value })}
                >
                  <option value="">{t('hr.employees.noManager', { defaultValue: '— None —' })}</option>
                  {reportsToOptions
                    .filter((e) => !modal || e.name !== modal.id)
                    .map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.employee_name || e.name}{e.department ? ` · ${e.department}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t('hr.employees.gender', { defaultValue: 'Gender' })}
                <select
                  className="input"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">{t('hr.employees.genderNone', { defaultValue: '— Not specified —' })}</option>
                  <option value="Male">{t('hr.employees.male', { defaultValue: 'Male' })}</option>
                  <option value="Female">{t('hr.employees.female', { defaultValue: 'Female' })}</option>
                </select>
              </label>
              <label>
                {t('hr.employees.dateOfBirth', { defaultValue: 'Date of birth' })}
                <input
                  type="date"
                  className="input"
                  value={form.date_of_birth || ''}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
              </label>
              <label>
                {t('hr.employees.hireDate')}
                <input type="date" className="input" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
              </label>
              <label>
                {t('hr.employees.colStatus')}
                <select className="input" value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })}>
                  <option value={EMPLOYMENT_STATUS.ACTIVE}>{employmentStatusLabel(EMPLOYMENT_STATUS.ACTIVE, t)}</option>
                  <option value={EMPLOYMENT_STATUS.SUSPENDED}>{employmentStatusLabel(EMPLOYMENT_STATUS.SUSPENDED, t)}</option>
                  <option value={EMPLOYMENT_STATUS.RESIGNED}>{employmentStatusLabel(EMPLOYMENT_STATUS.RESIGNED, t)}</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.has_system_access}
                  onChange={(e) => setForm({ ...form, has_system_access: e.target.checked })}
                />
                {t('hr.employees.systemAccessToggle')}
              </label>
              {form.has_system_access && (
                <label>
                  {t('hr.employees.workEmail')}
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </label>
              )}
              {formErr && <p className="login-error">{formErr}</p>}
              <div className="modal__actions">
                <Btn type="button" variant="ghost" onClick={closeModal} disabled={saving}>
                  {t('common.cancel')}
                </Btn>
                <Btn type="submit" variant="primary" loading={saving} disabled={!canManageEmployees}>
                  {t('common.save')}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {provisionTarget && (
        <div className="modal-overlay" role="presentation" onClick={() => !provisioning && setProvisionTarget(null)}>
          <div className="modal card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{t('hr.employees.provisionTitle')}</h2>
            <p className="page-header__sub">
              {t('hr.employees.provisionDesc', { name: provisionTarget.full_name })}
            </p>
            <form className="form-stack" onSubmit={runProvision}>
              <label>
                {t('hr.employees.workEmail')} *
                <input
                  className="input"
                  required
                  type="email"
                  value={provisionForm.email || provisionTarget.email || ''}
                  onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })}
                />
              </label>
              <label>
                {t('hr.employees.roleProfile')}
                <select
                  className="input"
                  value={provisionForm.templateId}
                  onChange={(e) => setProvisionForm({ ...provisionForm, templateId: e.target.value })}
                >
                  {hrTemplates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>{tmpl.label}</option>
                  ))}
                </select>
              </label>
              {getTemplateById(provisionForm.templateId)?.requiresPriceList && (
                <label>
                  {t('hr.employees.priceList')}
                  <select className="input" value={provisionForm.priceList} onChange={(e) => setProvisionForm({ ...provisionForm, priceList: e.target.value })}>
                    <option value="">{t('common.select')}</option>
                    {priceLists.map((pl) => (
                      <option key={pl.name} value={pl.name}>{pl.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {t('hr.employees.warehouses')}
                <select
                  multiple
                  className="input"
                  value={provisionForm.warehouses}
                  onChange={(e) =>
                    setProvisionForm({
                      ...provisionForm,
                      warehouses: [...e.target.selectedOptions].map((o) => o.value),
                    })
                  }
                >
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={provisionForm.send_welcome_email}
                  onChange={(e) => setProvisionForm({ ...provisionForm, send_welcome_email: e.target.checked })}
                />
                {t('hr.employees.sendWelcomeEmail')}
              </label>
              {formErr && <p className="login-error">{formErr}</p>}
              <div className="modal__actions">
                <Btn type="button" variant="ghost" onClick={() => setProvisionTarget(null)} disabled={provisioning}>
                  {t('common.cancel')}
                </Btn>
                <Btn type="submit" variant="primary" loading={provisioning}>
                  {t('hr.employees.createAccount')}
                </Btn>
              </div>
            </form>
            <p className="page-header__sub">
              <AccessibleLink to="/hr/users">{t('nav.systemUsers')}</AccessibleLink>
            </p>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!statusTarget}
        title={t('hr.employees.confirmStatusTitle', { defaultValue: 'Update employee status' })}
        message={statusTarget ? t('hr.employees.confirmStatus', { name: statusTarget.row.full_name }) : ''}
        confirmLabel={t('common.confirm', { defaultValue: 'Confirm' })}
        variant="danger"
        loading={statusBusy}
        onCancel={() => !statusBusy && setStatusTarget(null)}
        onConfirm={confirmStatusChange}
      />
    </TablePageLayout>
  );
}

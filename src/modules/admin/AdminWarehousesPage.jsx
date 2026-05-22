import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useNotify } from '../../context/NotificationContext';
import {
  assessWarehouseDeletion,
  createWarehouse,
  deleteWarehouseSafe,
  getWarehouseFormOptions,
  listWarehousesForAdmin,
  setWarehouseDisabled,
  updateWarehouse,
} from '../../services/warehouseAdminService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const EMPTY_FORM = {
  warehouse_name: '',
  company: '',
  parent_warehouse: '',
  warehouse_type: 'Stores',
  is_group: false,
  disabled: false,
};

export default function AdminWarehousesPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [options, setOptions] = useState({
    companies: [],
    parentOptions: [],
    warehouseTypes: [],
    defaultCompany: '',
  });
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAssessment, setDeleteAssessment] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const EXPORT_COLUMNS = [
    { key: 'warehouse_name', label: t('warehouses.name') },
    { key: 'name', label: t('warehouses.erpId') },
    { key: 'company', label: t('warehouses.company') },
    { key: 'warehouse_type', label: t('warehouses.type') },
    { key: 'parent_warehouse', label: t('warehouses.parentCol') },
    { key: 'disabled', label: t('erp.status.disabled') },
    { key: 'stock_qty', label: t('warehouses.stockQty') },
  ];

  const statusBadge = (row) => {
    if (row.disabled) return <Badge color="red">{t('erp.status.disabled')}</Badge>;
    if (row.is_group) return <Badge color="blue">{t('warehouses.group')}</Badge>;
    return <Badge color="green">{t('erp.status.active')}</Badge>;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listWarehousesForAdmin({ includeStockSummary: true });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, t('warehouses.failedLoad')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const opts = await getWarehouseFormOptions();
      setOptions(opts);
    } catch {
      setOptions({
        companies: [],
        parentOptions: [],
        warehouseTypes: ['Stores', 'Transit'],
        defaultCompany: '',
      });
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  const companies = useMemo(() => {
    const set = new Set(rows.map((r) => r.company).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const types = useMemo(() => {
    const set = new Set(rows.map((r) => r.warehouse_type).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (companyFilter !== 'all' && row.company !== companyFilter) return false;
      if (typeFilter !== 'all' && (row.warehouse_type || '') !== typeFilter) return false;
      if (statusFilter === 'active' && (row.disabled || row.is_group)) return false;
      if (statusFilter === 'disabled' && !row.disabled) return false;
      if (statusFilter === 'groups' && !row.is_group) return false;
      if (!text) return true;
      const hay = [
        row.warehouse_name,
        row.name,
        row.company,
        row.warehouse_type,
        row.parent_warehouse,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(text);
    });
  }, [rows, query, companyFilter, typeFilter, statusFilter]);

  const openCreate = () => {
    setFormMode('create');
    setEditingId('');
    setForm({
      ...EMPTY_FORM,
      company: options.defaultCompany || '',
      warehouse_type: options.warehouseTypes[0] || 'Stores',
    });
  };

  const openEdit = (row) => {
    setFormMode('edit');
    setEditingId(row.name);
    setForm({
      warehouse_name: row.warehouse_name,
      company: row.company,
      parent_warehouse: row.parent_warehouse || '',
      warehouse_type: row.warehouse_type || 'Stores',
      is_group: row.is_group,
      disabled: row.disabled,
    });
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId('');
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (formMode === 'create') {
        const created = await createWarehouse(form);
        notify.success(`"${created.warehouse_name}" ${t('erp.status.submitted').toLowerCase()}`);
      } else if (formMode === 'edit' && editingId) {
        const updated = await updateWarehouse(editingId, {
          warehouse_name: form.warehouse_name,
          warehouse_type: form.warehouse_type,
          parent_warehouse: form.parent_warehouse,
          disabled: form.disabled,
          is_group: form.is_group,
        });
        notify.success(`"${updated.warehouse_name}" ${t('common.save').toLowerCase()}`);
      }
      closeForm();
      await load();
      await loadOptions();
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDisabled = async (row) => {
    const next = !row.disabled;
    const label = next ? t('warehouses.disableWarehouse') : t('warehouses.enableWarehouse');
    if (!window.confirm(`${label} "${row.warehouse_name}"?`)) return;
    try {
      await setWarehouseDisabled(row.name, next);
      notify.success(`${row.warehouse_name} — ${label}`);
      await load();
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
    }
  };

  const openDelete = async (row) => {
    setDeleteTarget(row);
    setDeleteAssessment(null);
    setDeleteLoading(true);
    try {
      const assessment = await assessWarehouseDeletion(row.name);
      setDeleteAssessment(assessment);
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    setDeleteAssessment(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteAssessment?.deletable || deleting) return;
    setDeleting(true);
    try {
      await deleteWarehouseSafe(deleteTarget.name);
      notify.success(`"${deleteTarget.warehouse_name}" ${t('warehouses.deleteWarehouse').toLowerCase()}`);
      cancelDelete();
      await load();
      await loadOptions();
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'warehouse_name',
      label: t('warehouses.name'),
      render: (v, row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{v || row.name}</p>
          <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{row.name}</p>
        </div>
      ),
    },
    { key: 'company', label: t('warehouses.company') },
    { key: 'parent_warehouse', label: t('warehouses.parentCol'), render: (v) => v || '—' },
    { key: 'warehouse_type', label: t('warehouses.type'), render: (v) => v || '—' },
    {
      key: 'status',
      label: t('warehouses.status'),
      render: (_, row) => statusBadge(row),
    },
    {
      key: 'stock_qty',
      label: t('warehouses.stockQty'),
      render: (v) => (
        <span className="mono">{v != null ? Number(v).toFixed(2) : '—'}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <Btn type="button" size="sm" variant="ghost" onClick={() => openEdit(row)}>
            {t('common.edit')}
          </Btn>
          <Btn type="button" size="sm" variant="ghost" onClick={() => handleToggleDisabled(row)}>
            {row.disabled ? t('warehouses.enableWarehouse') : t('warehouses.disableWarehouse')}
          </Btn>
          <Btn type="button" size="sm" variant="danger" onClick={() => openDelete(row)}>
            {t('common.remove')}
          </Btn>
        </div>
      ),
    },
  ];

  const sparse = filtered.length > 0 && filtered.length <= 5;
  const layoutClass = ['page-layout--list-page', sparse ? 'page-layout--table-fit-relaxed' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <AdminPageLayout className={layoutClass}>
      <PageHeader
        title={t('warehouses.title')}
        subtitle={t('warehouses.subtitle')}
        dense
        actions={(
          <Btn variant="primary" size="sm" onClick={openCreate} disabled={optionsLoading}>
            + {t('warehouses.addWarehouse')}
          </Btn>
        )}
      />

      {formMode && (
        <LayoutSection
          variant="raised"
          title={formMode === 'create' ? t('warehouses.createWarehouse') : t('warehouses.editWarehouse')}
        >
          <form className="user-form" onSubmit={handleSubmit}>
            <div className="user-form__row user-form__row--full">
              <label className="user-form__label">
                {t('warehouses.warehouseName')}
                <input
                  className="input"
                  value={form.warehouse_name}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_name: e.target.value }))}
                  required
                  disabled={saving}
                />
              </label>
            </div>
            {formMode === 'create' && (
              <div className="user-form__row">
                <label className="user-form__label">
                  {t('warehouses.company')}
                  <select
                    className="input"
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    required
                    disabled={saving || optionsLoading}
                  >
                    <option value="">{t('purchasing.selectSupplier')}</option>
                    {options.companies.map((c) => (
                      <option key={c.name} value={c.name}>{c.company_name || c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="user-form__row">
              <label className="user-form__label">
                {t('warehouses.parent')}
                <select
                  className="input"
                  value={form.parent_warehouse}
                  onChange={(e) => setForm((f) => ({ ...f, parent_warehouse: e.target.value }))}
                  disabled={saving || optionsLoading}
                >
                  <option value="">—</option>
                  {options.parentOptions
                    .filter((w) => w.name !== editingId)
                    .map((w) => (
                      <option key={w.name} value={w.name}>
                        {w.warehouse_name || w.name}
                        {w.is_group ? ` (${t('warehouses.group')})` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="user-form__label">
                {t('warehouses.type')}
                <select
                  className="input"
                  value={form.warehouse_type}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_type: e.target.value }))}
                  disabled={saving}
                >
                  {[...new Set([...(options.warehouseTypes || []), form.warehouse_type].filter(Boolean))].map(
                    (wt) => (
                      <option key={wt} value={wt}>{wt}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label className="user-form__checkbox">
              <input
                type="checkbox"
                checked={form.is_group}
                onChange={(e) => setForm((f) => ({ ...f, is_group: e.target.checked }))}
                disabled={saving || formMode === 'edit'}
              />
              {t('warehouses.isGroup')}
            </label>
            <label className="user-form__checkbox">
              <input
                type="checkbox"
                checked={form.disabled}
                onChange={(e) => setForm((f) => ({ ...f, disabled: e.target.checked }))}
                disabled={saving}
              />
              {t('warehouses.disabled')}
            </label>
            <div className="user-form__actions">
              <Btn type="submit" variant="primary" size="md" loading={saving}>
                {formMode === 'create' ? t('warehouses.createWarehouse') : t('warehouses.saveWarehouse')}
              </Btn>
              <Btn type="button" variant="ghost" size="md" onClick={closeForm} disabled={saving}>
                {t('common.cancel')}
              </Btn>
            </div>
          </form>
        </LayoutSection>
      )}

      {deleteTarget && (
        <LayoutSection variant="raised" title={t('warehouses.deleteWarehouse')}>
          {deleteLoading ? (
            <PageLoading size={22} />
          ) : deleteAssessment ? (
            <>
              <p className="user-form__hint">
                <strong>{deleteTarget.warehouse_name}</strong>{' '}
                <span className="mono">({deleteTarget.name})</span>
              </p>
              {deleteAssessment.deletable ? (
                <p className="user-form__hint">{t('warehouses.noStock')}</p>
              ) : (
                <div>
                  <ul className="partial-data-banner__list">
                    {deleteAssessment.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="user-form__actions">
                {deleteAssessment.deletable ? (
                  <Btn
                    type="button"
                    variant="danger"
                    size="md"
                    loading={deleting}
                    onClick={confirmDelete}
                  >
                    {t('warehouses.deleteWarehouse')}
                  </Btn>
                ) : null}
                <Btn type="button" variant="ghost" size="md" onClick={cancelDelete} disabled={deleting}>
                  {t('common.cancel')}
                </Btn>
              </div>
            </>
          ) : null}
        </LayoutSection>
      )}

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-md"
              type="search"
              placeholder={t('warehouses.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('warehouses.searchPlaceholder')}
            />
            <select
              className="input toolbar__input-fixed"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label={t('warehouses.allCompanies')}
            >
              <option value="all">{t('warehouses.allCompanies')}</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="input toolbar__input-fixed"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label={t('warehouses.allTypes')}
            >
              <option value="all">{t('warehouses.allTypes')}</option>
              {types.map((wt) => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>
            <select
              className="input toolbar__input-fixed"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('warehouses.allStatuses')}
            >
              <option value="all">{t('warehouses.allStatuses')}</option>
              <option value="active">{t('warehouses.active')}</option>
              <option value="disabled">{t('erp.status.disabled')}</option>
              <option value="groups">{t('warehouses.group')}</option>
            </select>
          </div>
          <ExportToolbar
            filename="admin-warehouses"
            title={t('warehouses.title')}
            columns={EXPORT_COLUMNS}
            rows={filtered.map((r) => ({
              ...r,
              disabled: r.disabled ? t('erp.status.disabled') : t('erp.status.active'),
            }))}
            disabled={!filtered.length}
          />
        </div>
      </LayoutSection>

      {error && !loading && <ApiErrorCard message={error} onRetry={load} />}

      {loading ? (
        <PageLoading size={26} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏬"
          title={query.trim() ? t('warehouses.noMatching') : t('warehouses.noWarehouses')}
        />
      ) : (
        <LayoutSection
          variant="raised"
          flushHead
          fit={sparse}
        >
          <TableRegion fit={sparse}>
            <Table columns={columns} data={filtered} compact />
          </TableRegion>
        </LayoutSection>
      )}
    </AdminPageLayout>
  );
}

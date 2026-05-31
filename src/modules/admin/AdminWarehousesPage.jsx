import { useCallback, useEffect, useMemo, useState } from 'react';
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

const EXPORT_COLUMNS = [
  { key: 'warehouse_name', label: 'Warehouse' },
  { key: 'name', label: 'ERP ID' },
  { key: 'company', label: 'Company' },
  { key: 'warehouse_type', label: 'Type' },
  { key: 'parent_warehouse', label: 'Parent' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'stock_qty', label: 'Stock qty' },
];

const EMPTY_FORM = {
  warehouse_name: '',
  company: '',
  parent_warehouse: '',
  warehouse_type: 'Stores',
  is_group: false,
  disabled: false,
};

function statusBadge(row) {
  if (row.disabled) return <Badge color="red">Disabled</Badge>;
  if (row.is_group) return <Badge color="blue">Group</Badge>;
  return <Badge color="green">Active</Badge>;
}

export default function AdminWarehousesPage() {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listWarehousesForAdmin({ includeStockSummary: true });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, 'Failed to load warehouses'));
    } finally {
      setLoading(false);
    }
  }, []);

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
        notify.success(`Warehouse "${created.warehouse_name}" created.`);
      } else if (formMode === 'edit' && editingId) {
        const updated = await updateWarehouse(editingId, {
          warehouse_name: form.warehouse_name,
          warehouse_type: form.warehouse_type,
          parent_warehouse: form.parent_warehouse,
          disabled: form.disabled,
          is_group: form.is_group,
        });
        notify.success(`Warehouse "${updated.warehouse_name}" updated.`);
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
    const action = next ? 'disable' : 'enable';
    if (!window.confirm(`${next ? 'Disable' : 'Enable'} warehouse "${row.warehouse_name}"?`)) return;
    try {
      await setWarehouseDisabled(row.name, next);
      notify.success(`Warehouse ${action}d.`);
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
      notify.success(`Warehouse "${deleteTarget.warehouse_name}" deleted.`);
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
      label: 'Warehouse',
      render: (v, row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{v || row.name}</p>
          <p className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{row.name}</p>
        </div>
      ),
    },
    { key: 'company', label: 'Company' },
    { key: 'parent_warehouse', label: 'Parent', render: (v) => v || '—' },
    { key: 'warehouse_type', label: 'Type', render: (v) => v || '—' },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => statusBadge(row),
    },
    {
      key: 'stock_qty',
      label: 'Stock',
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
            Edit
          </Btn>
          <Btn type="button" size="sm" variant="ghost" onClick={() => handleToggleDisabled(row)}>
            {row.disabled ? 'Enable' : 'Disable'}
          </Btn>
          <Btn type="button" size="sm" variant="danger" onClick={() => openDelete(row)}>
            Delete
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
        title="Warehouses"
        subtitle="Create and manage warehouses"
        dense
        actions={(
          <Btn variant="primary" size="sm" onClick={openCreate} disabled={optionsLoading}>
            + New warehouse
          </Btn>
        )}
      />

      {formMode && (
        <LayoutSection
          variant="raised"
          title={formMode === 'create' ? 'Create warehouse' : 'Edit warehouse'}
        >
          <form className="user-form" onSubmit={handleSubmit}>
            <div className="user-form__row user-form__row--full">
              <label className="user-form__label">
                Warehouse name
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
                  Company
                  <select
                    className="input"
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    required
                    disabled={saving || optionsLoading}
                  >
                    <option value="">Select company…</option>
                    {options.companies.map((c) => (
                      <option key={c.name} value={c.name}>{c.company_name || c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="user-form__row">
              <label className="user-form__label">
                Parent warehouse
                <select
                  className="input"
                  value={form.parent_warehouse}
                  onChange={(e) => setForm((f) => ({ ...f, parent_warehouse: e.target.value }))}
                  disabled={saving || optionsLoading}
                >
                  <option value="">None</option>
                  {options.parentOptions
                    .filter((w) => w.name !== editingId)
                    .map((w) => (
                      <option key={w.name} value={w.name}>
                        {w.warehouse_name || w.name}
                        {w.is_group ? ' (group)' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="user-form__label">
                Warehouse type
                <select
                  className="input"
                  value={form.warehouse_type}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_type: e.target.value }))}
                  disabled={saving}
                >
                  {[...new Set([...(options.warehouseTypes || []), form.warehouse_type].filter(Boolean))].map(
                    (t) => (
                      <option key={t} value={t}>{t}</option>
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
              Is group warehouse (cannot hold stock)
            </label>
            <label className="user-form__checkbox">
              <input
                type="checkbox"
                checked={form.disabled}
                onChange={(e) => setForm((f) => ({ ...f, disabled: e.target.checked }))}
                disabled={saving}
              />
              Disabled (archive — blocks new transactions)
            </label>
            <div className="user-form__actions">
              <Btn type="submit" variant="primary" size="md" loading={saving}>
                {formMode === 'create' ? 'Create warehouse' : 'Save changes'}
              </Btn>
              <Btn type="button" variant="ghost" size="md" onClick={closeForm} disabled={saving}>
                Cancel
              </Btn>
            </div>
          </form>
        </LayoutSection>
      )}

      {deleteTarget && (
        <LayoutSection variant="raised" title="Delete warehouse">
          {deleteLoading ? (
            <PageLoading size={22} />
          ) : deleteAssessment ? (
            <>
              <p className="user-form__hint">
                <strong>{deleteTarget.warehouse_name}</strong>
                {' '}
                <span className="mono">({deleteTarget.name})</span>
              </p>
              {deleteAssessment.deletable ? (
                <p className="user-form__hint">
                  This warehouse has no stock, movement history, or child warehouses. Deletion is permanent.
                </p>
              ) : (
                <div>
                  <p className="inv-warn">Deletion blocked — ERP safety rules:</p>
                  <ul className="partial-data-banner__list">
                    {deleteAssessment.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <p className="user-form__hint">Use <strong>Disable</strong> to archive instead.</p>
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
                    Delete warehouse
                  </Btn>
                ) : null}
                <Btn type="button" variant="ghost" size="md" onClick={cancelDelete} disabled={deleting}>
                  {deleteAssessment.deletable ? 'Cancel' : 'Close'}
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
              placeholder="Search warehouses…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search warehouses"
            />
            <select
              className="input toolbar__input-fixed"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label="Filter by company"
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="input toolbar__input-fixed"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              className="input toolbar__input-fixed"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active leaf</option>
              <option value="disabled">Disabled</option>
              <option value="groups">Groups only</option>
            </select>
          </div>
          <ExportToolbar
            filename="admin-warehouses"
            title="Warehouses"
            columns={EXPORT_COLUMNS}
            rows={filtered.map((r) => ({
              ...r,
              disabled: r.disabled ? 'Yes' : 'No',
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
          title={query.trim() ? 'No matching warehouses' : 'No warehouses found'}
          desc={query.trim() ? 'Try different filters.' : 'Create a warehouse to get started.'}
        />
      ) : (
        <LayoutSection
          title="Warehouse list"
          subtitle={`${filtered.length} warehouse(s)`}
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

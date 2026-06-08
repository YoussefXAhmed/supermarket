import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, PageHeader, PageLoading, StatCard } from '../../components/ui';
import { FormPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getSupplier } from '../../services/purchasingApi';
import { getSupplierBalanceOverview } from '../../services/purchasingService';
import { fetchSupplierApSummary } from '../../services/accountsPayableService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { canExecutePurchasingFinance, canManageSuppliers, canDeleteSuppliers } from '../../auth/navigationConfig';
import { useAuth } from '../../hooks/useAuth';
import { purchasingPath, suppliersPath } from '../../utils/workspacePaths';
import { useNotify } from '../../context/NotificationContext';
import { fmtCurrency, fmtDate } from '../../utils/format';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const showFinanceActions = canExecutePurchasingFinance(capabilities);
  const canManage = canManageSuppliers(capabilities);
  const canDelete = canDeleteSuppliers(capabilities);
  const isNew = id === 'new';
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Load supplier categories (Supplier Group leaves) + Country list for the dropdowns.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { listSupplierGroups, listCountries } = await import('../../services/purchasingApi');
        const [g, c] = await Promise.all([
          listSupplierGroups().catch(() => ({ data: { data: [] } })),
          listCountries().catch(() => ({ data: { data: [] } })),
        ]);
        if (!cancelled) {
          setCategories(g?.data?.data || []);
          setCountries(c?.data?.data || []);
        }
      } catch {
        if (!cancelled) { setCategories([]); setCountries([]); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const { createSupplierGroup, listSupplierGroups } = await import('../../services/purchasingApi');
      await createSupplierGroup(name);
      const r = await listSupplierGroups();
      setCategories(r?.data?.data || []);
      setForm((f) => ({ ...f, supplier_group: name }));
      setNewCategoryName('');
      setNewCategoryOpen(false);
      notify.success(`Category "${name}" created.`);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setCreatingCategory(false);
    }
  };

  // Read-only viewers (Inventory Clerk, Purchasing Officer, Accountant, etc.)
  // can never reach the /new page — bounce them back to the list.
  useEffect(() => {
    if (isNew && !canManage) {
      navigate(suppliersPath(pathname), { replace: true });
    }
  }, [isNew, canManage, navigate, pathname]);
  const [supplier, setSupplier] = useState(null);
  const [balance, setBalance] = useState(null);
  const [form, setForm] = useState({
    supplier_name: '',
    supplier_group: '',
    supplier_type: 'Company',
    country: '',
    mobile_no: '',
    email_id: '',
    website: '',
    tax_id: '',
    payment_terms: '',
    supplier_details: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [apSummary, setApSummary] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (isNew) {
      import('../../services/purchasingApi').then(({ listSupplierGroups }) => {
        listSupplierGroups().then((r) => {
          const g = r?.data?.data?.[0]?.name;
          if (g) setForm((f) => ({ ...f, supplier_group: g }));
        });
      });
      return;
    }
    setLoading(true);
    // Pull AP summary in parallel; failures are non-fatal — the section just won't render.
    fetchSupplierApSummary(id).then(setApSummary).catch(() => setApSummary(null));
    Promise.all([getSupplier(id), getSupplierBalanceOverview(id)])
      .then(([supRes, bal]) => {
        const doc = supRes?.data?.data;
        setSupplier(doc);
        setBalance(bal);
        setForm({
          supplier_name: doc?.supplier_name || '',
          supplier_group: doc?.supplier_group || '',
          supplier_type: doc?.supplier_type || 'Company',
          country: doc?.country || '',
          mobile_no: doc?.mobile_no || '',
          email_id: doc?.email_id || '',
          website: doc?.website || '',
          tax_id: doc?.tax_id || '',
          payment_terms: doc?.payment_terms || '',
          supplier_details: doc?.supplier_details || '',
        });
      })
      .catch((e) => setError(getUserFriendlyMessage(e)))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const handleDelete = async () => {
    if (!canDelete || isNew) return;
    if (deleteConfirm !== id) {
      notify.warning(`Type the supplier ID (${id}) to confirm deletion.`);
      return;
    }
    setDeleting(true);
    try {
      const { deleteSupplier } = await import('../../services/purchasingApi');
      await deleteSupplier(id);
      notify.success(`Supplier ${id} deleted.`);
      navigate(suppliersPath(pathname), { replace: true });
    } catch (e) {
      // Frappe's LinkExistsError + PermissionError both surface here.
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canManage) {
      notify.error('Only Administrator and Store Manager can edit suppliers.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { saveSupplier } = await import('../../services/purchasingApi');
      const saved = await saveSupplier({ name: isNew ? null : id, ...form });
      notify.success(isNew ? `Supplier created: ${saved?.name}` : 'Supplier updated');
      if (isNew && saved?.name) {
        navigate(suppliersPath(pathname, encodeURIComponent(saved.name)), { replace: true });
      }
    } catch (e2) {
      setError(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormPageLayout>
        <PageLoading size={28} />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title={isNew ? 'New supplier' : form.supplier_name || id}
        subtitle={isNew ? 'Create supplier' : `Supplier ${id}`}
        dense
        actions={
          <Link to={suppliersPath(pathname)} className="btn btn--ghost btn--sm">
            ← Back
          </Link>
        }
      />

      {!canManage && !isNew && (
        <p className="empty-inline" style={{ marginBottom: 'var(--space-3)' }}>
          🔒 Read-only — only Administrator and Store Manager can edit suppliers.
        </p>
      )}

      {!isNew && balance && (
        <div className="stats-grid">
          <StatCard label="Total purchased" value={fmt(balance.totalPurchased)} icon="💰" color="accent" />
          {showFinanceActions && (
            <>
              <StatCard label="Outstanding" value={fmt(balance.outstanding)} icon="📋" color="red" />
              <StatCard label="Open invoices" value={balance.openInvoices} icon="🧾" color="blue" />
            </>
          )}
          <StatCard label="Receipts" value={balance.receiptCount} icon="📦" color="green" />
        </div>
      )}

      <LayoutSection variant="raised" title={isNew ? 'Supplier details' : (canManage ? 'Edit supplier' : 'Supplier details')}>
        <form className="inv-form form-region" onSubmit={handleSave}>
          <label>
            Name
            <input
              className="input"
              value={form.supplier_name}
              onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
              required
            />
          </label>
          <label>
            Category
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <select
                className="input"
                value={form.supplier_group}
                onChange={(e) => setForm((f) => ({ ...f, supplier_group: e.target.value }))}
                disabled={!canManage}
                required
                style={{ flex: 1 }}
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
                {form.supplier_group && !categories.some((c) => c.name === form.supplier_group) && (
                  <option value={form.supplier_group}>{form.supplier_group} (current)</option>
                )}
              </select>
              {canManage && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setNewCategoryOpen(true)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  + New
                </button>
              )}
            </div>
          </label>
          {newCategoryOpen && canManage && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                marginTop: -8,
                marginBottom: 8,
              }}
            >
              <input
                className="input"
                placeholder="Category name (e.g. Beverages, Personal Care)"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
                autoFocus
                style={{ flex: 1 }}
              />
              <Btn
                type="button"
                variant="primary"
                size="sm"
                loading={creatingCategory}
                disabled={!newCategoryName.trim()}
                onClick={handleCreateCategory}
              >
                Create
              </Btn>
              <Btn
                type="button"
                variant="ghost"
                size="sm"
                disabled={creatingCategory}
                onClick={() => { setNewCategoryOpen(false); setNewCategoryName(''); }}
              >
                Cancel
              </Btn>
            </div>
          )}
          <label>
            Type
            <select
              className="input"
              value={form.supplier_type}
              onChange={(e) => setForm((f) => ({ ...f, supplier_type: e.target.value }))}
              disabled={!canManage}
            >
              <option>Company</option>
              <option>Individual</option>
              <option>Partnership</option>
            </select>
          </label>
          <label>
            Mobile
            <input
              className="input"
              value={form.mobile_no}
              onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          <label>
            Email
            <input
              className="input"
              type="email"
              value={form.email_id}
              onChange={(e) => setForm((f) => ({ ...f, email_id: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          <label>
            Website
            <input
              className="input"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          <label>
            Tax ID
            <input
              className="input"
              value={form.tax_id}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          <label>
            Country
            <input
              className="input"
              list="supplier-country-options"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
              placeholder="Start typing to search…"
            />
            <datalist id="supplier-country-options">
              {countries.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </label>
          <label>
            Payment terms
            <input
              className="input"
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          <label>
            Notes
            <textarea
              className="input"
              rows={3}
              value={form.supplier_details}
              onChange={(e) => setForm((f) => ({ ...f, supplier_details: e.target.value }))}
              disabled={!canManage}
              readOnly={!canManage}
            />
          </label>
          {canManage && (
            <Btn type="submit" variant="primary" size="md" loading={saving}>
              {isNew ? 'Create supplier' : 'Save changes'}
            </Btn>
          )}
        </form>
        {error && <ApiErrorCard message={error} />}
      </LayoutSection>

      {!isNew && apSummary && (
        <LayoutSection
          variant="raised"
          title={t('purchasing.statement.title')}
          subtitle={t('purchasing.statement.subtitle')}
        >
          <div className="supplier-statement">
            <div className="supplier-statement__kpis">
              <StatCard
                label={t('purchasing.statement.totalPurchases')}
                value={fmtCurrency(
                  (apSummary.outstanding || 0)
                    + (apSummary.recent_payments?.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0) || 0)
                )}
                icon="💼"
                color="default"
                compact
              />
              <StatCard
                label={t('purchasing.statement.totalPaid')}
                value={fmtCurrency(
                  apSummary.recent_payments?.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0) || 0
                )}
                icon="✓"
                color="accent"
                compact
              />
              <StatCard
                label={t('purchasing.statement.outstandingBalance')}
                value={fmtCurrency(apSummary.outstanding || 0)}
                icon="💳"
                color="amber"
                compact
              />
              <StatCard
                label={t('purchasing.statement.overdueBalance')}
                value={fmtCurrency(apSummary.overdue_amount || 0)}
                icon="⏰"
                color="red"
                compact
              />
            </div>
            <dl className="supplier-statement__meta">
              <dt>{t('purchasing.statement.openInvoices')}</dt>
              <dd>{apSummary.open_invoice_count ?? 0}</dd>
              <dt>{t('purchasing.statement.lastPayment')}</dt>
              <dd>
                {apSummary.last_payment ? (
                  <>
                    <strong>{fmtCurrency(apSummary.last_payment.paid_amount)}</strong>
                    {' · '}
                    {fmtDate(apSummary.last_payment.posting_date)}
                    {' · '}
                    <span className="mono" style={{ fontSize: '0.78rem' }}>
                      {apSummary.last_payment.name}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>
                    {t('purchasing.statement.noPaymentsYet')}
                  </span>
                )}
              </dd>
            </dl>
          </div>
        </LayoutSection>
      )}

      {!isNew && balance && (
        <LayoutSection variant="raised" title="Recent documents">
          <p className="page-header__sub">
            Invoices: {balance.recentInvoices.map((i) => i.name).join(', ') || '—'}
          </p>
          <p className="page-header__sub">
            Receipts: {balance.recentReceipts.map((r) => r.name).join(', ') || '—'}
          </p>
          <div className="toolbar">
            <Link
              to={`${purchasingPath('receive')}?supplier=${encodeURIComponent(id)}`}
              className="btn btn--primary btn--sm"
            >
              Receive stock
            </Link>
            {showFinanceActions && (
              <Link
                to={`${purchasingPath('invoices')}?supplier=${encodeURIComponent(id)}`}
                className="btn btn--ghost btn--sm"
              >
                Purchase invoice
              </Link>
            )}
          </div>
        </LayoutSection>
      )}

      {!isNew && canDelete && (
        <LayoutSection variant="raised" title="Danger zone">
          <p className="page-header__sub">
            Permanently delete this supplier. The system will refuse if there
            are any linked purchase receipts, invoices, or payments — disable
            the supplier instead in that case.
          </p>
          <div className="toolbar" style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
            <input
              className="input mono"
              style={{ maxWidth: 280 }}
              placeholder={`Type "${id}" to confirm`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
            <Btn
              variant="danger"
              size="md"
              loading={deleting}
              disabled={deleteConfirm !== id}
              onClick={handleDelete}
            >
              Delete supplier
            </Btn>
          </div>
        </LayoutSection>
      )}
    </FormPageLayout>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, PageHeader, PageLoading, StatCard } from '../../components/ui';
import { FormPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getSupplier } from '../../services/purchasingApi';
import { getSupplierBalanceOverview } from '../../services/purchasingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function SupplierDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
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
  const [msg, setMsg] = useState('');

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

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const { saveSupplier } = await import('../../services/purchasingApi');
      const saved = await saveSupplier({ name: isNew ? null : id, ...form });
      setMsg(isNew ? t('purchasing.supplier.created', { name: saved?.name }) : t('purchasing.supplier.updated'));
      if (isNew && saved?.name) {
        navigate(`/admin/purchasing/suppliers/${encodeURIComponent(saved.name)}`, { replace: true });
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
        title={isNew ? t('purchasing.supplier.newTitle') : form.supplier_name || id}
        subtitle={isNew ? t('purchasing.supplier.createSubtitle') : t('purchasing.supplier.supplierSubtitle', { id })}
        dense
        actions={
          <Link to="/admin/purchasing/suppliers" className="btn btn--ghost btn--sm">
            {t('purchasing.supplier.back')}
          </Link>
        }
      />

      {!isNew && balance && (
        <div className="stats-grid">
          <StatCard label={t('purchasing.supplier.totalPurchased')} value={fmt(balance.totalPurchased)} icon="💰" color="accent" />
          <StatCard label={t('purchasing.supplier.outstanding')} value={fmt(balance.outstanding)} icon="📋" color="red" />
          <StatCard label={t('purchasing.supplier.openInvoices')} value={balance.openInvoices} icon="🧾" color="blue" />
          <StatCard label={t('purchasing.supplier.receipts')} value={balance.receiptCount} icon="📦" color="green" />
        </div>
      )}

      <LayoutSection variant="raised" title={isNew ? t('purchasing.supplier.details') : t('purchasing.supplier.edit')}>
        <form className="inv-form form-region" onSubmit={handleSave}>
          <label>
            {t('purchasing.supplier.name')}
            <input
              className="input"
              value={form.supplier_name}
              onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
              required
            />
          </label>
          <label>
            {t('purchasing.supplier.group')}
            <input
              className="input"
              value={form.supplier_group}
              onChange={(e) => setForm((f) => ({ ...f, supplier_group: e.target.value }))}
              required
            />
          </label>
          <label>
            {t('purchasing.supplier.type')}
            <select
              className="input"
              value={form.supplier_type}
              onChange={(e) => setForm((f) => ({ ...f, supplier_type: e.target.value }))}
            >
              <option value="Company">{t('purchasing.supplier.company')}</option>
              <option value="Individual">{t('purchasing.supplier.individual')}</option>
            </select>
          </label>
          <label>
            {t('purchasing.supplier.mobile')}
            <input
              className="input"
              value={form.mobile_no}
              onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.email')}
            <input
              className="input"
              type="email"
              value={form.email_id}
              onChange={(e) => setForm((f) => ({ ...f, email_id: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.website')}
            <input
              className="input"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.taxId')}
            <input
              className="input"
              value={form.tax_id}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.country')}
            <input
              className="input"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.paymentTerms')}
            <input
              className="input"
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
            />
          </label>
          <label>
            {t('purchasing.supplier.notes')}
            <textarea
              className="input"
              rows={3}
              value={form.supplier_details}
              onChange={(e) => setForm((f) => ({ ...f, supplier_details: e.target.value }))}
            />
          </label>
          <Btn type="submit" variant="primary" size="md" loading={saving}>
            {isNew ? t('purchasing.supplier.create') : t('purchasing.supplier.saveChanges')}
          </Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {error && <ApiErrorCard message={error} />}
      </LayoutSection>

      {!isNew && balance && (
        <LayoutSection variant="raised" title={t('purchasing.supplier.recentDocs')}>
          <p className="page-header__sub">
            {t('purchasing.supplier.invoices')}: {balance.recentInvoices.map((i) => i.name).join(', ') || '—'}
          </p>
          <p className="page-header__sub">
            {t('purchasing.supplier.receipts')}: {balance.recentReceipts.map((r) => r.name).join(', ') || '—'}
          </p>
          <div className="toolbar">
            <Link
              to={`/admin/purchasing/receive?supplier=${encodeURIComponent(id)}`}
              className="btn btn--primary btn--sm"
            >
              {t('purchasing.supplier.receiveStock')}
            </Link>
            <Link
              to={`/admin/purchasing/invoices?supplier=${encodeURIComponent(id)}`}
              className="btn btn--ghost btn--sm"
            >
              {t('purchasing.supplier.purchaseInvoice')}
            </Link>
          </div>
        </LayoutSection>
      )}
    </FormPageLayout>
  );
}

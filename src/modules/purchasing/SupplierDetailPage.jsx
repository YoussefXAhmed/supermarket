import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader, PageLoading, ApiErrorCard, Btn, Badge, StatCard } from '../../components/ui';
import { getSupplier } from '../../services/purchasingApi';
import { getSupplierBalanceOverview } from '../../services/purchasingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n || 0);

export default function SupplierDetailPage() {
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
      setMsg(isNew ? `Created: ${saved?.name}` : 'Supplier updated');
      if (isNew && saved?.name) {
        navigate(`/admin/purchasing/suppliers/${encodeURIComponent(saved.name)}`, { replace: true });
      }
    } catch (e2) {
      setError(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading size={28} />;

  return (
    <div>
      <PageHeader
        title={isNew ? 'New supplier' : form.supplier_name || id}
        subtitle={isNew ? 'Create supplier' : `Supplier ${id}`}
        actions={
          <Link to="/admin/purchasing/suppliers" className="btn btn--ghost btn--sm">← Back</Link>
        }
      />

      {!isNew && balance && (
        <div className="stats-grid">
          <StatCard label="Total purchased" value={fmt(balance.totalPurchased)} icon="💰" color="accent" />
          <StatCard label="Outstanding" value={fmt(balance.outstanding)} icon="📋" color="red" />
          <StatCard label="Open invoices" value={balance.openInvoices} icon="🧾" color="blue" />
          <StatCard label="Receipts" value={balance.receiptCount} icon="📦" color="green" />
        </div>
      )}

      <div className="card panel">
        <form className="inv-form" onSubmit={handleSave}>
          <label>Name <input className="input" value={form.supplier_name} onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))} required /></label>
          <label>Group <input className="input" value={form.supplier_group} onChange={(e) => setForm((f) => ({ ...f, supplier_group: e.target.value }))} required /></label>
          <label>Type
            <select className="input" value={form.supplier_type} onChange={(e) => setForm((f) => ({ ...f, supplier_type: e.target.value }))}>
              <option>Company</option>
              <option>Individual</option>
            </select>
          </label>
          <label>Mobile <input className="input" value={form.mobile_no} onChange={(e) => setForm((f) => ({ ...f, mobile_no: e.target.value }))} /></label>
          <label>Email <input className="input" type="email" value={form.email_id} onChange={(e) => setForm((f) => ({ ...f, email_id: e.target.value }))} /></label>
          <label>Website <input className="input" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></label>
          <label>Tax ID <input className="input" value={form.tax_id} onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))} /></label>
          <label>Country <input className="input" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} /></label>
          <label>Payment terms <input className="input" value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} /></label>
          <label>Notes <textarea className="input" rows={3} value={form.supplier_details} onChange={(e) => setForm((f) => ({ ...f, supplier_details: e.target.value }))} /></label>
          <Btn type="submit" variant="primary" size="md" loading={saving}>{isNew ? 'Create supplier' : 'Save changes'}</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {error && <ApiErrorCard message={error} />}
      </div>

      {!isNew && balance && (
        <div className="card panel">
          <h3 className="section-title">Recent documents</h3>
          <p className="page-header__sub">Invoices: {balance.recentInvoices.map((i) => i.name).join(', ') || '—'}</p>
          <p className="page-header__sub">Receipts: {balance.recentReceipts.map((r) => r.name).join(', ') || '—'}</p>
          <div className="toolbar__group" style={{ marginTop: 12 }}>
            <Link to={`/admin/purchasing/receive?supplier=${encodeURIComponent(id)}`} className="btn btn--primary btn--sm">Receive stock</Link>
            <Link to={`/admin/purchasing/invoices?supplier=${encodeURIComponent(id)}`} className="btn btn--ghost btn--sm">Purchase invoice</Link>
          </div>
        </div>
      )}
    </div>
  );
}

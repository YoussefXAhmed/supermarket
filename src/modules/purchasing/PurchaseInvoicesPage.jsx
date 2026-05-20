import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiErrorCard, Badge, Btn, PageHeader, PageLoading, Table } from '../../components/ui';
import {
  FormPageLayout,
  LayoutSection,
  TablePageLayout,
  TableRegion,
} from '../../components/layout/page-layouts';
import { getCompanies, getItems } from '../../services/api';
import { createAndSubmitPurchaseInvoice, listPurchaseInvoices, listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import CreateInvoiceFromReceiptPanel from '../../components/purchasing/CreateInvoiceFromReceiptPanel';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(n || 0);

const emptyLine = () => ({ item_code: '', qty: '', rate: '' });

export default function PurchaseInvoicesPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('list');
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState(searchParams.get('supplier') || '');
  const [billNo, setBillNo] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const submittingRef = useRef(false);

  const loadList = () => {
    setLoading(true);
    listPurchaseInvoices({ limit: 100 })
      .then((r) => setRows(r?.data?.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadList();
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
    getItems({ limit: 500 }).then((r) => setItems(r?.data?.data || []));
    getCompanies({ limit: 1 }).then((r) => setCompany(r?.data?.data?.[0]?.name || ''));
  }, []);

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const result = await createAndSubmitPurchaseInvoice({
        supplier,
        company,
        lines,
        bill_no: billNo,
      });
      setMsg(`Purchase invoice submitted: ${result.name}`);
      setLines([emptyLine()]);
      setTab('list');
      loadList();
    } catch (e2) {
      setErr(
        e2.draftName
          ? `${getUserFriendlyMessage(e2)} Draft: ${e2.draftName}`
          : getUserFriendlyMessage(e2),
      );
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const columns = [
    { key: 'name', label: 'Invoice', render: (v) => <span className="mono">{v}</span> },
    { key: 'supplier', label: 'Supplier' },
    { key: 'posting_date', label: 'Date' },
    { key: 'grand_total', label: 'Total', render: (v) => fmt(v) },
    { key: 'outstanding_amount', label: 'Outstanding', render: (v) => fmt(v) },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <Badge color={v === 'Paid' ? 'green' : 'amber'}>{v}</Badge>,
    },
  ];

  const sparse = rows.length > 0 && rows.length <= 8;
  const Layout = tab === 'list' ? TablePageLayout : FormPageLayout;

  return (
    <Layout className="page-layout--list-page" tableConstrain={tab === 'list' && sparse}>
      <PageHeader
        title="Purchase invoices"
        subtitle="Supplier payables and bill matching"
        dense
      />

      <LayoutSection variant="flat" flushHead>
        <div className="pos-view-toggle">
          <button
            type="button"
            className={`pos-view-toggle__btn ${tab === 'list' ? 'pos-view-toggle__btn--active' : ''}`}
            onClick={() => setTab('list')}
          >
            History
          </button>
          <button
            type="button"
            className={`pos-view-toggle__btn ${tab === 'new' ? 'pos-view-toggle__btn--active' : ''}`}
            onClick={() => setTab('new')}
          >
            New invoice
          </button>
          <button
            type="button"
            className={`pos-view-toggle__btn ${tab === 'from-receipt' ? 'pos-view-toggle__btn--active' : ''}`}
            onClick={() => setTab('from-receipt')}
          >
            Exceptional billing
          </button>
        </div>
      </LayoutSection>

      {tab === 'list' ? (
        loading ? (
          <PageLoading size={26} />
        ) : (
          <LayoutSection variant="raised" flushHead fit={sparse}>
            <TableRegion fit={sparse}>
              <Table columns={columns} data={rows} compact emptyMsg="No purchase invoices" />
            </TableRegion>
          </LayoutSection>
        )
      ) : tab === 'from-receipt' ? (
        <LayoutSection variant="raised" title="Exceptional billing">
          <CreateInvoiceFromReceiptPanel onSuccess={() => loadList()} />
        </LayoutSection>
      ) : (
        <LayoutSection variant="raised" title="New purchase invoice">
          <form className="inv-form form-region" onSubmit={onSubmit}>
            <label>
              Supplier
              <select
                className="input"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                required
              >
                <option value="">Select</option>
                {suppliers.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.supplier_name || s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supplier bill #
              <input className="input" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </label>
            {lines.map((line, index) => (
              <div key={index} className="recon-line">
                <input
                  className="input"
                  list="pi-items"
                  value={line.item_code}
                  onChange={(e) => updateLine(index, { item_code: e.target.value })}
                  required
                />
                <input
                  className="input"
                  type="number"
                  min="0.001"
                  step="any"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) => updateLine(index, { qty: e.target.value })}
                  required
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                  value={line.rate}
                  onChange={(e) => updateLine(index, { rate: e.target.value })}
                />
              </div>
            ))}
            <datalist id="pi-items">
              {items.map((it) => (
                <option key={it.item_code} value={it.item_code} />
              ))}
            </datalist>
            <Btn type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
              + Line
            </Btn>
            <Btn type="submit" variant="primary" size="md" loading={saving}>
              Submit invoice
            </Btn>
            {msg && <p className="inv-success">{msg}</p>}
            {err && <ApiErrorCard message={err} />}
          </form>
        </LayoutSection>
      )}
    </Layout>
  );
}

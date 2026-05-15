import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader, Btn, ApiErrorCard } from '../../components/ui';
import { FormPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { createAndSubmitPurchaseReceipt, listSuppliers } from '../../services/purchasingApi';
import { listWarehouses } from '../../services/inventoryApi';
import { getItems } from '../../services/api';
import { getCompanies } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const emptyLine = () => ({ item_code: '', qty: '', rate: '', warehouse: '' });

export default function ReceiveStockPage() {
  const [searchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState(searchParams.get('supplier') || '');
  const [warehouse, setWarehouse] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
    listWarehouses({ limit: 200 }).then((r) => {
      const wh = r?.data?.data || [];
      setWarehouses(wh);
      if (wh[0]) setWarehouse(wh[0].name);
    });
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
      const result = await createAndSubmitPurchaseReceipt({
        supplier,
        company,
        warehouse,
        lines: lines.map((l) => ({ ...l, warehouse: l.warehouse || warehouse })),
      });
      setMsg(`Received & submitted: ${result.name} — stock updated in warehouse.`);
      setLines([emptyLine()]);
    } catch (e2) {
      setErr(e2.draftName ? `${getUserFriendlyMessage(e2)} Draft: ${e2.draftName}` : getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  return (
    <FormPageLayout>
      <PageHeader title="Receive stock" subtitle="Purchase Receipt — increases warehouse stock on submit" dense />
      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            Supplier
            <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.name} value={s.name}>{s.supplier_name || s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Receiving warehouse
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
              ))}
            </select>
          </label>
          <p className="page-header__sub" style={{ marginBottom: 12 }}>
            Link receipts to purchase invoices on the{' '}
            <Link to="/admin/purchasing/matching">Invoice matching</Link> page (draft invoice required).
          </p>

          <p className="section-title">Line items</p>
          {lines.map((line, index) => (
            <div key={index} className="recon-line">
              <input
                className="input"
                list="receive-items"
                placeholder="Item code"
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
              {lines.length > 1 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLines((p) => p.filter((_, i) => i !== index))}>Remove</button>
              )}
            </div>
          ))}
          <datalist id="receive-items">{items.map((it) => <option key={it.item_code} value={it.item_code} />)}</datalist>
          <Btn type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>+ Add line</Btn>
          <Btn type="submit" variant="primary" size="md" loading={saving}>Receive &amp; submit</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <ApiErrorCard title="Receive failed" message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}

import { useEffect, useState } from 'react';
import { Btn, PageHeader, ApiErrorCard } from '../../../components/ui';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { createAndSubmitStockReconciliation, getBin, listWarehouses } from '../../../services/inventoryApi';
import { getItems } from '../../../services/api';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

const PURPOSES = [
  { value: 'Stock Reconciliation', label: 'Inventory count / correction' },
  { value: 'Opening Stock', label: 'Opening stock' },
];

export default function ReconciliationPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [purpose, setPurpose] = useState('Stock Reconciliation');
  const [lines, setLines] = useState([{ item_code: '', qty: '', current_qty: null }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    listWarehouses({ limit: 200 }).then((r) => {
      const wh = r?.data?.data || [];
      setWarehouses(wh);
      if (wh[0]) setWarehouse(wh[0].name);
    });
    getItems({ limit: 500 }).then((r) => setItems(r?.data?.data || []));
  }, []);

  const fetchCurrentQty = async (index, itemCode) => {
    if (!itemCode || !warehouse) return;
    try {
      const bin = await getBin(itemCode.trim(), warehouse);
      const current = Number(bin?.actual_qty || 0);
      setLines((prev) => prev.map((row, i) => (i === index ? { ...row, item_code: itemCode, current_qty: current, qty: row.qty || String(current) } : row)));
    } catch {
      setLines((prev) => prev.map((row, i) => (i === index ? { ...row, item_code: itemCode, current_qty: null } : row)));
    }
  };

  const addLine = () => setLines((prev) => [...prev, { item_code: '', qty: '', current_qty: null }]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const wh = warehouses.find((w) => w.name === warehouse);
    if (!wh) {
      setErr('Select a warehouse');
      return;
    }
    const validLines = lines.filter((l) => l.item_code?.trim() && l.qty !== '');
    if (!validLines.length) {
      setErr('Add at least one item with counted quantity');
      return;
    }

    setSaving(true);
    try {
      const name = await createAndSubmitStockReconciliation({
        company: wh.company,
        purpose,
        warehouse,
        items: validLines.map((l) => ({
          item_code: l.item_code.trim(),
          warehouse,
          qty: Number(l.qty),
        })),
      });
      setMsg(`Reconciliation submitted: ${name}`);
      setLines([{ item_code: '', qty: '', current_qty: null }]);
    } catch (e2) {
      setErr(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageLayout>
      <PageHeader title="Stock Reconciliation" subtitle="Damaged goods, counts, and manual stock corrections" dense />
      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            Warehouse
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} required>
              {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
            </select>
          </label>
          <label>
            Purpose
            <select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          <p className="section-title">Counted quantities</p>
          {lines.map((line, index) => (
            <div key={index} className="recon-line">
              <input
                className="input"
                list="recon-items"
                placeholder="Item code"
                value={line.item_code}
                onChange={(e) => fetchCurrentQty(index, e.target.value)}
                required
              />
              <span className="inv-hint">ERP: {line.current_qty != null ? line.current_qty : '—'}</span>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                placeholder="Counted qty"
                value={line.qty}
                onChange={(e) => setLines((prev) => prev.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)))}
                required
              />
              {lines.length > 1 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(index)}>Remove</button>
              )}
            </div>
          ))}
          <datalist id="recon-items">{items.map((it) => <option key={it.item_code} value={it.item_code} />)}</datalist>
          <Btn type="button" variant="ghost" size="sm" onClick={addLine}>+ Add line</Btn>
          <Btn type="submit" variant="primary" size="md" loading={saving}>Submit reconciliation</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <ApiErrorCard message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}

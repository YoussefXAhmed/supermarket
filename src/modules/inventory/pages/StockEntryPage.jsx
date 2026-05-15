import { useEffect, useState } from 'react';
import { Btn, PageHeader, ApiErrorCard } from '../../../components/ui';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { createAndSubmitStockEntry, getBin, listWarehouses } from '../../../services/inventoryApi';
import { getItems } from '../../../services/api';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { availableBinQty } from '../../../utils/inventoryValidation';

const TYPES = ['Material Receipt', 'Material Issue', 'Material Transfer'];

export default function StockEntryPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    stock_entry_type: 'Material Receipt',
    item_code: '',
    qty: '',
    source_warehouse: '',
    target_warehouse: '',
  });
  const [sourceAvail, setSourceAvail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    listWarehouses({ limit: 500 })
      .then((r) => setWarehouses(r?.data?.data || []))
      .catch(() => setWarehouses([]));
    getItems({ limit: 500 })
      .then((r) => setItems(r?.data?.data || []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const loadAvail = async () => {
      if (!form.item_code || !form.source_warehouse) {
        setSourceAvail(null);
        return;
      }
      try {
        const bin = await getBin(form.item_code.trim(), form.source_warehouse);
        setSourceAvail(bin ? availableBinQty(bin) : 0);
      } catch {
        setSourceAvail(null);
      }
    };
    loadAvail();
  }, [form.item_code, form.source_warehouse]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const sourceWarehouse = warehouses.find((w) => w.name === form.source_warehouse);
      const targetWarehouse = warehouses.find((w) => w.name === form.target_warehouse);
      const company = sourceWarehouse?.company || targetWarehouse?.company || warehouses[0]?.company;

      const result = await createAndSubmitStockEntry({
        stock_entry_type: form.stock_entry_type,
        item_code: form.item_code.trim(),
        qty: Number(form.qty),
        company,
        source_warehouse: form.source_warehouse || undefined,
        target_warehouse: form.target_warehouse || undefined,
        sourceQty: sourceAvail,
      });

      setMsg(`Submitted: ${result.name} (stock updated in ERPNext)`);
      setForm((f) => ({ ...f, item_code: '', qty: '' }));
      setSourceAvail(null);
    } catch (e2) {
      if (e2.draftName) {
        setErr(`${getUserFriendlyMessage(e2)} Draft: ${e2.draftName}. Submit or cancel in ERPNext.`);
      } else {
        setErr(getUserFriendlyMessage(e2));
      }
    } finally {
      setSaving(false);
    }
  };

  const needsSource = form.stock_entry_type === 'Material Issue' || form.stock_entry_type === 'Material Transfer';
  const needsTarget = form.stock_entry_type === 'Material Receipt' || form.stock_entry_type === 'Material Transfer';

  return (
    <FormPageLayout>
      <PageHeader title="Stock Entry" subtitle="Create and submit stock movements" dense />

      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            Entry Type
            <select className="input" value={form.stock_entry_type} onChange={(e) => setForm((f) => ({ ...f, stock_entry_type: e.target.value }))}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            Item Code
            <input
              className="input"
              list="stock-entry-items"
              value={form.item_code}
              onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
              required
            />
            <datalist id="stock-entry-items">
              {items.map((it) => (
                <option key={it.item_code || it.name} value={it.item_code}>{it.item_name}</option>
              ))}
            </datalist>
          </label>

          <label>
            Quantity
            <input className="input" type="number" min="0.001" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} required />
          </label>

          {needsSource && (
            <label>
              Source Warehouse
              <select className="input" value={form.source_warehouse} onChange={(e) => setForm((f) => ({ ...f, source_warehouse: e.target.value }))} required>
                <option value="">Select source</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
              {sourceAvail != null && (
                <span className="inv-hint">Available: {sourceAvail.toFixed(2)}</span>
              )}
            </label>
          )}

          {needsTarget && (
            <label>
              Target Warehouse
              <select className="input" value={form.target_warehouse} onChange={(e) => setForm((f) => ({ ...f, target_warehouse: e.target.value }))} required>
                <option value="">Select target</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
            </label>
          )}

          <Btn type="submit" variant="primary" size="md" loading={saving}>
            Create &amp; Submit
          </Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <ApiErrorCard title="Stock entry failed" message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}

import { useEffect, useState } from 'react';
import { Btn, PageHeader } from '../../../components/ui';
import { createStockEntry, listWarehouses } from '../../../services/inventoryApi';
import { getItems } from '../../../services/api';

const TYPES = [
  'Material Receipt',
  'Material Issue',
  'Material Transfer',
];

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

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const sourceWarehouse = warehouses.find((w) => w.name === form.source_warehouse);
      const targetWarehouse = warehouses.find((w) => w.name === form.target_warehouse);
      const payload = {
        stock_entry_type: form.stock_entry_type,
        item_code: form.item_code.trim(),
        qty: Number(form.qty),
        company: sourceWarehouse?.company || targetWarehouse?.company || warehouses[0]?.company,
      };
      if (form.stock_entry_type === 'Material Issue' || form.stock_entry_type === 'Material Transfer') {
        payload.source_warehouse = form.source_warehouse;
      }
      if (form.stock_entry_type === 'Material Receipt' || form.stock_entry_type === 'Material Transfer') {
        payload.target_warehouse = form.target_warehouse;
      }
      const res = await createStockEntry(payload);
      setMsg(`Created: ${res?.data?.data?.name || 'Stock Entry'}`);
      setForm((f) => ({ ...f, item_code: '', qty: '' }));
    } catch (e2) {
      setErr(e2.message || 'Failed to create stock entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Stock Entry" subtitle="Receipt, Issue and Transfer via ERPNext Stock Entry" />
      <div className="card">
        <form className="inv-form" onSubmit={onSubmit}>
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
              placeholder="Select or type item code"
              required
            />
            <datalist id="stock-entry-items">
              {items.map((it) => (
                <option key={it.item_code || it.name} value={it.item_code}>
                  {it.item_name || it.item_code}
                </option>
              ))}
            </datalist>
          </label>

          <label>
            Quantity
            <input className="input" type="number" min="0.001" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} required />
          </label>

          {(form.stock_entry_type === 'Material Issue' || form.stock_entry_type === 'Material Transfer') && (
            <label>
              Source Warehouse
              <select className="input" value={form.source_warehouse} onChange={(e) => setForm((f) => ({ ...f, source_warehouse: e.target.value }))} required>
                <option value="">Select source</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
            </label>
          )}

          {(form.stock_entry_type === 'Material Receipt' || form.stock_entry_type === 'Material Transfer') && (
            <label>
              Target Warehouse
              <select className="input" value={form.target_warehouse} onChange={(e) => setForm((f) => ({ ...f, target_warehouse: e.target.value }))} required>
                <option value="">Select target</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
            </label>
          )}

          <Btn type="submit" variant="primary" size="md" loading={saving}>Create Stock Entry</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <p className="inv-error" style={{ marginTop: 10 }}>{err}</p>}
      </div>
    </div>
  );
}

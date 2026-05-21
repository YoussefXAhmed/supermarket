import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { ApiErrorCard, Btn, PageHeader } from '../../../components/ui';
import { getItems } from '../../../services/api';
import { createAndSubmitStockEntry, listWarehouses } from '../../../services/inventoryApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { getSellableStock } from '../../../services/stockService';

export default function StockTransferPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ item_code: '', qty: '', source_warehouse: '', target_warehouse: '' });
  const [sourceAvail, setSourceAvail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    listWarehouses({ limit: 500 }).then((r) => setWarehouses(r?.data?.data || [])).catch(() => { });
    getItems({ limit: 500 }).then((r) => setItems(r?.data?.data || [])).catch(() => { });
  }, []);

  useEffect(() => {
    if (!form.item_code || !form.source_warehouse) {
      setSourceAvail(null);
      return;
    }
    getSellableStock({ itemCode: form.item_code.trim(), warehouse: form.source_warehouse })
      .then((row) => setSourceAvail(Math.max(0, Number(row?.sellable_qty ?? 0))))
      .catch(() => setSourceAvail(null));
  }, [form.item_code, form.source_warehouse]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const src = warehouses.find((w) => w.name === form.source_warehouse);
      const tgt = warehouses.find((w) => w.name === form.target_warehouse);
      const result = await createAndSubmitStockEntry({
        stock_entry_type: 'Material Transfer',
        item_code: form.item_code.trim(),
        qty: Number(form.qty),
        company: src?.company || tgt?.company,
        source_warehouse: form.source_warehouse,
        target_warehouse: form.target_warehouse,
        sourceQty: sourceAvail,
      });
      setMsg(`Transfer submitted: ${result.name}`);
      setForm({ item_code: '', qty: '', source_warehouse: form.source_warehouse, target_warehouse: form.target_warehouse });
    } catch (e2) {
      setErr(e2.draftName ? `${getUserFriendlyMessage(e2)} Draft: ${e2.draftName}` : getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageLayout>
      <PageHeader title={t('inventory.transfer.title')} subtitle={t('inventory.transfer.subtitle')} dense />
      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            {t('inventory.stockEntry.item')}
            <input className="input" list="transfer-items" value={form.item_code} onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))} required />
            <datalist id="transfer-items">{items.map((it) => <option key={it.item_code} value={it.item_code} />)}</datalist>
          </label>
          <label>{t('inventory.stockEntry.qty')} <input className="input" type="number" min="0.001" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} required /></label>
          <label>
            {t('inventory.transfer.from')}
            <select className="input" value={form.source_warehouse} onChange={(e) => setForm((f) => ({ ...f, source_warehouse: e.target.value }))} required>
              <option value="">{t('inventory.stockEntry.sourceWarehouse')}</option>
              {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
            </select>
            {sourceAvail != null && <span className="inv-hint">{t('inventory.available')}: {sourceAvail.toFixed(2)}</span>}
          </label>
          <label>
            {t('inventory.transfer.to')}
            <select className="input" value={form.target_warehouse} onChange={(e) => setForm((f) => ({ ...f, target_warehouse: e.target.value }))} required>
              <option value="">{t('inventory.stockEntry.targetWarehouse')}</option>
              {warehouses.filter((w) => w.name !== form.source_warehouse).map((w) => (
                <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
              ))}
            </select>
          </label>
          <Btn type="submit" variant="primary" size="md" loading={saving}>{t('inventory.transfer.submit')}</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <ApiErrorCard message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { ApiErrorCard, Btn, PageHeader } from '../../../components/ui';
import { getItems } from '../../../services/api';
import { createAndSubmitStockEntry, listWarehouses } from '../../../services/inventoryApi';
import { getSellableStock } from '../../../services/stockService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { invalidateStockCache } from '../../../utils/stockCache';
import { useInventoryCapabilities } from '../../../hooks/useInventoryCapabilities';
import { useNotify } from '../../../context/NotificationContext';

const ENTRY_TYPES = [
  { value: 'Material Receipt', cap: 'receipt' },
  { value: 'Material Issue', cap: 'issue' },
  { value: 'Material Transfer', cap: 'transfer' },
];

export default function StockEntryPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const {
    canInventoryReceipt,
    canInventoryIssueTransfer,
  } = useInventoryCapabilities();

  const allowedTypes = ENTRY_TYPES.filter((t) => {
    if (t.cap === 'receipt') return canInventoryReceipt;
    return canInventoryIssueTransfer;
  }).map((t) => t.value);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    stock_entry_type: allowedTypes[0] || 'Material Receipt',
    item_code: '',
    qty: '',
    source_warehouse: '',
    target_warehouse: '',
  });
  const [sourceAvail, setSourceAvail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (allowedTypes.length && !allowedTypes.includes(form.stock_entry_type)) {
      setForm((f) => ({ ...f, stock_entry_type: allowedTypes[0] }));
    }
  }, [allowedTypes, form.stock_entry_type]);

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
        const row = await getSellableStock({ itemCode: form.item_code.trim(), warehouse: form.source_warehouse });
        setSourceAvail(Math.max(0, Number(row?.sellable_qty ?? 0)));
      } catch {
        setSourceAvail(null);
      }
    };
    loadAvail();
  }, [form.item_code, form.source_warehouse]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!allowedTypes.includes(form.stock_entry_type)) {
      setErr('You do not have permission for this stock adjustment type.');
      return;
    }
    setErr('');
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

      notify.success(`Approved: ${result.name} — stock updated.`);
      invalidateStockCache({ source: 'stock_entry', name: result.name, warehouse: form.target_warehouse || form.source_warehouse });
      setForm((f) => ({ ...f, item_code: '', qty: '' }));
      setSourceAvail(null);
    } catch (e2) {
      if (e2.draftName) {
        setErr(`${getUserFriendlyMessage(e2)} Draft: ${e2.draftName}. Approve or cancel in admin console.`);
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
      <PageHeader title={t('inventory.stockEntry.title')} subtitle={t('inventory.stockEntry.subtitle')} dense />

      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            {t('inventory.stockEntry.entryType')}
            <select className="input" value={form.stock_entry_type} onChange={(e) => setForm((f) => ({ ...f, stock_entry_type: e.target.value }))}>
              {allowedTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label>
            {t('inventory.stockEntry.itemCode')}
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
            {t('inventory.stockEntry.quantity')}
            <input className="input" type="number" min="0.001" step="any" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} required />
          </label>

          {needsSource && (
            <label>
              {t('inventory.stockEntry.sourceWarehouse')}
              <select className="input" value={form.source_warehouse} onChange={(e) => setForm((f) => ({ ...f, source_warehouse: e.target.value }))} required>
                <option value="">{t('inventory.stockEntry.selectSource')}</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
              {sourceAvail != null && (
                <span className="inv-hint">{t('inventory.available')}: {sourceAvail.toFixed(2)}</span>
              )}
            </label>
          )}

          {needsTarget && (
            <label>
              {t('inventory.stockEntry.targetWarehouse')}
              <select className="input" value={form.target_warehouse} onChange={(e) => setForm((f) => ({ ...f, target_warehouse: e.target.value }))} required>
                <option value="">{t('inventory.stockEntry.selectTarget')}</option>
                {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
              </select>
            </label>
          )}

          <Btn type="submit" variant="primary" size="md" loading={saving}>
            {t('inventory.stockEntry.createSubmit')}
          </Btn>
        </form>
        {err && <ApiErrorCard title={t('inventory.stockEntry.failed')} message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}
